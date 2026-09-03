import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MapId } from '$lib/domain/ids';
import {
	addActivity,
	addSlice,
	addStep,
	addStory,
	createStoryMap,
	moveStory
} from '$lib/domain/story-map';
import type { Story } from '$lib/domain/story-map';
import { buildRetailCommerceMap } from '$lib/seed/retail-commerce';
import * as schema from '../db/schema';
import { DrizzleStoryMapRepository } from './drizzle-story-map-repository';

// Integration test: exercises the repository against a REAL temp SQLite
// file (migrated with the project's committed ./drizzle migrations), not a
// mock. That's the whole point of this port — verifying Drizzle-specific
// behavior (schema.ts's FK/unique-index shape) that a mock can't catch.

const migrationsFolder = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../../drizzle'
);

/** Stories only have a well-defined order within a (stepId, sliceId) scope
 * (see ADR 0005) — this gives both sides of a round-trip comparison the
 * same deterministic ordering so `toEqual` isn't sensitive to insertion
 * order vs. however the repository happens to return rows. */
function canonicalStoryOrder(stories: Story[]): Story[] {
	return [...stories].sort((a, b) => {
		if (a.stepId !== b.stepId) return a.stepId < b.stepId ? -1 : 1;
		const aSlice = a.sliceId ?? '';
		const bSlice = b.sliceId ?? '';
		if (aSlice !== bSlice) return aSlice < bSlice ? -1 : 1;
		return a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0;
	});
}

describe('DrizzleStoryMapRepository', () => {
	let tmpDir: string;
	let client: Database.Database;
	let db: BetterSQLite3Database<typeof schema>;
	let repository: DrizzleStoryMapRepository;

	beforeAll(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'story-map-repo-test-'));
		client = new Database(path.join(tmpDir, 'test.db'));
		client.pragma('foreign_keys = ON');
		db = drizzle(client, { schema });
		migrate(db, { migrationsFolder });
		repository = new DrizzleStoryMapRepository(db);
	});

	afterAll(() => {
		client.close();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	// The `maps.created_at` column stores whole-second unix timestamps (see
	// schema.ts's `integer(..., { mode: 'timestamp' })`), so a `createdAt`
	// with sub-second precision would not round-trip exactly through
	// `toEqual`. Building it pre-truncated keeps the round-trip assertions
	// exact without special-casing `createdAt` in every test.
	function wholeSecondNow(): Date {
		return new Date(Math.floor(Date.now() / 1000) * 1000);
	}

	function buildSampleMap() {
		let map = createStoryMap('Checkout flow', wholeSecondNow());

		const a1 = addActivity(map, 'Browse');
		map = a1.map;
		const a2 = addActivity(map, 'Purchase');
		map = a2.map;

		const s1 = addStep(map, a1.activity.id, 'Search products');
		map = s1.map;
		const s2 = addStep(map, a2.activity.id, 'Enter payment');
		map = s2.map;

		const slice1 = addSlice(map, 'Release 1');
		map = slice1.map;

		const story1 = addStory(map, s1.step.id, 'Keyword search');
		map = story1.map;
		const story2 = addStory(map, s1.step.id, 'Filter by category');
		map = story2.map;
		const story3 = addStory(map, s2.step.id, 'Credit card entry', {
			description: 'Accept Visa/MC/Amex'
		});
		map = story3.map;

		// Slice story2 into Release 1; leave story1 and story3 unsliced (null).
		map = moveStory(map, story2.story.id, s1.step.id, slice1.slice.id, null, null);

		return map;
	}

	it('round-trips a full aggregate: activities, steps, slices, and stories', async () => {
		const map = buildSampleMap();

		const saved = await repository.save(map);
		const loaded = await repository.load(map.id);

		expect(loaded).not.toBeNull();
		// Stories have no single well-defined order across the whole map (rank
		// is only meaningful within a (stepId, sliceId) scope — see ADR 0005),
		// so both sides are normalized to the same canonical order before the
		// deep-equality check; everything else (activities/steps/slices) has
		// exactly one scope each, so their insertion order already equals
		// rank order and needs no normalizing.
		expect({ ...loaded, stories: canonicalStoryOrder(loaded!.stories) }).toEqual({
			...saved,
			stories: canonicalStoryOrder(saved.stories)
		});
	});

	it('preserves rank ordering across save/load', async () => {
		let map = createStoryMap('Ordering test');
		const a = addActivity(map, 'Only activity');
		map = a.map;
		const s = addStep(map, a.activity.id, 'Only step');
		map = s.map;

		const story1 = addStory(map, s.step.id, 'First');
		map = story1.map;
		const story2 = addStory(map, s.step.id, 'Second');
		map = story2.map;
		const story3 = addStory(map, s.step.id, 'Third');
		map = story3.map;

		// Reorder: move "Third" to the front.
		map = moveStory(map, story3.story.id, s.step.id, null, null, story1.story.id);

		await repository.save(map);
		const loaded = await repository.load(map.id);

		expect(loaded!.stories.map((story) => story.title)).toEqual(['Third', 'First', 'Second']);
	});

	it('round-trips a null sliceId (unsliced story)', async () => {
		let map = createStoryMap('Unsliced test');
		const a = addActivity(map, 'Activity');
		map = a.map;
		const s = addStep(map, a.activity.id, 'Step');
		map = s.map;
		const story = addStory(map, s.step.id, 'Unsliced story');
		map = story.map;

		await repository.save(map);
		const loaded = await repository.load(map.id);

		expect(loaded!.stories[0].sliceId).toBeNull();
	});

	it('load() returns null for an id that does not exist', async () => {
		const loaded = await repository.load('00000000-0000-0000-0000-000000000000' as MapId);
		expect(loaded).toBeNull();
	});

	it('listSummaries() lists saved maps without their nested entities', async () => {
		const map = buildSampleMap();
		await repository.save(map);

		const summaries = await repository.listSummaries();
		const summary = summaries.find((s) => s.id === map.id);

		expect(summary).toBeDefined();
		expect(summary!.name).toBe(map.name);
	});

	it('saving the current version twice does not duplicate rows', async () => {
		const map = buildSampleMap();
		const firstSave = await repository.save(map);
		await repository.save(firstSave);

		const loaded = await repository.load(map.id);
		expect(loaded!.stories).toHaveLength(map.stories.length);
		expect(loaded!.activities).toHaveLength(map.activities.length);
	});

	it('rejects a stale save without overwriting the newer change', async () => {
		const map = buildSampleMap();
		await repository.save(map);
		const firstRequest = await repository.load(map.id);
		const staleRequest = await repository.load(map.id);

		await repository.save({ ...firstRequest!, name: 'Saved by first request' });

		await expect(
			repository.save({ ...staleRequest!, name: 'Overwritten by stale request' })
		).rejects.toThrow(/changed since it was loaded/);
		expect((await repository.load(map.id))!.name).toBe('Saved by first request');
	});

	// A1 of documentation/review-2026-09-02.md, as an experiment rather than an
	// argument. ADR 0004 defers the aggregate question as "is whole-map save
	// fast enough?" — a throughput question. This is the contention question,
	// and it is the one that decides whether collaboration is reachable from
	// this shape: two editors, two *different* stories, no overlap of intent.
	//
	// It passes today, which is the finding. The version is per map, so the
	// second writer is rejected even though nothing they touched was changed by
	// the first. Editing is therefore single-writer by construction, not by
	// accident of implementation.
	it('rejects a second editor who changed a different story than the first', async () => {
		const map = buildSampleMap();
		await repository.save(map);

		const alice = (await repository.load(map.id))!;
		const bob = (await repository.load(map.id))!;

		const [first, second] = alice.stories;
		expect(first.id).not.toBe(second.id);

		await repository.save({
			...alice,
			stories: alice.stories.map((s) =>
				s.id === first.id ? { ...s, title: 'Renamed by Alice' } : s
			)
		});

		await expect(
			repository.save({
				...bob,
				stories: bob.stories.map((s) =>
					s.id === second.id ? { ...s, title: 'Renamed by Bob' } : s
				)
			})
		).rejects.toThrow(/changed since it was loaded/);

		// Bob's edit is lost entirely: he has to reload and retype it, even
		// though the two edits could not have conflicted.
		const after = (await repository.load(map.id))!;
		expect(after.stories.find((s) => s.id === first.id)!.title).toBe('Renamed by Alice');
		expect(after.stories.find((s) => s.id === second.id)!.title).toBe(second.title);
	});

	// D2: the schema declared ON DELETE SET NULL for stories.slice_id, and any
	// statement that fired it failed — un-slicing that way reuses the story's
	// sliced-scope rank in the unsliced scope, where the partial unique index
	// rejects it (every scope starts at 'a0'). A raw `DELETE FROM maps` was
	// therefore impossible, which is a poor property for a schema to have.
	//
	// With the action dropped, the two deletes now behave differently, and both
	// are what we want. Note SQLite checks NO ACTION immediately rather than at
	// statement end, so this is not the "cascades cleanly in both cases" the
	// review predicted.
	it('allows a raw DELETE of a map, and refuses one of a slice that still has stories', async () => {
		const map = buildSampleMap();
		await repository.save(map);
		const slice = map.slices[0];

		// Refused, and that is the point: un-slicing is `deleteSlice`'s job in
		// the domain because each story has to be re-ranked into the unsliced
		// scope. The FK now says so loudly instead of letting a raw statement
		// produce a story at a rank that collides.
		expect(() => client.prepare('DELETE FROM slices WHERE id = ?').run(slice.id)).toThrow(
			/FOREIGN KEY constraint failed/
		);

		// Cascades all the way down, which it could not do before.
		expect(() => client.prepare('DELETE FROM maps WHERE id = ?').run(map.id)).not.toThrow();
		expect(await repository.load(map.id)).toBeNull();
		// Scoped to this map's own rows: the harness shares one temp database
		// across the file, so other tests' maps are legitimately still there.
		const remaining = (table: string, column: string, ids: string[]) =>
			ids.length === 0
				? 0
				: (
						client
							.prepare(
								`SELECT count(*) as n FROM ${table} WHERE ${column} IN (${ids.map(() => '?').join(',')})`
							)
							.get(...ids) as { n: number }
					).n;

		const stepIds = map.activities.flatMap((a) => a.steps.map((step) => step.id));
		expect(remaining('stories', 'step_id', stepIds)).toBe(0);
		expect(remaining('steps', 'id', stepIds)).toBe(0);
		expect(remaining('slices', 'map_id', [map.id])).toBe(0);
		expect(remaining('activities', 'map_id', [map.id])).toBe(0);
	});

	// The header calls save() atomic and the version check a lost-update guard;
	// neither property was tested. This is the path D1 used to reach: a domain
	// bug produces a duplicate rank, the unique index rejects the insert
	// mid-rewrite, and everything already deleted in that transaction has to
	// come back.
	it('rolls the whole save back when a child insert fails', async () => {
		const map = buildSampleMap();
		const saved = await repository.save(map);
		const before = (await repository.load(map.id))!;

		// Two stories in the *same* (step, slice) scope — ranks are scoped, so a
		// duplicate across two steps would not collide at all.
		const stepId = before.activities[0].steps[0].id;
		const withSecond = addStory(before, stepId, 'Second in scope');
		const [first, second] = withSecond.map.stories.filter(
			(story) => story.stepId === stepId && story.sliceId === null
		);
		const collides = {
			...withSecond.map,
			name: 'Should not survive',
			stories: withSecond.map.stories.map((story) =>
				story.id === second.id ? { ...story, rank: first.rank } : story
			)
		};

		await expect(repository.save(collides)).rejects.toThrow(/UNIQUE constraint failed/);

		const after = (await repository.load(map.id))!;
		expect(after.version).toBe(saved.version);
		expect(after.name).toBe(before.name);
		expect(canonicalStoryOrder(after.stories)).toEqual(canonicalStoryOrder(before.stories));
		expect(after.activities).toHaveLength(before.activities.length);
	});

	// save()'s other branch: `changes === 0` means either a stale version or a
	// map that is gone, and it distinguishes them inside the transaction so the
	// caller gets a message that says which.
	it('reports a deleted map differently from a stale one', async () => {
		const map = buildSampleMap();
		await repository.save(map);
		const loaded = (await repository.load(map.id))!;

		await repository.delete(map.id);

		await expect(repository.save({ ...loaded, name: 'Writing to a ghost' })).rejects.toThrow(
			/no longer exists/
		);
	});

	it('delete() removes the map and cascades to its children', async () => {
		const map = buildSampleMap();
		await repository.save(map);

		await repository.delete(map.id);

		const loaded = await repository.load(map.id);
		expect(loaded).toBeNull();

		// Activities alone would pass even if stories were orphaned under a
		// deleted step, which is the regression worth catching.
		const stepIds = map.activities.flatMap((a) => a.steps.map((step) => step.id));
		expect(
			db
				.select()
				.from(schema.activities)
				.all()
				.filter((a) => a.mapId === map.id)
		).toHaveLength(0);
		expect(
			db
				.select()
				.from(schema.slices)
				.all()
				.filter((sl) => sl.mapId === map.id)
		).toHaveLength(0);
		expect(
			db
				.select()
				.from(schema.steps)
				.all()
				.filter((st) => stepIds.includes(st.id))
		).toHaveLength(0);
		expect(
			db
				.select()
				.from(schema.stories)
				.all()
				.filter((story) => stepIds.includes(story.stepId))
		).toHaveLength(0);
	});

	// The seed map (src/lib/seed/) is the largest aggregate anything in this
	// project writes — 12 activities, 43 steps, 157 stories over 4 rank
	// scopes per step. Its builder is unit-tested without a database, so this
	// is the one place the unique indexes below get to see it: a rank
	// collision would surface here rather than when someone runs `db:seed`.
	it('round-trips the retail commerce seed map', async () => {
		const map = buildRetailCommerceMap(wholeSecondNow());

		const saved = await repository.save(map);
		const loaded = await repository.load(saved.id);

		expect(loaded).not.toBeNull();
		expect(loaded!.activities).toEqual(saved.activities);
		expect(canonicalStoryOrder(loaded!.stories)).toEqual(canonicalStoryOrder(saved.stories));
	});

	// The rank uniqueness invariant lives in the domain; these assert the
	// schema actually backs it up, which is the point of a real-SQLite test.
	describe('rank uniqueness index', () => {
		it('rejects a duplicate rank within a sliced scope', async () => {
			const map = buildSampleMap();
			await repository.save(map);
			const story = map.stories.find((s) => s.sliceId !== null)!;

			expect(() =>
				db
					.insert(schema.stories)
					.values({
						id: 'dupe-sliced',
						stepId: story.stepId,
						title: 'Duplicate rank',
						description: null,
						sliceId: story.sliceId,
						rank: story.rank
					})
					.run()
			).toThrow(/UNIQUE/i);
		});

		it('rejects a duplicate rank in the unsliced band', async () => {
			const map = buildSampleMap();
			await repository.save(map);
			const story = map.stories.find((s) => s.sliceId === null)!;

			// SQLite treats NULLs as distinct in a UNIQUE index, so an index on
			// (step_id, slice_id, rank) alone never fires here — and the unsliced
			// band is where addStory puts every story by default.
			expect(() =>
				db
					.insert(schema.stories)
					.values({
						id: 'dupe-unsliced',
						stepId: story.stepId,
						title: 'Duplicate rank',
						description: null,
						sliceId: null,
						rank: story.rank
					})
					.run()
			).toThrow(/UNIQUE/i);
		});
	});
});

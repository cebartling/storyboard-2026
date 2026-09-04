/**
 * `StoryMapRepository` implementation backed by Drizzle + SQLite (better-sqlite3).
 * See ADR 0004: whole-map load/save is the deliberately coarse starting point —
 * no per-operation methods. `save()` runs inside a single transaction: the
 * `maps` row is upserted, and every child table is fully deleted and
 * reinserted from the in-memory aggregate. Cheap enough at this experiment's
 * scale (tens to low hundreds of rows per map) and keeps the write path to
 * one code path instead of a diff/patch per entity type.
 *
 * No Drizzle types leak past this file — `load()` returns a plain domain
 * `StoryMap`, `save()` takes one.
 */

import { ConflictError, ForbiddenError } from '$lib/domain/errors';
import { and, eq, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { ActivityId, MapId, SliceId, StepId, StoryId, UserId } from '$lib/domain/ids';
import type { Caller, MapAccess, MapSummary, Role, StoryMapRepository } from '$lib/domain/ports';
import type { Activity, Slice, Step, Story, StoryMap } from '$lib/domain/story-map';
import * as schema from '../db/schema';

export class DrizzleStoryMapRepository implements StoryMapRepository {
	constructor(private readonly db: BetterSQLite3Database<typeof schema>) {}

	/**
	 * The caller's role on a map, or null if they are not a member. One row, and
	 * it answers both "does this exist" and "may they" — which is the reason
	 * ADR 0016 puts authorisation here rather than in the app layer.
	 */
	private roleWithin(
		tx: BetterSQLite3Database<typeof schema>,
		mapId: MapId,
		userId: UserId
	): Role | null {
		const row = tx
			.select({ role: schema.mapMembers.role })
			.from(schema.mapMembers)
			.where(and(eq(schema.mapMembers.mapId, mapId), eq(schema.mapMembers.userId, userId)))
			.get();
		return row?.role ?? null;
	}

	async load(caller: Caller, id: MapId): Promise<MapAccess | null> {
		// One transaction for five reads. In-process this is already safe —
		// better-sqlite3 is synchronous, so nothing interleaves — but the seed
		// script and the e2e server are documented concurrent writers on the same
		// file, and a commit landing between the activity and story reads would
		// otherwise hand back a torn aggregate: stories referencing steps that
		// are not in `activities`. Cheap here, and it makes the guarantee the
		// caller already assumes actually true.
		return this.db.transaction((tx) => {
			const role = this.roleWithin(tx, id, caller.userId);
			// A non-member is told exactly what someone asking for a nonexistent
			// map is told, so ids cannot be probed for.
			if (!role) return null;
			const map = this.loadWithin(tx, id);
			return map ? { map, role } : null;
		});
	}

	private loadWithin(db: BetterSQLite3Database<typeof schema>, id: MapId): StoryMap | null {
		const mapRow = db.select().from(schema.maps).where(eq(schema.maps.id, id)).get();
		if (!mapRow) return null;

		const activityRows = db
			.select()
			.from(schema.activities)
			.where(eq(schema.activities.mapId, id))
			.all();
		const activityIds = activityRows.map((a) => a.id);

		const stepRows = activityIds.length
			? db.select().from(schema.steps).where(inArray(schema.steps.activityId, activityIds)).all()
			: [];
		const stepIds = stepRows.map((s) => s.id);

		const sliceRows = db.select().from(schema.slices).where(eq(schema.slices.mapId, id)).all();

		const storyRows = stepIds.length
			? db.select().from(schema.stories).where(inArray(schema.stories.stepId, stepIds)).all()
			: [];

		const stepsByActivity = new Map<string, Step[]>();
		for (const row of stepRows) {
			const step: Step = {
				id: row.id as StepId,
				activityId: row.activityId as ActivityId,
				name: row.name,
				rank: row.rank
			};
			const list = stepsByActivity.get(row.activityId) ?? [];
			list.push(step);
			stepsByActivity.set(row.activityId, list);
		}

		const activities: Activity[] = sortByRank(
			activityRows.map((row) => ({
				id: row.id as ActivityId,
				mapId: row.mapId as MapId,
				name: row.name,
				rank: row.rank,
				steps: sortByRank(stepsByActivity.get(row.id) ?? [])
			}))
		);

		const slices: Slice[] = sortByRank(
			sliceRows.map((row) => ({
				id: row.id as SliceId,
				mapId: row.mapId as MapId,
				name: row.name,
				rank: row.rank
			}))
		);

		// Stories have no single well-defined order across the whole map — rank
		// is only meaningful within a (stepId, sliceId) scope (see ADR 0005) —
		// so this orders by scope first, then rank within it, purely for a
		// deterministic and debuggable result. Every real consumer re-filters
		// by (stepId, sliceId) before relying on order anyway.
		const stories: Story[] = [...storyRows]
			.map((row) => ({
				id: row.id as StoryId,
				stepId: row.stepId as StepId,
				title: row.title,
				description: row.description,
				sliceId: row.sliceId as SliceId | null,
				rank: row.rank
			}))
			.sort(byScopeThenRank);

		return {
			id: mapRow.id as MapId,
			name: mapRow.name,
			createdAt: mapRow.createdAt,
			version: mapRow.version,
			activities,
			slices,
			stories
		};
	}

	async save(caller: Caller, map: StoryMap): Promise<StoryMap> {
		const nextVersion = map.version + 1;
		// `immediate` takes the write lock at BEGIN rather than on the first
		// write. Without it, a transaction that reads before it writes holds a
		// read snapshot that goes stale the moment another connection commits,
		// and SQLite reports SQLITE_BUSY_SNAPSHOT — which the busy handler never
		// retries, so `busy_timeout` cannot save it (ADR 0015 Stage 0).
		//
		// This one happens to write first today, so it is safe either way; it is
		// marked anyway so that adding a read at the top (an ownership check, say)
		// cannot silently reintroduce the hazard. `delete()` below really does
		// read first, and really does fail without this.
		this.db.transaction(
			(tx) => {
				// Membership is checked inside the same transaction as the write, so
				// access revoked concurrently cannot be raced. This is the "read at
				// the top" the comment above anticipated — the immediate BEGIN is
				// what keeps it safe.
				const existingRow = tx
					.select({ id: schema.maps.id })
					.from(schema.maps)
					.where(eq(schema.maps.id, map.id))
					.get();
				if (existingRow && !this.roleWithin(tx, map.id, caller.userId)) {
					throw new ForbiddenError('You do not have access to this story map.');
				}

				const update = tx
					.update(schema.maps)
					.set({ name: map.name, createdAt: map.createdAt, version: nextVersion })
					.where(and(eq(schema.maps.id, map.id), eq(schema.maps.version, map.version)))
					.run();

				if (update.changes === 0) {
					const existing = tx
						.select({ version: schema.maps.version })
						.from(schema.maps)
						.where(eq(schema.maps.id, map.id))
						.get();

					if (existing) {
						throw new ConflictError(
							`Story map ${map.id} changed since it was loaded (expected version ${map.version}, current version ${existing.version})`
						);
					}
					if (map.version !== 0) {
						throw new ConflictError(`Story map ${map.id} no longer exists`);
					}

					tx.insert(schema.maps)
						.values({
							id: map.id,
							name: map.name,
							createdAt: map.createdAt,
							version: nextVersion
						})
						.run();
					// The owner row goes in with the map, in the same transaction, so
					// there is never an instant at which a map exists that nobody can
					// reach.
					tx.insert(schema.mapMembers)
						.values({ mapId: map.id, userId: caller.userId, role: 'owner' })
						.run();
				}

				// Delete every existing row for this map, leaf tables first (FK-safe),
				// then reinsert everything from the in-memory aggregate.
				const existingActivityIds = tx
					.select({ id: schema.activities.id })
					.from(schema.activities)
					.where(eq(schema.activities.mapId, map.id))
					.all()
					.map((r) => r.id);

				const existingStepIds = existingActivityIds.length
					? tx
							.select({ id: schema.steps.id })
							.from(schema.steps)
							.where(inArray(schema.steps.activityId, existingActivityIds))
							.all()
							.map((r) => r.id)
					: [];

				for (const stepId of existingStepIds) {
					tx.delete(schema.stories).where(eq(schema.stories.stepId, stepId)).run();
				}
				for (const stepId of existingStepIds) {
					tx.delete(schema.steps).where(eq(schema.steps.id, stepId)).run();
				}
				for (const activityId of existingActivityIds) {
					tx.delete(schema.activities).where(eq(schema.activities.id, activityId)).run();
				}
				tx.delete(schema.slices).where(eq(schema.slices.mapId, map.id)).run();

				for (const activity of map.activities) {
					tx.insert(schema.activities)
						.values({
							id: activity.id,
							mapId: activity.mapId,
							name: activity.name,
							rank: activity.rank
						})
						.run();
					for (const step of activity.steps) {
						tx.insert(schema.steps)
							.values({
								id: step.id,
								activityId: step.activityId,
								name: step.name,
								rank: step.rank
							})
							.run();
					}
				}

				for (const slice of map.slices) {
					tx.insert(schema.slices)
						.values({ id: slice.id, mapId: slice.mapId, name: slice.name, rank: slice.rank })
						.run();
				}

				for (const story of map.stories) {
					tx.insert(schema.stories)
						.values({
							id: story.id,
							stepId: story.stepId,
							title: story.title,
							description: story.description,
							sliceId: story.sliceId,
							rank: story.rank
						})
						.run();
				}
			},
			{ behavior: 'immediate' }
		);

		return { ...map, version: nextVersion };
	}

	async listSummaries(caller: Caller): Promise<MapSummary[]> {
		const rows = this.db
			.select({
				id: schema.maps.id,
				name: schema.maps.name,
				createdAt: schema.maps.createdAt,
				role: schema.mapMembers.role
			})
			.from(schema.maps)
			.innerJoin(schema.mapMembers, eq(schema.mapMembers.mapId, schema.maps.id))
			.where(eq(schema.mapMembers.userId, caller.userId))
			.all();
		return rows
			.map((r) => ({ id: r.id as MapId, name: r.name, createdAt: r.createdAt, role: r.role }))
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	}

	async delete(caller: Caller, id: MapId): Promise<void> {
		// Delete leaf-first rather than leaning on the FK cascades. `stories`
		// references `slices` with ON DELETE SET NULL, so cascading from the map
		// would un-slice every story on the way out — and un-slicing en masse
		// collides in the unsliced scope, whose ranks are only unique within
		// that scope. Deleting a map means the stories go too, not that they
		// move to the unsliced band.
		this.db.transaction(
			(tx) => {
				const role = this.roleWithin(tx, id, caller.userId);
				// Silent for a non-member: they must not be able to tell a map they
				// cannot see from one that was never there.
				if (!role) return;
				if (role !== 'owner') {
					throw new ForbiddenError('Only the owner can delete this story map.');
				}

				const activityIds = tx
					.select({ id: schema.activities.id })
					.from(schema.activities)
					.where(eq(schema.activities.mapId, id))
					.all()
					.map((r) => r.id);

				const stepIds = activityIds.length
					? tx
							.select({ id: schema.steps.id })
							.from(schema.steps)
							.where(inArray(schema.steps.activityId, activityIds))
							.all()
							.map((r) => r.id)
					: [];

				for (const stepId of stepIds) {
					tx.delete(schema.stories).where(eq(schema.stories.stepId, stepId)).run();
				}
				for (const stepId of stepIds) {
					tx.delete(schema.steps).where(eq(schema.steps.id, stepId)).run();
				}
				for (const activityId of activityIds) {
					tx.delete(schema.activities).where(eq(schema.activities.id, activityId)).run();
				}
				tx.delete(schema.slices).where(eq(schema.slices.mapId, id)).run();
				tx.delete(schema.maps).where(eq(schema.maps.id, id)).run();
			},
			// See save(): this transaction reads the child ids before deleting
			// them, which is exactly the read-then-write shape that fails under
			// contention without an immediate BEGIN.
			{ behavior: 'immediate' }
		);
	}
	async addMember(caller: Caller, id: MapId, userId: UserId, role: 'editor'): Promise<void> {
		this.db.transaction(
			(tx) => {
				if (this.roleWithin(tx, id, caller.userId) !== 'owner') {
					// Deliberately the same answer for an editor and for a stranger:
					// neither may share the map on, and distinguishing them would tell
					// a stranger the map exists.
					throw new ForbiddenError('Only the owner can share this story map.');
				}
				// Idempotent: re-sharing with someone who is already on the map is a
				// thing people do, and it is not an error.
				tx.insert(schema.mapMembers)
					.values({ mapId: id, userId, role })
					.onConflictDoNothing()
					.run();
			},
			{ behavior: 'immediate' }
		);
	}
}

function byRank(a: { rank: string }, b: { rank: string }): number {
	return a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0;
}

function sortByRank<T extends { rank: string }>(items: T[]): T[] {
	return [...items].sort(byRank);
}

function byScopeThenRank(a: Story, b: Story): number {
	if (a.stepId !== b.stepId) return a.stepId < b.stepId ? -1 : 1;
	const aSlice = a.sliceId ?? '';
	const bSlice = b.sliceId ?? '';
	if (aSlice !== bSlice) return aSlice < bSlice ? -1 : 1;
	return byRank(a, b);
}

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

import { and, eq, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { ActivityId, MapId, SliceId, StepId, StoryId } from '$lib/domain/ids';
import type { StoryMapRepository } from '$lib/domain/ports';
import type { Activity, Slice, Step, Story, StoryMap } from '$lib/domain/story-map';
import * as schema from '../db/schema';

export class DrizzleStoryMapRepository implements StoryMapRepository {
	constructor(private readonly db: BetterSQLite3Database<typeof schema>) {}

	async load(id: MapId): Promise<StoryMap | null> {
		const mapRow = this.db.select().from(schema.maps).where(eq(schema.maps.id, id)).get();
		if (!mapRow) return null;

		const activityRows = this.db
			.select()
			.from(schema.activities)
			.where(eq(schema.activities.mapId, id))
			.all();
		const activityIds = activityRows.map((a) => a.id);

		const stepRows = activityIds.length
			? this.db
					.select()
					.from(schema.steps)
					.where(inArray(schema.steps.activityId, activityIds))
					.all()
			: [];
		const stepIds = stepRows.map((s) => s.id);

		const sliceRows = this.db.select().from(schema.slices).where(eq(schema.slices.mapId, id)).all();

		const storyRows = stepIds.length
			? this.db.select().from(schema.stories).where(inArray(schema.stories.stepId, stepIds)).all()
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

	async save(map: StoryMap): Promise<StoryMap> {
		const nextVersion = map.version + 1;
		this.db.transaction((tx) => {
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
					throw new Error(
						`Story map ${map.id} changed since it was loaded (expected version ${map.version}, current version ${existing.version})`
					);
				}
				if (map.version !== 0) {
					throw new Error(`Story map ${map.id} no longer exists`);
				}

				tx.insert(schema.maps)
					.values({
						id: map.id,
						name: map.name,
						createdAt: map.createdAt,
						version: nextVersion
					})
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
		});

		return { ...map, version: nextVersion };
	}

	async listSummaries(): Promise<{ id: MapId; name: string; createdAt: Date }[]> {
		const rows = this.db
			.select({ id: schema.maps.id, name: schema.maps.name, createdAt: schema.maps.createdAt })
			.from(schema.maps)
			.all();
		return rows
			.map((r) => ({ id: r.id as MapId, name: r.name, createdAt: r.createdAt }))
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	}

	async delete(id: MapId): Promise<void> {
		this.db.delete(schema.maps).where(eq(schema.maps.id, id)).run();
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

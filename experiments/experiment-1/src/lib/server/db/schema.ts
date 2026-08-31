import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// StoryMap — the aggregate root. See documentation/domain-model.md.
export const maps = sqliteTable('maps', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	version: integer('version').notNull().default(0)
});

// Activity — backbone, narrative order. rank is scoped to (mapId).
export const activities = sqliteTable(
	'activities',
	{
		id: text('id').primaryKey(),
		mapId: text('map_id')
			.notNull()
			.references(() => maps.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		rank: text('rank').notNull()
	},
	(table) => [uniqueIndex('activities_map_id_rank_idx').on(table.mapId, table.rank)]
);

// Step — Patton's "user task" (see glossary.md). rank is scoped to (activityId).
export const steps = sqliteTable(
	'steps',
	{
		id: text('id').primaryKey(),
		activityId: text('activity_id')
			.notNull()
			.references(() => activities.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		rank: text('rank').notNull()
	},
	(table) => [uniqueIndex('steps_activity_id_rank_idx').on(table.activityId, table.rank)]
);

// Slice — release band, top-to-bottom. rank is scoped to (mapId).
export const slices = sqliteTable(
	'slices',
	{
		id: text('id').primaryKey(),
		mapId: text('map_id')
			.notNull()
			.references(() => maps.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		rank: text('rank').notNull()
	},
	(table) => [uniqueIndex('slices_map_id_rank_idx').on(table.mapId, table.rank)]
);

// Story — belongs to a Step, optionally to a Slice. sliceId null = unsliced band.
// Deleting a slice sets sliceId to null (un-slices) rather than deleting the story.
// rank is scoped to (stepId, sliceId).
export const stories = sqliteTable(
	'stories',
	{
		id: text('id').primaryKey(),
		stepId: text('step_id')
			.notNull()
			.references(() => steps.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		description: text('description'),
		sliceId: text('slice_id').references(() => slices.id, { onDelete: 'set null' }),
		rank: text('rank').notNull()
	},
	(table) => [
		uniqueIndex('stories_step_id_slice_id_rank_idx').on(table.stepId, table.sliceId, table.rank),
		// SQLite treats NULLs as distinct in a UNIQUE index, so the index above
		// never fires for the unsliced band — which is where `addStory` puts
		// every story by default. This partial index covers that scope.
		uniqueIndex('stories_step_id_unsliced_rank_idx')
			.on(table.stepId, table.rank)
			.where(sql`${table.sliceId} is null`)
	]
);

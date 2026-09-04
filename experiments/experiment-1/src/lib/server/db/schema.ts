import { sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';

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
// Deleting a slice un-slices its stories rather than deleting them, but that is
// `deleteSlice`'s job in the domain, not the FK's: un-slicing has to re-rank
// each story into the unsliced scope, and a bare ON DELETE SET NULL would reuse
// the sliced-scope rank and trip the partial unique index below (every scope
// starts at 'a0'). It is left as NO ACTION so a raw `DELETE FROM maps` still
// cascades cleanly — deferred to statement end, after the stories are gone.
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
		sliceId: text('slice_id').references(() => slices.id),
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

// ---------------------------------------------------------------------------
// Accounts and access (ADR 0016). Deliberately outside the StoryMap aggregate:
// membership is not a board invariant, and `save()` rewrites every child row of
// the aggregate on each write — putting members in there would rewrite the
// access list on every drag.
// ---------------------------------------------------------------------------

export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	/** Stored lowercased and trimmed, so uniqueness means what a person expects. */
	email: text('email').notNull().unique(),
	displayName: text('display_name').notNull(),
	/** `scrypt$<salt>$<hash>`, both base64url. See `auth/password.ts`. */
	passwordHash: text('password_hash').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});

/**
 * Sessions, keyed by the SHA-256 of the token rather than the token itself: the
 * raw value exists only in the user's cookie, so a leaked database does not
 * hand over live sessions. Logging out is a DELETE, which is the thing a signed
 * cookie or JWT cannot do without a denylist that is itself a table.
 */
export const sessions = sqliteTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
	},
	(table) => [index('sessions_user_id_idx').on(table.userId)]
);

export const mapMembers = sqliteTable(
	'map_members',
	{
		mapId: text('map_id')
			.notNull()
			.references(() => maps.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		role: text('role', { enum: ['owner', 'editor'] }).notNull()
	},
	(table) => [
		primaryKey({ columns: [table.mapId, table.userId] }),
		index('map_members_user_id_idx').on(table.userId),
		// Exactly one owner per map, enforced in the schema rather than by
		// convention — the same partial-index technique as
		// `stories_step_id_unsliced_rank_idx`.
		uniqueIndex('map_members_one_owner_idx')
			.on(table.mapId)
			.where(sql`"role" = 'owner'`),
		check('map_members_role_check', sql`"role" in ('owner', 'editor')`)
	]
);

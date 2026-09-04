import type { Db } from 'mongodb';
import { collections } from './collections';

/**
 * Creates the indexes the application's correctness depends on (ADR 0003).
 *
 * This replaces experiment-1's five committed migration files. Documents need
 * no schema migration to add a field, so what is left is exactly the set of
 * constraints the database is being asked to enforce — which is a shorter and
 * more honest list than a schema.
 *
 * **Three of these are not performance.** Moving from SQLite gave up six unique
 * indexes, seven foreign keys and five cascades. Most of that loss is fine:
 * rank uniqueness within a scope became an invariant *inside* one document,
 * which the domain already enforces, and cascades became "the sub-array is
 * gone". These three had no such replacement and are rebuilt deliberately:
 *
 * - `users.email` unique — the only thing closing the check-then-insert race in
 *   `Auth.register`.
 * - one owner per map — nothing in the domain knows `mapMembers` exists, so
 *   without this "only the owner may delete or share" is a convention rather
 *   than a guarantee, and `roleOf` would pick an arbitrary owner row.
 * - `mapMembers` uniqueness per (map, user) — what makes sharing idempotent.
 *
 * Called at startup and by the test harness, and safe to run repeatedly.
 */
export async function ensureIndexes(db: Db): Promise<void> {
	const { users, sessions, mapMembers } = collections(db);

	await users.createIndex({ email: 1 }, { unique: true, name: 'users_email_unique' });

	// Expired sessions are cleared on the way past in `validateSession`; this
	// index is what lets a sweep, or a user deletion, find them by user.
	await sessions.createIndex({ userId: 1 }, { name: 'sessions_user_id_idx' });

	await mapMembers.createIndex(
		{ mapId: 1, userId: 1 },
		{ unique: true, name: 'map_members_map_user_unique' }
	);
	// Backs `listSummaries`, which reads in the user → maps direction.
	await mapMembers.createIndex({ userId: 1 }, { name: 'map_members_user_id_idx' });
	// At most one owner per map. A partial unique index, the same technique the
	// SQLite schema used.
	await mapMembers.createIndex(
		{ mapId: 1 },
		{
			unique: true,
			name: 'map_members_one_owner_idx',
			partialFilterExpression: { role: 'owner' }
		}
	);
}

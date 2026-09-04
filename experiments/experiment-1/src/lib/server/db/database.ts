import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './schema';

/**
 * The database handle the repository and auth service accept.
 *
 * Deliberately the *base* Drizzle type rather than `BetterSQLite3Database`, so
 * that both drivers in this codebase satisfy it: the app runs on
 * `better-sqlite3`, and `scripts/seed.ts` runs on `bun:sqlite` because
 * better-sqlite3 segfaults the Bun runtime on connection.
 *
 * The two differ only in what a write returns — `RunResult` against `void` —
 * which is exactly why `save()` must not read an affected-row count. See the
 * compare-and-set in `drizzle-story-map-repository.ts`.
 */
export type AppDatabase = BaseSQLiteDatabase<'sync', unknown, typeof schema>;

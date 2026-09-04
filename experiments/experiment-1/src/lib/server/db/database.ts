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
 * The two are typed differently for what a write returns — `RunResult` against
 * `void` — so this supertype offers nothing there, which is why `save()` must
 * not read an affected-row count. That is a gap in Drizzle's types rather than
 * a difference in behaviour: `bun:sqlite` does report `changes` at runtime. The
 * repository is written against this type, not against whichever driver is
 * underneath, so the constraint is real either way.
 */
export type AppDatabase = BaseSQLiteDatabase<'sync', unknown, typeof schema>;

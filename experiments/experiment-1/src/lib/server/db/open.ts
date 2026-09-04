import Database from 'better-sqlite3';

/**
 * How long a write waits for another connection's lock before giving up.
 *
 * SQLite's default is 0, which means a contended write throws `SQLITE_BUSY`
 * immediately rather than waiting — fine for one process with one connection,
 * wrong as soon as a second writer exists (ADR 0015 Stage 0). Five seconds is
 * far longer than any write here takes: `save()` is a handful of statements
 * against a board of tens to low hundreds of rows.
 */
export const BUSY_TIMEOUT_MS = 5000;

/**
 * Opens the application's SQLite connection with the pragmas the rest of the
 * system assumes. Kept separate from `./index.ts` so it can be tested without
 * `$env/dynamic/private` or the migration run that module performs on import.
 *
 * - `journal_mode = WAL`: readers no longer block the writer, which is what
 *   makes concurrent editing survivable at all. Note this is persistent — it
 *   is a property of the database file, not the connection — so it is set once
 *   here and every later connection inherits it.
 * - `busy_timeout`: see BUSY_TIMEOUT_MS above.
 * - `foreign_keys = ON`: required for the schema's `onDelete: 'cascade'` FKs to
 *   take effect. SQLite enforces foreign keys per-connection and defaults them
 *   off, so this one *must* be set on every connection.
 *
 * Note that `busy_timeout` alone is not enough for a read-then-write
 * transaction: see the `behavior: 'immediate'` comment in
 * `drizzle-story-map-repository.ts`.
 */
export function openDatabase(url: string): Database.Database {
	const client = new Database(url);
	client.pragma('journal_mode = WAL');
	client.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
	client.pragma('foreign_keys = ON');
	return client;
}

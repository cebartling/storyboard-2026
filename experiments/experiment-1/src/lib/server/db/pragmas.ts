/**
 * The connection pragmas this application requires, in one driver-free place.
 *
 * There are two SQLite connections in this codebase now — the app's, through
 * `better-sqlite3`, and the seed script's, through `bun:sqlite` — and both must
 * apply the same settings. ADR 0015 Stage 0 made these load-bearing rather than
 * incidental, so two lists that could drift apart would be a genuinely bad
 * failure: silently losing WAL or `foreign_keys` on one path looks like nothing
 * at all until it costs something.
 *
 * Plain SQL strings rather than driver calls, because that is the only
 * vocabulary both drivers share.
 */

/**
 * How long a write waits for another connection's lock before giving up.
 *
 * SQLite's default is 0, which means a contended write throws `SQLITE_BUSY`
 * immediately rather than waiting — fine for one process with one connection,
 * wrong as soon as a second writer exists. Five seconds is far longer than any
 * write here takes: `save()` is a handful of statements against a board of tens
 * to low hundreds of rows.
 */
export const BUSY_TIMEOUT_MS = 5000;

/**
 * - `journal_mode = WAL`: readers no longer block the writer, which is what
 *   makes concurrent editing survivable at all. Persistent — it is a property
 *   of the database file, not the connection — so it is set once and every
 *   later connection inherits it.
 * - `busy_timeout`: see above.
 * - `foreign_keys = ON`: required for the schema's `onDelete: 'cascade'` FKs to
 *   take effect. SQLite enforces foreign keys per-connection and defaults them
 *   off, so this one *must* be set on every connection.
 *
 * Note that `busy_timeout` alone is not enough for a read-then-write
 * transaction: see the `behavior: 'immediate'` comment in
 * `drizzle-story-map-repository.ts`.
 */
export const REQUIRED_PRAGMAS: readonly string[] = [
	'journal_mode = WAL',
	`busy_timeout = ${BUSY_TIMEOUT_MS}`,
	'foreign_keys = ON'
];

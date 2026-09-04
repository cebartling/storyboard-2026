import Database from 'better-sqlite3';
import { REQUIRED_PRAGMAS } from './pragmas';

export { BUSY_TIMEOUT_MS } from './pragmas';

/**
 * Opens the application's SQLite connection with the pragmas the rest of the
 * system assumes. Kept separate from `./index.ts` so it can be tested without
 * `$env/dynamic/private` or the migration run that module performs on import.
 *
 * The pragmas themselves live in `./pragmas.ts`, because the seed script opens
 * its own connection through a different driver and must apply exactly the
 * same ones.
 */
export function openDatabase(url: string): Database.Database {
	const client = new Database(url);
	for (const pragma of REQUIRED_PRAGMAS) client.pragma(pragma);
	return client;
}

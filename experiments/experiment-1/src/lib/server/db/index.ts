import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './open';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

// WAL, busy_timeout and foreign_keys all live in `open.ts`, which is testable
// without this module's env read and startup migration. See ADR 0015 Stage 0.
const client = openDatabase(env.DATABASE_URL);

export const db = drizzle(client, { schema });

// Startup guard: apply any pending migrations from ./drizzle before the app
// serves its first request. Drizzle tracks applied migrations in its own
// `__drizzle_migrations` table, so this is a cheap no-op once up to date —
// it's what makes `pnpm dev` and `pnpm build && pnpm preview` (the e2e
// webServer) work against a fresh DATABASE_URL with no separate manual
// `pnpm db:migrate` step required.
// Resolved relative to this module, not `process.cwd()`: the adapter-node
// build is startable from any directory, and a cwd-relative path silently
// depends on being launched from the experiment root.
const migrationsFolder = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../../drizzle'
);

try {
	migrate(db, { migrationsFolder });
} catch (cause) {
	throw new Error(
		`Failed to apply migrations from ${migrationsFolder} to DATABASE_URL=${env.DATABASE_URL}`,
		{ cause }
	);
}

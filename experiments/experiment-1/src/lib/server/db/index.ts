import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import path from 'node:path';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const client = new Database(env.DATABASE_URL);
// Required for the schema's `onDelete: 'cascade' | 'set null'` FKs to take
// effect — SQLite enforces foreign keys per-connection, off by default.
client.pragma('foreign_keys = ON');

export const db = drizzle(client, { schema });

// Startup guard: apply any pending migrations from ./drizzle before the app
// serves its first request. Drizzle tracks applied migrations in its own
// `__drizzle_migrations` table, so this is a cheap no-op once up to date —
// it's what makes `pnpm dev` and `pnpm build && pnpm preview` (the e2e
// webServer) work against a fresh DATABASE_URL with no separate manual
// `pnpm db:migrate` step required.
migrate(db, { migrationsFolder: path.resolve(process.cwd(), 'drizzle') });

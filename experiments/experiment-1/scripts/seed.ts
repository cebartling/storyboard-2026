/**
 * Writes the sample retail commerce story map (src/lib/seed/) into the
 * SQLite database at DATABASE_URL. Run it with `corepack pnpm db:seed`.
 *
 * This is a driving adapter of its own — like a route, it composes the
 * repository and calls into the pure core, and holds no rules itself. It
 * builds its own Drizzle client rather than importing src/lib/server/db,
 * whose `$env/dynamic/private` import only resolves inside SvelteKit.
 */

import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from '../src/lib/server/db/schema.ts';
import { DrizzleStoryMapRepository } from '../src/lib/server/repository/drizzle-story-map-repository.ts';
import { buildRetailCommerceMap } from '../src/lib/seed/retail-commerce.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function databaseUrl(): string {
	if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

	// Same fallback the app gets: .env is what `vite dev` loads, and running
	// the seed against a different file than the dev server would be a
	// confusing no-op.
	const envFile = path.join(root, '.env');
	const match = fs.existsSync(envFile)
		? /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/m.exec(fs.readFileSync(envFile, 'utf8'))
		: null;
	if (!match) {
		throw new Error(`DATABASE_URL is not set and no DATABASE_URL found in ${envFile}`);
	}
	return match[1];
}

const url = databaseUrl();
const client = new Database(path.resolve(root, url));
client.pragma('foreign_keys = ON');
const db = drizzle(client, { schema });
migrate(db, { migrationsFolder: path.join(root, 'drizzle') });

const repository = new DrizzleStoryMapRepository(db);
const map = buildRetailCommerceMap();
const saved = await repository.save(map);

const stepCount = saved.activities.reduce((n, a) => n + a.steps.length, 0);
console.log(
	`Seeded "${saved.name}" into ${url}: ` +
		`${saved.activities.length} activities, ${stepCount} steps, ` +
		`${saved.slices.length} slices, ${saved.stories.length} stories.`
);
console.log(`Open it at /maps/${saved.id}`);

client.close();

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
import { loadEnv } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from '../src/lib/server/db/schema.ts';
import { DrizzleStoryMapRepository } from '../src/lib/server/repository/drizzle-story-map-repository.ts';
import { buildRetailCommerceMap } from '../src/lib/seed/retail-commerce.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function databaseUrl(): string {
	if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

	// Falls back to .env, which is what `vite dev` loads — seeding a different
	// file than the dev server reads would be a confusing no-op. Read with
	// Vite's own loader rather than a regex: quoted values and trailing
	// comments are legal dotenv, and hand-parsing them wrong yields a database
	// file named after the quotes.
	const url = loadEnv('development', root, '').DATABASE_URL;
	if (!url) {
		throw new Error(
			`DATABASE_URL is not set and no DATABASE_URL found in ${path.join(root, '.env')}`
		);
	}
	return url;
}

// Resolved against the experiment root, and reported that way: a relative
// DATABASE_URL is otherwise ambiguous in the output, and every message below
// should name the file actually written rather than the value configured.
const file = path.resolve(root, databaseUrl());
const client = new Database(file);
client.pragma('foreign_keys = ON');
const db = drizzle(client, { schema });

try {
	const migrationsFolder = path.join(root, 'drizzle');
	try {
		migrate(db, { migrationsFolder });
	} catch (cause) {
		// Same context src/lib/server/db/index.ts attaches: without it a bad
		// migrations folder or a locked file is a bare Drizzle stack that names
		// neither the folder nor the database it was opening.
		throw new Error(`Failed to apply migrations from ${migrationsFolder} to ${file}`, {
			cause
		});
	}

	const repository = new DrizzleStoryMapRepository(db);
	const saved = await repository.save(buildRetailCommerceMap());

	const stepCount = saved.activities.reduce((n, a) => n + a.steps.length, 0);
	console.log(
		`Seeded "${saved.name}" into ${file}: ` +
			`${saved.activities.length} activities, ${stepCount} steps, ` +
			`${saved.slices.length} slices, ${saved.stories.length} stories.`
	);
	console.log(`Open it at /maps/${saved.id}`);
} finally {
	client.close();
}

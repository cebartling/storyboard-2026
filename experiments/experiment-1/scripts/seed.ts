/**
 * Writes the sample retail commerce story map (src/lib/seed/) into the
 * SQLite database at DATABASE_URL. Run it with `corepack pnpm db:seed`.
 *
 * This is a driving adapter of its own — like a route, it composes the
 * repository and calls into the pure core, and holds no rules itself. It
 * builds its own Drizzle client rather than importing src/lib/server/db,
 * whose `$env/dynamic/private` import only resolves inside SvelteKit.
 *
 * **Runs on Bun**, which is why it opens its own connection through
 * `bun:sqlite` rather than reusing `openDatabase`: `better-sqlite3` is a native
 * addon that segfaults the Bun runtime on construction. The pragmas are shared
 * with the app's connection so the two cannot drift. The repository and `Auth`
 * accept either driver — see `AppDatabase`.
 */

import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { loadEnv } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from '../src/lib/server/db/schema';
import { REQUIRED_PRAGMAS } from '../src/lib/server/db/pragmas';
import { Auth } from '../src/lib/server/auth/auth';
import { DrizzleStoryMapRepository } from '../src/lib/server/repository/drizzle-story-map-repository';
import { buildRetailCommerceMap } from '../src/lib/seed/retail-commerce';

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
for (const pragma of REQUIRED_PRAGMAS) client.exec(`PRAGMA ${pragma}`);
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

	// The seeded map needs an owner (ADR 0016), and the owner has to be a real
	// account: `map_members` has a foreign key to `users`, and inventing a row
	// here would create a login nobody knows the password to. So the script asks
	// for the address of an account that already exists.
	const ownerEmail = process.argv[2];
	if (!ownerEmail) {
		throw new Error(
			'Usage: pnpm db:seed <owner-email>\n' +
				'The seeded map is owned by an existing account — register one in the app first.'
		);
	}
	const auth = new Auth(db);
	const owner = auth.findUserByEmail(ownerEmail);
	if (!owner) {
		throw new Error(
			`No account for ${ownerEmail} in ${file}. Register it in the app first, then re-run.`
		);
	}

	const repository = new DrizzleStoryMapRepository(db);
	const saved = await repository.save({ userId: owner.id }, buildRetailCommerceMap());

	const stepCount = saved.activities.reduce((n, a) => n + a.steps.length, 0);
	console.log(
		`Seeded "${saved.name}" into ${file}: ` +
			`${saved.activities.length} activities, ${stepCount} steps, ` +
			`${saved.slices.length} slices, ${saved.stories.length} stories.`
	);
	console.log(`Open it at /maps/${saved.id} (owned by ${owner.email})`);
} finally {
	client.close();
}

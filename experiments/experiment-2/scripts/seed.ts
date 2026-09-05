/**
 * Writes the sample retail commerce story map (src/lib/seed/) into the MongoDB
 * database named by MONGODB_URI / MONGODB_DB. Run it with `corepack pnpm db:seed`.
 *
 * This is a driving adapter of its own — like a route, it composes the
 * repository and calls into the pure core, and holds no rules itself. It builds
 * its own client rather than importing src/lib/server/db, whose
 * `$env/dynamic/private` import only resolves inside SvelteKit.
 *
 * It runs on Node through `tsx`, like everything else here (ADR 0017).
 */

import { connectOrExplain, setting } from './mongo-env';
import { ensureIndexes } from '../src/lib/server/db/indexes';
import { Auth } from '../src/lib/server/auth/auth';
import { MongoStoryMapRepository } from '../src/lib/server/repository/mongo-story-map-repository';
import { buildRetailCommerceMap } from '../src/lib/seed/retail-commerce';

const uri = setting('MONGODB_URI');
const dbName = setting('MONGODB_DB');
const client = await connectOrExplain(uri);

try {
	const db = client.db(dbName);
	// The app creates these at startup too, but seeding a database the app has
	// never opened must not leave it without its constraints.
	await ensureIndexes(db);

	// The seeded map needs an owner (ADR 0015), and the owner has to be a real
	// account: inventing a user document here would create a login nobody knows
	// the password to. So the script asks for the address of an account that
	// already exists.
	const ownerEmail = process.argv[2];
	if (!ownerEmail) {
		throw new Error(
			'Usage: pnpm db:seed <owner-email>\n' +
				'The seeded map is owned by an existing account — register one in the app first.'
		);
	}
	const auth = new Auth(db, client);
	const owner = await auth.findUserByEmail(ownerEmail);
	if (!owner) {
		throw new Error(
			`No account for ${ownerEmail} in ${dbName}. Register it in the app first, then re-run.`
		);
	}

	const repository = new MongoStoryMapRepository(db, client);
	const saved = await repository.save({ userId: owner.id }, buildRetailCommerceMap());

	const stepCount = saved.activities.reduce((n, a) => n + a.steps.length, 0);
	console.log(
		`Seeded "${saved.name}" into ${dbName}: ` +
			`${saved.activities.length} activities, ${stepCount} steps, ` +
			`${saved.slices.length} slices, ${saved.stories.length} stories.`
	);
	console.log(`Open it at /maps/${saved.id} (owned by ${owner.email})`);
} finally {
	await client.close();
}

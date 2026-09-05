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
import type { AuthenticatedUser } from '../src/lib/server/auth/auth';
import type { UserId } from '../src/lib/domain/ids';

/**
 * The demo accounts `--with-accounts` creates. One owner and three editors:
 * one editor is enough to prove sharing works, but presence, live cursors and
 * the concurrent-edit warnings (ADR 0014) only look like themselves with a few
 * people on the board at once.
 */
const DEMO_PASSWORD = 'storyboard-demo';
const DEMO_OWNER = { email: 'owner@storyboard.test', displayName: 'Priya Raman' };
const DEMO_EDITORS = [
	{ email: 'editor1@storyboard.test', displayName: 'Sam Okonjo' },
	{ email: 'editor2@storyboard.test', displayName: 'Lena Fischer' },
	{ email: 'editor3@storyboard.test', displayName: 'Tom Àlvarez' }
];

/**
 * Refuses to create fixed-password accounts anywhere but a local database.
 *
 * `--with-accounts` writes four logins whose password is printed in this file
 * and committed to the repository. That is fine on a laptop and indefensible
 * anywhere else, and the check is cheap enough that there is no reason to rely
 * on whoever runs it reading the docs first.
 */
function assertLocalDatabase(uri: string, dbName: string): void {
	const host = new URL(uri.replace(/^mongodb\+srv:/, 'mongodb:')).hostname;
	const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
	if (!isLocal) {
		throw new Error(
			`Refusing to create demo accounts against ${host}. ` +
				'--with-accounts writes logins whose password is committed to this repository, ' +
				'so it only runs against a database on localhost. Seed with an existing ' +
				'account instead: pnpm db:seed <owner-email>'
		);
	}
	if (/prod/i.test(dbName)) {
		throw new Error(`Refusing to create demo accounts in a database named ${dbName}.`);
	}
}

/** Registers the account if it is missing, so re-seeding is not an error. */
async function ensureAccount(
	auth: Auth,
	email: string,
	displayName: string
): Promise<AuthenticatedUser> {
	const existing = await auth.findUserByEmail(email);
	if (existing) return existing;
	return auth.register(email, displayName, DEMO_PASSWORD);
}

const uri = setting('MONGODB_URI');
const dbName = setting('MONGODB_DB');

// Before connecting, not after: the point of the check is that these
// credentials never reach a database that is not on this machine, and
// "we opened a connection to it first" is a worse story than not dialling.
const withAccounts = process.argv[2] === '--with-accounts';
if (withAccounts) assertLocalDatabase(uri, dbName);

const client = await connectOrExplain(uri);

try {
	const db = client.db(dbName);
	// The app creates these at startup too, but seeding a database the app has
	// never opened must not leave it without its constraints.
	await ensureIndexes(db);

	// The seeded map needs an owner (ADR 0015). Two ways to name one:
	//
	//   pnpm db:seed you@example.com   — an account you already registered
	//   pnpm db:seed --with-accounts   — create a demo owner and three editors
	//
	// The second exists because the first has a chicken-and-egg problem for a
	// fresh database: sharing is the interesting part of ADR 0015, and you
	// cannot exercise it with one account. The passwords it uses are printed
	// below and fixed, which is exactly why it refuses to run outside a local
	// database — see `assertLocalDatabase`.
	const auth = new Auth(db, client);
	const arg = process.argv[2];
	if (!arg) {
		throw new Error(
			'Usage: pnpm db:seed <owner-email>\n' +
				'       pnpm db:seed --with-accounts\n\n' +
				'The seeded map is owned by an account. Either name one you registered in the\n' +
				'app, or pass --with-accounts to create a demo owner and three editors.'
		);
	}

	let owner;
	const editors: { email: string; id: UserId }[] = [];

	if (withAccounts) {
		owner = await ensureAccount(auth, DEMO_OWNER.email, DEMO_OWNER.displayName);
		for (const editor of DEMO_EDITORS) {
			const account = await ensureAccount(auth, editor.email, editor.displayName);
			editors.push({ email: account.email, id: account.id });
		}
	} else {
		owner = await auth.findUserByEmail(arg);
		if (!owner) {
			throw new Error(
				`No account for ${arg} in ${dbName}. Register it in the app first, then re-run.`
			);
		}
	}

	const repository = new MongoStoryMapRepository(db, client);
	const saved = await repository.save({ userId: owner.id }, buildRetailCommerceMap());

	// Sharing is what makes the seeded map exercise ADR 0015 and the
	// collaboration surface: presence, live cursors, and the concurrent-edit
	// paths all need a second person who can actually open the board.
	for (const editor of editors) {
		await repository.addMember({ userId: owner.id }, saved.id, editor.id, 'editor');
	}

	const stepCount = saved.activities.reduce((n, a) => n + a.steps.length, 0);
	console.log(
		`Seeded "${saved.name}" into ${dbName}: ` +
			`${saved.activities.length} activities, ${stepCount} steps, ` +
			`${saved.slices.length} slices, ${saved.stories.length} stories.`
	);
	console.log(`Open it at /maps/${saved.id} (owned by ${owner.email})`);
	if (withAccounts) {
		console.log(`\nAccounts, all with password ${JSON.stringify(DEMO_PASSWORD)}:`);
		console.log(`  owner   ${owner.email}`);
		for (const editor of editors) console.log(`  editor  ${editor.email}`);
	}
} finally {
	await client.close();
}

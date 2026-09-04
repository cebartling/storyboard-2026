/**
 * Reading MongoDB settings, and dropping a database, outside SvelteKit.
 *
 * The seed script, the e2e runner and the demo all need a connection and none
 * of them can import `src/lib/server/db`, whose `$env/dynamic/private` import
 * only resolves inside SvelteKit. They share this instead of each parsing `.env`
 * their own way.
 */

import { MongoClient } from 'mongodb';
import { loadEnv } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The e2e run's own database, dropped before each run. Named here so the
 *  Playwright config and its global setup cannot disagree about it. */
export const E2E_DB = 'storyboard-e2e';

/** The demo's own database, for the same reason. */
export const DEMO_DB = 'storyboard-demo';

export const experimentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * An explicit environment variable wins; otherwise `.env`, which is what
 * `vite dev` loads — pointing a script at a different database than the app
 * reads would be a confusing no-op.
 *
 * Read with Vite's own loader rather than a regex: quoted values and trailing
 * comments are legal dotenv, and hand-parsing them wrong yields a database named
 * after the quotes.
 */
export function setting(name: 'MONGODB_URI' | 'MONGODB_DB'): string {
	const value = process.env[name] ?? loadEnv('development', experimentRoot, '')[name];
	if (!value) {
		throw new Error(
			`${name} is not set and no ${name} found in ${path.join(experimentRoot, '.env')}`
		);
	}
	return value;
}

export async function connectOrExplain(uri: string): Promise<MongoClient> {
	const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
	try {
		await client.connect();
	} catch (cause) {
		// Without this a refused connection is a bare driver stack that names
		// neither the URI nor the likely cause.
		throw new Error(`Could not reach MongoDB at ${uri}. Is it running? \`corepack pnpm db:up\``, {
			cause
		});
	}
	return client;
}

/**
 * Empties a database so a run starts from nothing.
 *
 * This is what `rm -f e2e.db` used to do. It is a real connection rather than a
 * line in a shell command because dropping a database is not a filesystem
 * operation any more, and shelling out to `mongosh` would add a tool that is not
 * otherwise required to run this project.
 */
export async function dropDatabase(uri: string, dbName: string): Promise<void> {
	const client = await connectOrExplain(uri);
	try {
		await client.db(dbName).dropDatabase();
	} finally {
		await client.close();
	}
}

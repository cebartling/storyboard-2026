import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { connect, type Connection } from './client';
import { ensureIndexes } from './indexes';

/**
 * The app's connection, opened once per server process.
 *
 * Indexes are created here at import time, before the first request, for the
 * same reason experiment-1 ran migrations here: so `pnpm dev`, the e2e server
 * and the demo all work against an empty database with no separate setup step.
 * `createIndex` is idempotent, so this is a cheap no-op once it has run.
 *
 * **Not during `vite build`.** SvelteKit imports the whole server graph to
 * analyse it, and this module's top-level `await` runs in that pass — which
 * made a build require a running database, and, worse, silently *created* the
 * database and its indexes at whatever `MONGODB_URI` pointed at. No request is
 * served during a build, so the connection is genuinely unreachable there;
 * `collab/shutdown.ts` guards on `building` for the same reason.
 */
async function open(): Promise<Connection> {
	if (!env.MONGODB_URI) {
		throw new Error('MONGODB_URI is not set (see .env.example and compose.yaml)');
	}
	if (!env.MONGODB_DB) throw new Error('MONGODB_DB is not set (see .env.example)');

	let connection;
	try {
		connection = await connect(env.MONGODB_URI, env.MONGODB_DB);
	} catch (cause) {
		// Without this context a refused connection is a bare driver stack that
		// names neither the URI nor the likely cause.
		throw new Error(
			`Could not reach MongoDB at ${env.MONGODB_URI}. Is it running? \`corepack pnpm db:up\``,
			{ cause }
		);
	}
	await ensureIndexes(connection.db);
	return connection;
}

/**
 * Stands in for the connection during a build.
 *
 * A plain `undefined` would work — nothing dereferences these while building,
 * because `deps.ts` only constructs adapters and both resolve their collections
 * per call. But if that ever stops being true, the failure should name the
 * reason rather than surface as "cannot read properties of undefined".
 */
function unavailableWhileBuilding(): Connection {
	const fail = (): never => {
		throw new Error('The database is not available during `vite build`.');
	};
	return {
		client: new Proxy({}, { get: fail }) as Connection['client'],
		db: new Proxy({}, { get: fail }) as Connection['db']
	};
}

export const { client, db } = building ? unavailableWhileBuilding() : await open();

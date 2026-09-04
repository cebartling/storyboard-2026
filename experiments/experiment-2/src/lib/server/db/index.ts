import { env } from '$env/dynamic/private';
import { connect } from './client';
import { ensureIndexes } from './indexes';

/**
 * The app's connection, opened once per server process.
 *
 * Indexes are created here at import time, before the first request, for the
 * same reason experiment-1 ran migrations here: so `pnpm dev`, the e2e server
 * and the demo all work against an empty database with no separate setup step.
 * `createIndex` is idempotent, so this is a cheap no-op once it has run.
 */
if (!env.MONGODB_URI) throw new Error('MONGODB_URI is not set (see .env.example and compose.yaml)');
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

export const { client, db } = connection;

await ensureIndexes(db);

import { randomUUID } from 'node:crypto';
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { ensureIndexes } from '../db/indexes';

/**
 * An in-process MongoDB for the server test project.
 *
 * A **replica set**, not a standalone, and that is not a preference: creating a
 * map writes the map and its owner-membership row in one transaction, and
 * MongoDB refuses transactions outside a replica set. A standalone here would
 * pass every test that does not create a map and fail the ones that do, with an
 * error about session numbers that says nothing about why.
 *
 * One server for the whole run rather than one per suite: starting a replica set
 * costs seconds, and experiment-1's contract harness made a fresh store per
 * *test* — free for a temp SQLite file, not for this. Isolation comes from a
 * fresh database name per call instead, which costs nothing.
 */

// `server` lives in the Vitest main process (only `globalSetup` touches it);
// `client` lives in each worker. They are deliberately never both set in the
// same process, which is why `stopMongo` does not try to close the client — it
// runs where there has never been one.
let server: MongoMemoryReplSet | null = null;
let client: MongoClient | null = null;

/** Started once, by `globalSetup`. */
export async function startMongo(): Promise<string> {
	server ??= await MongoMemoryReplSet.create({
		replSet: { count: 1, storageEngine: 'wiredTiger' }
	});
	return server.getUri();
}

export async function stopMongo(): Promise<void> {
	await server?.stop();
	server = null;
}

/**
 * A fresh, indexed database, plus the client the repository needs for its
 * transactions.
 *
 * The indexes are not optional decoration: `ensureIndexes` is what enforces one
 * owner per map and one account per email address, and a test suite running
 * without them would quietly pass while the constraints it depends on do not
 * exist.
 */
export async function freshDatabase(): Promise<{ db: Db; client: MongoClient }> {
	const uri = process.env.MONGO_TEST_URI;
	if (!uri) {
		throw new Error('MONGO_TEST_URI is not set — is vitest globalSetup running?');
	}
	// One client for the whole run, shared across databases. Each `MongoClient`
	// is a connection pool; one per suite would multiply pools against a
	// single-node server for no benefit.
	client ??= await new MongoClient(uri).connect();
	const db = client.db(`test-${randomUUID()}`);
	await ensureIndexes(db);
	return { db, client };
}

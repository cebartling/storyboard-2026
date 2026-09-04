import { MongoClient, type Db } from 'mongodb';

/**
 * The MongoDB connection.
 *
 * Separated from `./index.ts` so it can be constructed in a test against a
 * throwaway server without `$env/dynamic/private` or the startup index run —
 * the same reason experiment-1 separated `open.ts` from its db module.
 */
export interface Connection {
	client: MongoClient;
	db: Db;
}

export async function connect(uri: string, dbName: string): Promise<Connection> {
	const client = new MongoClient(uri, {
		// The app is one process (see `keyed-lock.ts`), and requests are short.
		// A small pool is plenty and keeps a local dev machine quiet.
		maxPoolSize: 10,
		// Fail fast and say so, rather than hanging a request for 30 seconds
		// because nobody started `docker compose up`.
		serverSelectionTimeoutMS: 5000
	});
	await client.connect();
	return { client, db: client.db(dbName) };
}

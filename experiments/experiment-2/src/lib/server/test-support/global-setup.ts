import { startMongo, stopMongo } from './mongo';

/**
 * Starts one MongoDB replica set for the whole server test run and hands its
 * URI to the suites through the environment.
 *
 * `globalSetup` runs in Vitest's own process, not a worker, so the server
 * cannot be shared by exporting it — the URI can.
 */
export async function setup(): Promise<void> {
	process.env.MONGO_TEST_URI = await startMongo();
}

export async function teardown(): Promise<void> {
	await stopMongo();
}

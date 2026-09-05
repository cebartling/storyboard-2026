import { dropDatabase, E2E_DB, setting } from './mongo-env';

/**
 * Empties the e2e database before the run.
 *
 * Playwright starts `webServer` *after* `globalSetup`, so this cannot race the
 * app recreating its indexes — which matters, because dropping a database drops
 * its indexes with it.
 */
export default async function globalSetup(): Promise<void> {
	await dropDatabase(setting('MONGODB_URI'), E2E_DB);
}

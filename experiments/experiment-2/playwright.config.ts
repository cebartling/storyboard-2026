import { defineConfig } from '@playwright/test';
import { E2E_DB, setting } from './scripts/mongo-env';

const MONGODB_URI = setting('MONGODB_URI');

// e2e runs against its own database, never the dev one — it is dropped before
// each run (see `scripts/e2e-global-setup.ts`) so every run starts from nothing, and
// `src/lib/server/db/index.ts` recreates the indexes on startup.
//
// Dropping it is a `globalSetup` rather than a `rm -f` in the command, because
// emptying a database is no longer a filesystem operation. `MONGODB_URI` is
// read here rather than left to `.env`, so the value the tests drop is
// certainly the value the server connects to.
export default defineConfig({
	globalSetup: './scripts/e2e-global-setup.ts',
	webServer: {
		command: 'vite build && vite preview',
		port: 4173,
		env: { MONGODB_URI, MONGODB_DB: E2E_DB },
		reuseExistingServer: false
	},
	// Set explicitly rather than left to Playwright's inference from
	// `webServer.port`: the auth fixture builds its own browser contexts, which
	// do not inherit the test-scoped `baseURL`, and a worker fixture reads this
	// off the project config instead.
	use: { baseURL: 'http://localhost:4173' },
	testMatch: '**/*.e2e.{ts,js}'
});

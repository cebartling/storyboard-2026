import { defineConfig } from '@playwright/test';

// e2e runs against its own SQLite file (e2e.db), never the dev DB
// (local.db) — the file is removed before each run so every e2e run starts
// from an empty database, and `src/lib/server/db/index.ts`'s startup guard
// re-applies migrations to the fresh file automatically.
export default defineConfig({
	webServer: {
		command: 'rm -f e2e.db e2e.db-journal e2e.db-wal e2e.db-shm && vite build && vite preview',
		port: 4173,
		env: { DATABASE_URL: 'e2e.db' },
		reuseExistingServer: false
	},
	// Set explicitly rather than left to Playwright's inference from
	// `webServer.port`: the auth fixture builds its own browser contexts, which
	// do not inherit the test-scoped `baseURL`, and a worker fixture reads this
	// off the project config instead.
	use: { baseURL: 'http://localhost:4173' },
	testMatch: '**/*.e2e.{ts,js}'
});

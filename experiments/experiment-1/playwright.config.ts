import { defineConfig } from '@playwright/test';

// e2e runs against its own SQLite file (e2e.db), never the dev DB
// (local.db) — the file is removed before each run so every e2e run starts
// from an empty database, and `src/lib/server/db/index.ts`'s startup guard
// re-applies migrations to the fresh file automatically.
export default defineConfig({
	webServer: {
		command:
			'rm -f e2e.db e2e.db-journal e2e.db-wal e2e.db-shm && npm run build && npm run preview',
		port: 4173,
		env: { DATABASE_URL: 'e2e.db' },
		reuseExistingServer: false
	},
	testMatch: '**/*.e2e.{ts,js}'
});

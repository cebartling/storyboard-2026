import { defineConfig } from '@playwright/test';

// A headed, deliberately slow walkthrough of the collaboration features, driven
// as two real browser windows. Not part of `pnpm test:e2e` — its testMatch does
// not overlap, and nothing asserts hard enough to be a useful regression test.
//
//   corepack pnpm exec playwright test --config=playwright.demo.config.ts
export default defineConfig({
	webServer: {
		command: 'rm -f demo.db demo.db-journal demo.db-wal demo.db-shm && vite build && vite preview',
		port: 4173,
		env: { DATABASE_URL: 'demo.db' },
		reuseExistingServer: false
	},
	use: {
		baseURL: 'http://localhost:4173',
		headless: false,
		// Slow enough to read; the demo adds its own pauses where something
		// needs looking at.
		launchOptions: { slowMo: 220 }
	},
	timeout: 180_000,
	workers: 1,
	reporter: 'list',
	testMatch: '**/collab-demo.ts'
});

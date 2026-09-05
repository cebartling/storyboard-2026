import { test as base, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * Every page in this app now requires an account (ADR 0015), so every e2e test
 * needs one before it can do anything at all.
 *
 * The user is registered **once per worker** rather than once per test: it goes
 * through the real `/register` form, which is a password hash and a round trip,
 * and repeating it for each test would dominate the suite's runtime. Tests stay
 * independent because each one creates its own map — the shared account owns
 * them all, and nothing asserts on the list as a whole.
 */

interface Worker {
	workerStorageState: string;
}

interface Fixtures {
	/** A second signed-in browser context, for two-user collaboration tests. */
	newUser: (browser: Browser) => Promise<{ context: BrowserContext; page: Page; email: string }>;
}

/** Unique per worker *and* per run, so a reused e2e.db cannot collide. */
function workerEmail(workerIndex: number): string {
	return `worker-${workerIndex}-${Date.now()}@e2e.test`;
}

async function registerThrough(page: Page, email: string, displayName: string): Promise<void> {
	await page.goto('/register');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Display name').fill(displayName);
	await page.getByLabel('Password').fill('e2e-password');
	await page.getByRole('button', { name: 'Create account' }).click();
	// Registering signs you in and lands on the map list.
	await page.waitForURL('/');
}

export const test = base.extend<Fixtures, Worker>({
	workerStorageState: [
		// `baseURL` comes off the project config rather than the fixture of the
		// same name: that one is test-scoped, and a worker fixture may not depend
		// on it. A context built by hand does not inherit it either way, and
		// `page.goto('/register')` is an invalid URL without it.
		async ({ browser }, use, workerInfo) => {
			const context = await browser.newContext({
				storageState: undefined,
				baseURL: workerInfo.project.use.baseURL
			});
			const page = await context.newPage();
			const email = workerEmail(workerInfo.workerIndex);
			await registerThrough(page, email, `Worker ${workerInfo.workerIndex}`);
			// Handed back as an object rather than a file: nothing else needs it on
			// disk, and a temp file per worker is one more thing to clean up.
			const state = JSON.stringify(await context.storageState());
			await context.close();
			await use(state);
		},
		{ scope: 'worker' }
	],

	storageState: ({ workerStorageState }, use) => use(JSON.parse(workerStorageState)),

	newUser: async ({ baseURL }, use, testInfo) => {
		const opened: BrowserContext[] = [];

		await use(async (b: Browser) => {
			const context = await b.newContext({ storageState: undefined, baseURL });
			opened.push(context);
			const page = await context.newPage();
			const email = `second-${testInfo.workerIndex}-${Date.now()}-${opened.length}@e2e.test`;
			await registerThrough(page, email, `Second ${opened.length}`);
			return { context, page, email };
		});

		for (const context of opened) await context.close();
	}
});

export { expect } from '@playwright/test';

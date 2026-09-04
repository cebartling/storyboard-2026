import { expect, test } from '../e2e/auth-fixture';
import { createMap } from './maps/[mapId]/board-helpers';

// ADR 0016. These are the tests that make "multi-user" mean something: a map
// belongs to somebody, and somebody else cannot see it.

test('an anonymous visitor is sent to sign in', async ({ browser }) => {
	// A context with no stored session — the fixture's signed-in state is
	// deliberately not used here.
	const context = await browser.newContext({
		storageState: undefined,
		baseURL: 'http://localhost:4173'
	});
	const page = await context.newPage();

	await page.goto('/');

	await expect(page).toHaveURL(/\/login$/);
	await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
	await context.close();
});

test('registering signs you in, and signing out protects the app again', async ({ browser }) => {
	const context = await browser.newContext({
		storageState: undefined,
		baseURL: 'http://localhost:4173'
	});
	const page = await context.newPage();

	await page.goto('/register');
	await page.getByLabel('Email').fill(`fresh-${Date.now()}@e2e.test`);
	await page.getByLabel('Display name').fill('Fresh Account');
	await page.getByLabel('Password').fill('e2e-password');
	await page.getByRole('button', { name: 'Create account' }).click();

	await expect(page).toHaveURL('http://localhost:4173/');
	await expect(page.getByTestId('current-user')).toHaveText('Fresh Account');

	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page).toHaveURL(/\/login$/);

	// And the session is really gone, not just navigated away from.
	await page.goto('/');
	await expect(page).toHaveURL(/\/login$/);
	await context.close();
});

test('a wrong password gives one message that does not reveal whether the account exists', async ({
	browser
}) => {
	const context = await browser.newContext({
		storageState: undefined,
		baseURL: 'http://localhost:4173'
	});
	const page = await context.newPage();
	const email = `known-${Date.now()}@e2e.test`;

	await page.goto('/register');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Display name').fill('Known');
	await page.getByLabel('Password').fill('e2e-password');
	await page.getByRole('button', { name: 'Create account' }).click();
	await page.getByRole('button', { name: 'Sign out' }).click();

	// A registered address with the wrong password...
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill('not-the-password');
	await page.getByRole('button', { name: 'Sign in' }).click();
	const wrongPassword = await page.locator('p.error').textContent();

	// ...and an address with no account at all.
	await page.getByLabel('Email').fill(`nobody-${Date.now()}@e2e.test`);
	await page.getByLabel('Password').fill('not-the-password');
	await page.getByRole('button', { name: 'Sign in' }).click();
	const noAccount = await page.locator('p.error').textContent();

	// Identical, so the form cannot be used to enumerate registered addresses.
	expect(wrongPassword).toBe(noAccount);
	expect(wrongPassword).toContain('Email or password is incorrect');
	await context.close();
});

test("someone else's map is neither listed nor reachable by its URL", async ({
	page,
	newUser,
	browser
}) => {
	// The fixture user owns this one.
	const name = `Private ${Date.now()}`;
	await createMap(page, name);
	const url = page.url();

	const { page: outsider } = await newUser(browser);

	await outsider.goto('/');
	await expect(outsider.getByText(name)).toHaveCount(0);

	// 404, not 403: an outsider must not be able to tell a map that exists from
	// one that does not, or map ids become enumerable.
	await outsider.goto(url);
	await expect(outsider.getByText(/No story map with id/)).toBeVisible();
});

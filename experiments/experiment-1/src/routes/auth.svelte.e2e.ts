import { expect, test } from '../e2e/auth-fixture';
import { addActivity, createMap } from './maps/[mapId]/board-helpers';

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

test('an owner shares a map; the editor can edit it but not delete or share it', async ({
	page,
	newUser,
	browser
}) => {
	const name = `Shared ${Date.now()}`;
	await createMap(page, name);
	const url = page.url();
	await addActivity(page, 'Browse');

	const { page: editor, email } = await newUser(browser);

	// The owner shares by email address — an id is not something a person has.
	await page.getByTestId('share-map').click();
	const shareDialog = page.getByTestId('board-dialog');
	await shareDialog.getByLabel('Email address').fill(email);
	await shareDialog.getByRole('button', { name: 'Share' }).click();
	await expect(shareDialog).toBeHidden();

	// The editor now sees it in their list and can change the board.
	await editor.goto('/');
	await expect(editor.getByText(name)).toBeVisible();
	await editor.goto(url);
	await addActivity(editor, 'Checkout');
	await expect(editor.getByText('Checkout')).toBeVisible();

	// ...and the owner sees their work.
	await page.reload();
	await expect(page.getByText('Checkout')).toBeVisible();

	// But an editor gets neither destructive control.
	await expect(editor.getByTestId('share-map')).toHaveCount(0);
	await editor.goto('/');
	await expect(editor.getByRole('button', { name: `Delete ${name}` })).toHaveCount(0);
	await expect(editor.getByTestId('shared-badge')).toBeVisible();
});

test('an editor who forges a delete is refused by the server, not just by the UI', async ({
	page,
	newUser,
	browser
}) => {
	// Hiding a control is presentation; the rule has to hold when the request is
	// made anyway.
	const name = `Forged ${Date.now()}`;
	await createMap(page, name);
	const url = page.url();
	const mapId = url.split('/maps/')[1];

	const { page: editor, email } = await newUser(browser);
	await page.getByTestId('share-map').click();
	const shareDialog = page.getByTestId('board-dialog');
	await shareDialog.getByLabel('Email address').fill(email);
	await shareDialog.getByRole('button', { name: 'Share' }).click();
	await expect(shareDialog).toBeHidden();

	await editor.goto('/');
	const result = await editor.evaluate(async (id) => {
		const body = new FormData();
		body.set('mapId', id);
		const response = await fetch('?/deleteMap', { method: 'POST', body });
		// A form action's result travels inside a 200 envelope when the request
		// does not carry SvelteKit's own action header, so the refusal is in the
		// body rather than the HTTP status.
		return JSON.parse(await response.text()) as { type: string; status: number; data: string };
	}, mapId);

	expect(result.type).toBe('failure');
	expect(result.status).toBe(403);
	expect(result.data).toContain('Only the owner can delete');

	// And the map is still there for its owner.
	await page.goto(url);
	await expect(page.getByRole('heading', { name })).toBeVisible();
});

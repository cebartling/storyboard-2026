import { expect, test } from '../../../e2e/auth-fixture';
import { addActivity, addStep, addStory, createMap, dialog, firstStepId } from './board-helpers';

/**
 * Live collaboration, driven with two real browser contexts (ADR 0015 Stage 1).
 *
 * The one rule that keeps these from flaking: **wait for both boards to report
 * `data-collab-state="connected"` before mutating anything.** Otherwise a change
 * can be published before the other client has subscribed, and the test races
 * the stream rather than testing it. Everything after that is a polling
 * `expect`, so no fixed waits are needed.
 */
async function shareWith(owner: import('@playwright/test').Page, email: string) {
	await owner.getByTestId('share-map').click();
	const share = dialog(owner);
	await share.getByLabel('Email address').fill(email);
	await share.getByRole('button', { name: 'Share' }).click();
	await expect(share).toBeHidden();
}

async function bothConnected(...pages: import('@playwright/test').Page[]) {
	for (const page of pages) {
		await expect(page.getByTestId('board')).toHaveAttribute('data-collab-state', 'connected');
	}
}

test("an activity added by one editor appears on the other's board", async ({
	page,
	newUser,
	browser
}) => {
	await createMap(page, `Collab ${Date.now()}`);
	const url = page.url();
	const { page: other, email } = await newUser(browser);
	await shareWith(page, email);
	await other.goto(url);
	await bothConnected(page, other);

	await addActivity(page, 'Browse');

	// No reload: the other board learns of the change over its event stream and
	// refetches itself.
	await expect(other.getByText('Browse')).toBeVisible();
});

test('a story added by one editor appears on the other, both ways round', async ({
	page,
	newUser,
	browser
}) => {
	await createMap(page, `Collab ${Date.now()}`);
	await addActivity(page, 'Browse');
	await addStep(page, 'Search products');
	const url = page.url();
	const stepId = await firstStepId(page);

	const { page: other, email } = await newUser(browser);
	await shareWith(page, email);
	await other.goto(url);
	await bothConnected(page, other);

	await addStory(page, stepId, 'unsliced', 'From the owner');
	await expect(other.getByText('From the owner')).toBeVisible();

	// And back the other way, which is what makes it collaboration rather than
	// a one-directional feed.
	await addStory(other, stepId, 'unsliced', 'From the editor');
	await expect(page.getByText('From the editor')).toBeVisible();
});

test('an open editor is told when someone else changes what it is editing', async ({
	page,
	newUser,
	browser
}) => {
	await createMap(page, `Collab ${Date.now()}`);
	await addActivity(page, 'Browse');
	await addStep(page, 'Search products');
	const url = page.url();
	const stepId = await firstStepId(page);
	await addStory(page, stepId, 'unsliced', 'Keyword search');

	const { page: other, email } = await newUser(browser);
	await shareWith(page, email);
	await other.goto(url);
	await bothConnected(page, other);

	// The owner opens the story editor and leaves it open.
	await page
		.locator('[data-testid^="story-"]')
		.first()
		.getByRole('button', { name: /edit story/i })
		.click();
	const editor = dialog(page);
	await expect(editor).toBeVisible();

	// The other editor renames that very story.
	await other
		.locator('[data-testid^="story-"]')
		.first()
		.getByRole('button', { name: /edit story/i })
		.click();
	const theirs = dialog(other);
	await theirs.getByLabel('Story title').fill('Renamed by them');
	await theirs.getByRole('button', { name: 'Save' }).click();
	await expect(theirs).toBeHidden();

	// The open dialog learns, without the owner having done anything.
	await expect(editor.getByTestId('subject-changed')).toBeVisible();
	// Saving is now an explicit overwrite rather than a silent one.
	await expect(editor.getByRole('button', { name: 'Save mine anyway' })).toBeVisible();

	// ...and they can take the other version instead.
	await editor.getByRole('button', { name: 'Use their version' }).click();
	await expect(editor.getByLabel('Story title')).toHaveValue('Renamed by them');
});

test('an open editor is told when someone else deletes what it is editing', async ({
	page,
	newUser,
	browser
}) => {
	await createMap(page, `Collab ${Date.now()}`);
	await addActivity(page, 'Browse');
	await addStep(page, 'Search products');
	const url = page.url();
	const stepId = await firstStepId(page);
	await addStory(page, stepId, 'unsliced', 'Doomed story');

	const { page: other, email } = await newUser(browser);
	await shareWith(page, email);
	await other.goto(url);
	await bothConnected(page, other);

	await page
		.locator('[data-testid^="story-"]')
		.first()
		.getByRole('button', { name: /edit story/i })
		.click();
	const editor = dialog(page);
	await expect(editor).toBeVisible();

	await other
		.locator('[data-testid^="story-"]')
		.first()
		.getByRole('button', { name: /edit story/i })
		.click();
	await dialog(other).getByRole('button', { name: 'Delete story' }).click();

	// Told plainly, and with saving disabled — before, this surfaced as a
	// confusing "Story not found" on save.
	await expect(editor.getByTestId('subject-deleted')).toBeVisible();
	await expect(editor.getByRole('button', { name: 'Save' })).toBeDisabled();
});

test("another editor's presence is visible on the board", async ({ page, newUser, browser }) => {
	await createMap(page, `Collab ${Date.now()}`);
	const url = page.url();
	const { page: other, email } = await newUser(browser);
	await shareWith(page, email);
	await other.goto(url);
	await bothConnected(page, other);

	// Avatars carry initials; the full name is on the label (and the tooltip).
	await expect(page.getByTestId('presence').getByLabel(/^Second/)).toBeVisible();
	await expect(other.getByTestId('presence').getByLabel(/^Worker/)).toBeVisible();

	// Each viewer is marked to themselves, and neither is listed twice.
	await expect(page.getByTestId('presence').getByLabel(/\(you\)$/)).toHaveCount(1);
	await expect(page.getByTestId('presence').locator('li')).toHaveCount(2);
});

test('a dropped stream reconnects and catches up, without a reload', async ({
	page,
	newUser,
	browser
}) => {
	await createMap(page, `Collab ${Date.now()}`);
	await addActivity(page, 'Browse');
	const url = page.url();

	const { page: other, email } = await newUser(browser);
	await shareWith(page, email);
	await other.goto(url);
	await bothConnected(page, other);

	// Cut the event stream specifically, rather than taking the whole context
	// offline. `setOffline` leaves an already-open stream connected but blocks
	// the refetch it triggers, and SvelteKit answers a failed load with a
	// full-page navigation — so the test would be measuring the browser's
	// offline page rather than reconnection.
	await other.route('**/events*', (route) => route.abort());
	await other.evaluate(() => {
		// Force the open stream to error now, instead of waiting for a heartbeat
		// to notice: `route` only affects connections made from here on.
		window.dispatchEvent(new Event('offline'));
	});

	await addStep(page, 'Search products');
	await expect(other.getByTestId('board')).toHaveAttribute('data-collab-state', 'reconnecting', {
		timeout: 15_000
	});

	// Restore it, and the client catches up on its own — no reload anywhere in
	// this test.
	await other.unroute('**/events*');

	await expect(other.getByTestId('board')).toHaveAttribute('data-collab-state', 'connected', {
		timeout: 20_000
	});
	await expect(other.getByText('Search products')).toBeVisible({ timeout: 20_000 });
});

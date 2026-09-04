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

// There is deliberately no end-to-end reconnection test here. Severing an
// established EventSource from Playwright is not possible: `route.abort` only
// affects connections opened after it is installed, and CDP's offline emulation
// leaves an already-running stream connected. An earlier version of this file
// appeared to test reconnection, but it only passed because of a bug — the page
// rebuilt its stream on every refetch, so aborting `/events` caught the
// *replacement* connection rather than the original.
//
// The behaviour is covered where the precondition can actually be created:
// `src/lib/collab/map-sync.svelte.test.ts` drives the client through an error
// into a backed-off reconnect and asserts it resumes from its last position,
// and `src/lib/server/collab/map-hub.test.ts` covers replay past `lastSeq` and
// the resync a client too far behind receives.

test("another editor's pointer appears, in the same colour as their avatar", async ({
	page,
	newUser,
	browser
}) => {
	// The claim the demo narrates out loud, which nothing checked until now: it
	// moved a pointer and captioned "that is Bob's pointer, in his colour" with
	// no assertion behind it, so a board where cursors had stopped rendering
	// would have demoed exactly the same.
	await createMap(page, `Collab ${Date.now()}`);
	await addActivity(page, 'Browse');
	const url = page.url();
	const { page: other, email } = await newUser(browser);
	await shareWith(page, email);
	await other.goto(url);
	await bothConnected(page, other);

	// The other editor moves their pointer across their own board.
	const board = other.getByTestId('board');
	const box = (await board.boundingBox())!;
	for (let i = 0; i <= 10; i += 1) {
		await other.mouse.move(box.x + 60 + i * 40, box.y + 100 + i * 12);
		await other.waitForTimeout(100);
	}

	const cursor = page.locator('[data-testid^="remote-cursor-"]');
	await expect(cursor).toHaveCount(1);
	await expect(cursor).toContainText('Second');

	// Same hue as their avatar in the header — one person, one colour, whether
	// you are looking at the top of the screen or the middle of the board.
	const iconClass = (await cursor.locator('svg').first().getAttribute('class')) ?? '';
	const avatarClass =
		(await page
			.getByTestId('presence')
			.getByLabel(/^Second/)
			.getAttribute('class')) ?? '';
	const hue = (classes: string, prefix: string) =>
		classes
			.split(/\s+/)
			.find((c) => c.startsWith(prefix))
			?.slice(prefix.length);
	expect(hue(iconClass, 'text-')).toBeTruthy();
	expect(hue(iconClass, 'text-')).toBe(hue(avatarClass, 'bg-'));

	// And nobody sees their own pointer echoed back at them — it would fight the
	// real one.
	await expect(other.locator('[data-testid^="remote-cursor-"]')).toHaveCount(0);
});

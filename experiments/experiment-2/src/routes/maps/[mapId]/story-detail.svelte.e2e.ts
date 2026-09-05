import type { Page } from '@playwright/test';
import { expect, test } from '../../../e2e/auth-fixture';
import { addActivity, addStep, addStory, createMap, dialog, firstStepId } from './board-helpers';

/**
 * The read-only story detail view (ADR 0018): the only surface where a
 * description is legible, and the only `{@html}` in the app.
 *
 * These assert on rendered *structure* — `strong`, `li` — rather than on text,
 * because "the markdown was rendered" and "the markdown source was printed"
 * both contain the same characters.
 */

/** Sets a description through the editor, which is the only way to write one. */
async function describeStory(page: Page, title: string, description: string) {
	await page.getByRole('button', { name: `Edit story ${title}` }).click();
	const editor = dialog(page);
	await editor.getByLabel('Description').fill(description);
	await editor.getByRole('button', { name: 'Save' }).click();
	await expect(editor).toBeHidden();
}

async function openDetail(page: Page, title: string) {
	await page.getByRole('button', { name: `View story ${title}` }).click();
	const detail = dialog(page);
	await expect(detail).toBeVisible();
	return detail;
}

/** A backbone with one story, which is all any of these need. */
async function boardWithStory(page: Page, title: string) {
	await createMap(page, `E2E story detail ${Date.now()}`);
	await addActivity(page, 'Browse');
	await addStep(page, 'Search products');
	await addStory(page, await firstStepId(page), 'unsliced', title);
}

test('renders a story description as Markdown', async ({ page }) => {
	await boardWithStory(page, 'Search by keyword');
	await describeStory(
		page,
		'Search by keyword',
		'As a shopper I want **fuzzy** matching so that:\n\n- typos still find things\n- SKUs work too\n\n## Open questions\n\nHow far should `levenshtein` go?'
	);

	const detail = await openDetail(page, 'Search by keyword');
	const body = detail.getByTestId('story-description');

	await expect(body.locator('strong')).toHaveText('fuzzy');
	await expect(body.locator('li')).toHaveText(['typos still find things', 'SKUs work too']);
	await expect(body.locator('h2')).toHaveText('Open questions');
	await expect(body.locator('code')).toHaveText('levenshtein');
	// The source punctuation is gone, which is the difference between rendering
	// the markdown and printing it.
	await expect(body).not.toContainText('**');
});

test('survives a reload, because the description is stored as source', async ({ page }) => {
	await boardWithStory(page, 'Filter by category');
	await describeStory(page, 'Filter by category', 'Needs **facets**');

	await page.reload();
	const detail = await openDetail(page, 'Filter by category');

	await expect(detail.getByTestId('story-description').locator('strong')).toHaveText('facets');
});

test('says so when a story has no description', async ({ page }) => {
	await boardWithStory(page, 'Sort results');

	const detail = await openDetail(page, 'Sort results');

	await expect(detail).toContainText(/no description/i);
	await expect(detail.getByTestId('story-description')).toHaveCount(0);
});

test('offers an edit trigger that swaps to the story editor', async ({ page }) => {
	await boardWithStory(page, 'Search by keyword');

	const detail = await openDetail(page, 'Search by keyword');
	await detail.getByRole('button', { name: 'Edit story' }).click();

	// The same dialog element, now showing the editor for the story it was
	// displaying — so the title is prefilled without being looked up again.
	await expect(dialog(page).getByLabel('Story title')).toHaveValue('Search by keyword');
});

/**
 * The security property, at the level it actually matters: a description
 * written by an invited editor, rendered in the owner's browser (ADR 0015).
 * There is no CSP behind this `{@html}`, so `renderMarkdown` is the only thing
 * standing between these two accounts.
 */
test("a hostile description from an editor cannot run in the owner's browser", async ({
	page,
	newUser,
	browser
}) => {
	await boardWithStory(page, 'Search by keyword');
	const url = page.url();

	const { page: editor, email } = await newUser(browser);
	await page.getByTestId('share-map').click();
	const share = dialog(page);
	await share.getByLabel('Email address').fill(email);
	await share.getByRole('button', { name: 'Share' }).click();
	await expect(share).toBeHidden();

	await editor.goto(url);
	// Both boards subscribed before either mutates, or the test races the
	// stream rather than testing it (the rule collab.svelte.e2e.ts records).
	for (const p of [page, editor]) {
		await expect(p.getByTestId('board')).toHaveAttribute('data-collab-state', 'connected');
	}

	await describeStory(
		editor,
		'Search by keyword',
		'<script>window.pwned = true;</script>\n\n<img src=x onerror="window.pwned = true">\n\n[tap](javascript:window.pwned=true)\n\nStill **readable**.'
	);

	const detail = await openDetail(page, 'Search by keyword');
	const body = detail.getByTestId('story-description');

	// Nothing executed, and no vector survived into the owner's DOM.
	await expect(body.locator('script, iframe, object')).toHaveCount(0);
	expect(await body.locator('[onerror], [onclick]').count()).toBe(0);
	expect(await page.evaluate(() => 'pwned' in window)).toBe(false);
	await expect(body.locator('a[href^="javascript:"]')).toHaveCount(0);

	// And the legitimate part of the same description still renders, so this is
	// sanitisation rather than refusing to show anything at all.
	await expect(body.locator('strong')).toHaveText('readable');
});

test('opens description links in a new tab without leaking the opener', async ({ page }) => {
	await boardWithStory(page, 'Search by keyword');
	await describeStory(page, 'Search by keyword', 'See [the spec](https://example.com/spec).');

	const link = (await openDetail(page, 'Search by keyword')).getByRole('link', {
		name: 'the spec'
	});

	await expect(link).toHaveAttribute('href', 'https://example.com/spec');
	await expect(link).toHaveAttribute('target', '_blank');
	await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

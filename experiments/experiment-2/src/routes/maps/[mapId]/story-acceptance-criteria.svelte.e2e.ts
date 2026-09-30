import type { Page } from '@playwright/test';
import { expect, test } from '../../../e2e/auth-fixture';
import {
	addActivity,
	addCriterion,
	addStep,
	addStory,
	createMap,
	criterionTexts,
	dialog,
	firstStepId,
	openStory,
	toggleCriterion
} from './board-helpers';

/**
 * Acceptance criteria on a story (ADR 0024), added and ticked in the detail
 * dialog.
 *
 * The domain and component suites cover the rules and the markup in isolation.
 * What only a real board shows is the round trip — the form posts, the nested
 * array survives `toDocument`, and the order and the ticks come back after a
 * reload — plus the two behaviours that are properties of the whole page: the
 * dialog staying open across its writes, and a refused `done`.
 */

/** A board with one step and one story on it. */
async function boardWithStory(page: Page, title: string) {
	await createMap(page, `E2E criteria ${Date.now()}`);
	await addActivity(page, 'Browse');
	await addStep(page, 'Search products');
	const stepId = await firstStepId(page);
	await addStory(page, stepId, 'unsliced', title);
}

async function setStatus(page: Page, title: string, label: string) {
	await page.getByRole('button', { name: `Edit story ${title}` }).click();
	const editor = dialog(page);
	await expect(editor).toBeVisible();
	await editor.getByLabel('Status').selectOption({ label });
	await editor.getByRole('button', { name: 'Save' }).click();
	return editor;
}

test('adds acceptance criteria and keeps them, in order, across a reload', async ({ page }) => {
	await boardWithStory(page, 'Search by keyword');

	const detail = await openStory(page, 'Search by keyword');
	await expect(detail).toContainText('No acceptance criteria.');

	// Two from one open dialog, which also pins the version re-snapshot: the
	// second add would be refused as a conflict with nobody if the dialog kept
	// the version it was opened at.
	await addCriterion(page, 'Search by keyword', 'Matches partial words');
	await addCriterion(page, 'Search by keyword', 'Rejects an empty query');

	await expect(criterionTexts(page)).toHaveText([
		'Matches partial words',
		'Rejects an empty query'
	]);

	await page.reload();
	const reopened = await openStory(page, 'Search by keyword');

	await expect(criterionTexts(page)).toHaveText([
		'Matches partial words',
		'Rejects an empty query'
	]);
	await expect(reopened.getByTestId('criteria-tally')).toHaveText('0 of 2 met');
});

test('ticking a criterion survives a reload, and advances the map version', async ({ page }) => {
	// The contrast with slice density (ADR 0020), which is per-viewer and never
	// writes. Whether a criterion is met is a fact about the map, so it goes
	// through the same versioned write path as any other edit.
	await boardWithStory(page, 'Sort by price');
	await openStory(page, 'Sort by price');
	await addCriterion(page, 'Sort by price', 'Sorts ascending and descending');
	await dialog(page).getByRole('button', { name: 'Close' }).click();

	const board = page.getByTestId('board');
	const before = await board.getAttribute('data-board-version');

	await openStory(page, 'Sort by price');
	await toggleCriterion(page, 'Sorts ascending and descending');

	await expect(board).not.toHaveAttribute('data-board-version', before!);
	await expect(dialog(page).getByTestId('criteria-tally')).toHaveText('1 of 1 met');

	await page.reload();
	const reopened = await openStory(page, 'Sort by price');

	await expect(reopened.getByTestId('criteria-tally')).toHaveText('1 of 1 met');
	await expect(
		reopened.getByRole('button', { name: 'Mark “Sorts ascending and descending” not met' })
	).toHaveAttribute('aria-pressed', 'true');
});

test('unticking a criterion is not a silent no-op', async ({ page }) => {
	// The failure this guards is quiet: an unchecked checkbox posts nothing, so a
	// lenient parser would make unticking appear to work and change nothing.
	await boardWithStory(page, 'Filter by size');
	await openStory(page, 'Filter by size');
	await addCriterion(page, 'Filter by size', 'Sizes come from the catalogue');
	await toggleCriterion(page, 'Sizes come from the catalogue');
	await expect(dialog(page).getByTestId('criteria-tally')).toHaveText('1 of 1 met');

	await toggleCriterion(page, 'Sizes come from the catalogue');

	await expect(dialog(page).getByTestId('criteria-tally')).toHaveText('0 of 1 met');
	await page.reload();
	const reopened = await openStory(page, 'Filter by size');
	await expect(reopened.getByTestId('criteria-tally')).toHaveText('0 of 1 met');
});

test('removing a criterion keeps the dialog open, with focus in the criteria list', async ({
	page
}) => {
	await boardWithStory(page, 'Search by SKU');
	await openStory(page, 'Search by SKU');
	await addCriterion(page, 'Search by SKU', 'Exact SKU matches first');
	await addCriterion(page, 'Search by SKU', 'Unknown SKUs say so');

	const detail = dialog(page);
	await detail.getByRole('button', { name: 'Remove “Exact SKU matches first”' }).click();

	await expect(detail).toBeVisible();
	await expect(criterionTexts(page)).toHaveText(['Unknown SKUs say so']);
	// The clicked control is gone from the DOM, so focus has to be placed. It
	// must land in the criteria section rather than the dependency one.
	await expect(detail.getByTestId('acceptance-criteria-list')).toBeVisible();
	const focusedTestid = await page.evaluate(() =>
		document.activeElement?.closest('[tabindex="-1"]')?.querySelector('p')?.textContent?.trim()
	);
	expect(focusedTestid).toBe('Acceptance criteria');
});

test('reorders criteria with the move controls', async ({ page }) => {
	await boardWithStory(page, 'Browse the catalogue');
	await openStory(page, 'Browse the catalogue');
	await addCriterion(page, 'Browse the catalogue', 'First');
	await addCriterion(page, 'Browse the catalogue', 'Second');
	await addCriterion(page, 'Browse the catalogue', 'Third');

	await dialog(page).getByRole('button', { name: 'Move “Third” up' }).click();

	await expect(criterionTexts(page)).toHaveText(['First', 'Third', 'Second']);

	await page.reload();
	await openStory(page, 'Browse the catalogue');
	await expect(criterionTexts(page)).toHaveText(['First', 'Third', 'Second']);
});

test('refuses done while a criterion is unmet, and allows it once they are met', async ({
	page
}) => {
	// The gate (ADR 0024). Criteria constrain exactly one status; the refusal
	// names the same tally the dialog shows, so the two cannot disagree.
	await boardWithStory(page, 'Checkout as a guest');
	await openStory(page, 'Checkout as a guest');
	await addCriterion(page, 'Checkout as a guest', 'No account is required');
	await addCriterion(page, 'Checkout as a guest', 'An email receipt is sent');
	await dialog(page).getByRole('button', { name: 'Close' }).click();

	const editor = await setStatus(page, 'Checkout as a guest', 'Done');

	// A refused write keeps the editor open and owns its message.
	await expect(editor).toBeVisible();
	await expect(editor.locator('p.error')).toContainText('2 of 2');
	await editor.getByRole('button', { name: 'Close' }).click();

	await openStory(page, 'Checkout as a guest');
	await toggleCriterion(page, 'No account is required');
	await toggleCriterion(page, 'An email receipt is sent');
	await dialog(page).getByRole('button', { name: 'Close' }).click();

	const second = await setStatus(page, 'Checkout as a guest', 'Done');

	await expect(second).toBeHidden();
	await expect(page.getByRole('img', { name: 'Status: Done' })).toBeVisible();
});

test('a done story drops back to in review when a criterion is unticked', async ({ page }) => {
	await boardWithStory(page, 'Apply a discount code');
	await openStory(page, 'Apply a discount code');
	await addCriterion(page, 'Apply a discount code', 'Expired codes are refused');
	await toggleCriterion(page, 'Expired codes are refused');
	await dialog(page).getByRole('button', { name: 'Close' }).click();
	await setStatus(page, 'Apply a discount code', 'Done');
	await expect(page.getByRole('img', { name: 'Status: Done' })).toBeVisible();

	await openStory(page, 'Apply a discount code');
	await toggleCriterion(page, 'Expired codes are refused');
	await dialog(page).getByRole('button', { name: 'Close' }).click();

	await expect(page.getByRole('img', { name: 'Status: In review' })).toBeVisible();
});

test('criteria go with their story when it is deleted', async ({ page }) => {
	await boardWithStory(page, 'Save a wishlist');
	await openStory(page, 'Save a wishlist');
	await addCriterion(page, 'Save a wishlist', 'A wishlist survives sign-out');
	await dialog(page).getByRole('button', { name: 'Close' }).click();

	await page.getByRole('button', { name: 'Edit story Save a wishlist' }).click();
	const editor = dialog(page);
	await editor.getByRole('button', { name: 'Delete' }).click();
	await expect(editor).toBeHidden();

	// Nothing dangles, and the board still loads — which is the whole of the
	// cascade's observable behaviour from out here.
	await page.reload();
	await expect(page.getByTestId('board')).toBeVisible();
	await expect(page.getByRole('button', { name: 'View story Save a wishlist' })).toHaveCount(0);
});

import type { Page } from '@playwright/test';
import { expect, test } from '../../../e2e/auth-fixture';
import { addActivity, addStep, addStory, createMap, dialog, firstStepId } from './board-helpers';

/**
 * Colour-coding story cards by status (ADR 0021), set in the edit dialog.
 *
 * The unit and component suites already cover the mapping and the chip in
 * isolation. What only a real board can show is the round trip: the select
 * posts, the aggregate stores it, and the card comes back painted after a
 * reload — which is also the check that the field survives `toDocument`.
 */

/** A board with one step and one story on it. */
async function boardWithStory(page: Page, title: string) {
	await createMap(page, `E2E status ${Date.now()}`);
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
	await expect(editor).toBeHidden();
}

test('sets a story status and paints the card, across a reload', async ({ page }) => {
	await boardWithStory(page, 'Search by keyword');

	// Every story starts in the default, and says so rather than showing a
	// blank chip.
	const card = page.getByRole('img', { name: /^Status: / });
	await expect(card).toHaveText('To do');

	await setStatus(page, 'Search by keyword', 'In progress');

	await expect(page.getByRole('img', { name: 'Status: In progress' })).toBeVisible();
	const storyCard = page.locator('[data-testid^="story-"]').first();
	await expect(storyCard).toHaveClass(/bg-status-in-progress\/8/);

	// The half a component test cannot reach: it is on the aggregate, not in
	// the page's memory.
	await page.reload();

	await expect(page.getByRole('img', { name: 'Status: In progress' })).toBeVisible();
});

test('reopening the editor preselects the status the story now has', async ({ page }) => {
	// The dialog is the only place a status is set, so an editor that opened on
	// the wrong value would silently reset the story on the next save.
	await boardWithStory(page, 'Filter by category');
	await setStatus(page, 'Filter by category', 'Done');

	await page.getByRole('button', { name: 'Edit story Filter by category' }).click();
	const editor = dialog(page);

	await expect(editor.getByLabel('Status')).toHaveValue('done');
});

test('a status change is an edit to the map, and advances its version', async ({ page }) => {
	// The contrast with slice collapse (ADR 0020), which is per-viewer and must
	// never write. A status is a fact about the map, so it goes through the same
	// versioned write path as any other edit — which is what lets a collaborator
	// see it.
	await boardWithStory(page, 'Sort by price');
	const board = page.getByTestId('board');
	const before = await board.getAttribute('data-board-version');

	await setStatus(page, 'Sort by price', 'In review');

	await expect(board).not.toHaveAttribute('data-board-version', before!);
});

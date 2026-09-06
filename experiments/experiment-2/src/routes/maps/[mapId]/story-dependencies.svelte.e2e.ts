import type { Page } from '@playwright/test';
import { expect, test } from '../../../e2e/auth-fixture';
import { addActivity, addStep, addStory, createMap, dialog, firstStepId } from './board-helpers';

/**
 * Directional blocks-edges between stories (ADR 0019), created and removed in
 * the story detail dialog.
 *
 * The dialog stays open across a write, which is unusual here — every other
 * editor closes on success. That makes two of these tests about the dialog
 * surviving its own mutations rather than about dependencies as such.
 */

async function openStory(page: Page, title: string) {
	await page.getByRole('button', { name: `View story ${title}` }).click();
	const detail = dialog(page);
	await expect(detail).toBeVisible();
	return detail;
}

/** Links two stories from `from`'s detail dialog, and leaves it open. */
async function link(page: Page, from: string, direction: 'blocks' | 'blockedBy', to: string) {
	const detail = await openStory(page, from);
	await detail.getByRole('button', { name: 'Add dependency' }).click();
	await detail
		.getByLabel(direction === 'blocks' ? 'This story blocks' : 'This story is blocked by')
		.check();
	await detail.getByLabel('Find a story').fill(to);
	await detail.getByRole('radio', { name: new RegExp(to) }).check();
	await detail.getByRole('button', { name: 'Add', exact: true }).click();
	return detail;
}

/** A board with one step and the named stories on it. */
async function boardWith(page: Page, ...titles: string[]) {
	await createMap(page, `E2E dependencies ${Date.now()}`);
	await addActivity(page, 'Browse');
	await addStep(page, 'Search products');
	const stepId = await firstStepId(page);
	for (const title of titles) await addStory(page, stepId, 'unsliced', title);
	return stepId;
}

test('links one story to another, and both stories say so', async ({ page }) => {
	await boardWith(page, 'Create a product', 'Search by keyword');

	const detail = await link(page, 'Create a product', 'blocks', 'Search by keyword');

	// The dialog stays open, and the new edge is in it.
	await expect(detail).toBeVisible();
	await expect(detail.getByTestId('blocks-list')).toContainText('Search by keyword');

	// And the other end says the opposite, which is the whole point of the edge
	// being directional.
	await detail.getByRole('button', { name: 'Close' }).click();
	const other = await openStory(page, 'Search by keyword');
	await expect(other.getByTestId('blocked-by-list')).toContainText('Create a product');
});

test('badges only the blocked story, not the blocker', async ({ page }) => {
	await boardWith(page, 'Create a product', 'Search by keyword');
	const detail = await link(page, 'Create a product', 'blocks', 'Search by keyword');
	await detail.getByRole('button', { name: 'Close' }).click();

	const blocked = page.locator('[data-testid^="deps-badge-"]');
	await expect(blocked).toHaveCount(1);
	await expect(blocked).toHaveText('1');
	await expect(blocked).toHaveAttribute('aria-label', 'Blocked by 1 story');
});

test('refuses a dependency that would close a loop', async ({ page }) => {
	await boardWith(page, 'A', 'B', 'C');
	await (await link(page, 'A', 'blocks', 'B')).getByRole('button', { name: 'Close' }).click();
	await (await link(page, 'B', 'blocks', 'C')).getByRole('button', { name: 'Close' }).click();

	// C blocking A would close A -> B -> C -> A.
	const detail = await link(page, 'C', 'blocks', 'A');

	await expect(detail.locator('p.error')).toContainText('cycle');
	// Nothing was written, so C still blocks nothing at all — asserted as an
	// absent list rather than a list without "A", since `not.toContainText`
	// fails on an element that does not exist.
	await expect(detail.getByTestId('blocks-list')).toHaveCount(0);
});

test('removes a dependency and keeps the dialog open', async ({ page }) => {
	await boardWith(page, 'Create a product', 'Search by keyword');
	const detail = await link(page, 'Create a product', 'blocks', 'Search by keyword');

	await detail.getByRole('button', { name: 'Remove dependency on Search by keyword' }).click();

	await expect(detail).toBeVisible();
	await expect(detail.getByTestId('blocks-list')).toHaveCount(0);
	await detail.getByRole('button', { name: 'Close' }).click();
	await expect(page.locator('[data-testid^="deps-badge-"]')).toHaveCount(0);
});

// The dialog survives a write, so it can make two — and each one spends a
// version. This is the case that fails if the dialog does not re-snapshot.
test('adds two dependencies in a row from one open dialog', async ({ page }) => {
	await boardWith(page, 'Create a product', 'Search by keyword', 'Filter by price');

	const detail = await link(page, 'Create a product', 'blocks', 'Search by keyword');
	await detail.getByRole('button', { name: 'Add dependency' }).click();
	await detail.getByLabel('Find a story').fill('Filter by price');
	await detail.getByRole('radio', { name: /Filter by price/ }).check();
	await detail.getByRole('button', { name: 'Add', exact: true }).click();

	await expect(detail.locator('p.error')).toHaveCount(0);
	await expect(detail.getByTestId('blocks-list')).toContainText('Search by keyword');
	await expect(detail.getByTestId('blocks-list')).toContainText('Filter by price');
});

test('drops dependencies when a story is deleted', async ({ page }) => {
	await boardWith(page, 'Create a product', 'Search by keyword');
	await (
		await link(page, 'Create a product', 'blocks', 'Search by keyword')
	)
		.getByRole('button', { name: 'Close' })
		.click();

	await page.getByRole('button', { name: 'Edit story Search by keyword' }).click();
	await dialog(page).getByRole('button', { name: 'Delete story' }).click();
	await expect(dialog(page)).toBeHidden();

	const detail = await openStory(page, 'Create a product');
	await expect(detail.getByTestId('blocks-list')).toHaveCount(0);
	await expect(page.locator('[data-testid^="deps-badge-"]')).toHaveCount(0);
});

test('narrows the candidate list as you type', async ({ page }) => {
	await boardWith(page, 'Anchor', 'Search by keyword', 'Search by SKU', 'Filter by price');

	const detail = await openStory(page, 'Anchor');
	await detail.getByRole('button', { name: 'Add dependency' }).click();
	// Scoped to the candidate group: the direction radios sit in the same form.
	const candidates = detail.getByRole('radiogroup', { name: 'Candidate stories' });
	await expect(candidates.getByRole('radio')).toHaveCount(3);

	await detail.getByLabel('Find a story').fill('Search by');

	await expect(candidates.getByRole('radio')).toHaveCount(2);
	await expect(detail.getByTestId('candidate-count')).toContainText('2');
});

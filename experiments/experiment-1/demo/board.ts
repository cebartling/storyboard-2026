import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The board interactions the demo needs, in the demo's own words.
 *
 * These are near-copies of `src/routes/maps/[mapId]/board-helpers.ts`, and the
 * duplication is deliberate. The e2e suite and the demo want different things
 * from the same clicks: the suite wants to be fast and to assert hard, the demo
 * wants to be legible and to pause where a person needs to look. Sharing one
 * set of helpers meant a selector change made for the suite could silently
 * break the demo — a coupling that was flagged in CLAUDE.md and never actually
 * wanted.
 *
 * The cost is that a markup change now has to be made in two places. That is
 * the trade: the suite is the thing that must not break, and it keeps its own.
 */

/**
 * The one open dialog. **Every in-dialog query must be scoped through this.**
 * A trigger deliberately carries the same name as the submit button it leads to
 * ("Add activity" opens a dialog whose submit is also "Add activity"), so an
 * unscoped `getByRole('button', ...)` is ambiguous under strict mode while a
 * dialog is open.
 */
export function dialog(page: Page): Locator {
	return page.getByRole('dialog');
}

/** Submits the open dialog and waits for it to close, which only happens on
 *  success — so this also asserts the action did not fail. */
async function submitDialog(page: Page, name: string) {
	const open = dialog(page);
	await open.getByRole('button', { name }).click();
	await expect(open).toBeHidden();
}

export async function createMap(page: Page, name: string) {
	await page.goto('/');
	await page.getByLabel('New map name').fill(name);
	await page.getByRole('button', { name: 'Create map' }).click();
	await expect(page).toHaveURL(/\/maps\/[^/]+$/);
	await expect(page.getByRole('heading', { name })).toBeVisible();
}

export async function addActivity(page: Page, name: string) {
	await page.getByRole('button', { name: 'Add activity' }).click();
	await dialog(page).getByLabel('New activity').fill(name);
	await submitDialog(page, 'Add activity');
}

export async function addStep(page: Page, name: string, activity?: Locator) {
	await (activity ?? page).getByRole('button', { name: 'Add step' }).click();
	await dialog(page).getByLabel('New step name').fill(name);
	await submitDialog(page, 'Add step');
}

export async function addSlice(page: Page, name: string) {
	await page.getByRole('button', { name: 'Add slice' }).click();
	await dialog(page).getByLabel('New slice').fill(name);
	await submitDialog(page, 'Add slice');
}

/**
 * `sliceKey` is a slice id, or the literal 'unsliced' for the bottom band.
 *
 * The add-story dialog stays open on success and clears itself, so several
 * stories can be entered in a row (ADR 0011); this closes it explicitly.
 */
export async function addStory(page: Page, stepId: string, sliceKey: string, title: string) {
	await page.getByTestId(`add-story-${stepId}-${sliceKey}`).click();
	const open = dialog(page);
	await open.getByLabel('New story title').fill(title);
	await open.getByRole('button', { name: 'Add story' }).click();
	await expect(open.getByLabel('New story title')).toHaveValue('');
	await expect(open.locator('p.error')).toHaveCount(0);
	await open.getByRole('button', { name: 'Close' }).click();
	await expect(open).toBeHidden();
}

/** The first step's id, as the board actually rendered it. */
export async function firstStepId(page: Page): Promise<string> {
	const testid = await page.locator('[data-testid^="step-"]').first().getAttribute('data-testid');
	return testid!.replace('step-', '');
}

import { expect, type Locator, type Page } from '@playwright/test';

// Shared setup for the board's Playwright specs. Building a backbone became a
// multi-step interaction once the inline forms moved into dialogs (ADR 0011),
// and both specs need the same sequence, so it lives here rather than being
// written out twice.
//
// Not named `*.e2e.ts`: `playwright.config.ts` matches `**/*.e2e.{ts,js}`, so
// this file is a plain module rather than a suite of its own.

/**
 * The one open dialog. **Every in-dialog query must be scoped through this.**
 * A trigger deliberately carries the same name as the submit button it leads
 * to ("Add activity" opens a dialog whose submit is also "Add activity"), so
 * an unscoped `getByRole('button', ...)` is ambiguous under strict mode while
 * a dialog is open.
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

/** `activity` scopes the trigger when the board has more than one activity. */
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
 * Unlike every other editor, the add-story dialog stays open on success and
 * clears itself, so several stories can be entered in a row (ADR 0011). This
 * closes it explicitly and waits for the card rather than for the dialog to
 * vanish on its own.
 */
export async function addStory(page: Page, stepId: string, sliceKey: string, title: string) {
	await page.getByTestId(`add-story-${stepId}-${sliceKey}`).click();
	const open = dialog(page);
	await open.getByLabel('New story title').fill(title);
	await open.getByRole('button', { name: 'Add story' }).click();
	// Cleared and refocused is what "the add succeeded" looks like here; a
	// failure would leave the typed title in place and show an error.
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

/** The first non-unsliced row's slice id, as the board actually rendered it. */
export async function firstSliceId(page: Page): Promise<string> {
	const testid = await page
		.locator('[data-testid^="row-label-"]:not([data-testid="row-label-unsliced"])')
		.first()
		.getAttribute('data-testid');
	return testid!.replace('row-label-', '');
}

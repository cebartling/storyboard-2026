import type { Page } from '@playwright/test';
import { expect, test } from '../../../e2e/auth-fixture';
import {
	addActivity,
	addSlice,
	addStep,
	addStory,
	createMap,
	dialog,
	firstSliceId,
	firstStepId
} from './board-helpers';

/**
 * A slice's release view (ADR 0023): its stories in dependency order, with a
 * blocker planned after the release called out.
 */

/** Records "`blocked` is blocked by `blocker`" from `blocked`'s detail dialog. */
async function blockedBy(page: Page, blocked: string, blocker: string) {
	await page.getByRole('button', { name: `View story ${blocked}` }).click();
	const detail = dialog(page);
	await detail.getByRole('button', { name: 'Add dependency' }).click();
	await detail.getByLabel('This story is blocked by').check();
	await detail.getByLabel('Find a story').fill(blocker);
	await detail.getByRole('radio', { name: new RegExp(blocker) }).check();
	await detail.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(detail.getByTestId('blocked-by-list')).toContainText(blocker);
	await detail.getByRole('button', { name: 'Close' }).click();
	await expect(detail).toBeHidden();
}

test('lists a slice in dependency order and flags a blocker planned later', async ({ page }) => {
	const mapName = `E2E release view ${Date.now()}`;
	await createMap(page, mapName);
	await addActivity(page, 'Shop');
	await addStep(page, 'Checkout');
	await addSlice(page, 'Release 1');
	const stepId = await firstStepId(page);
	const sliceId = await firstSliceId(page);
	// Reading order alone would list Browse first.
	await addStory(page, stepId, sliceId, 'Browse catalogue');
	await addStory(page, stepId, sliceId, 'Pay by card');
	await addStory(page, stepId, 'unsliced', 'Save card');
	await blockedBy(page, 'Browse catalogue', 'Pay by card');
	await blockedBy(page, 'Pay by card', 'Save card');

	await page.getByTestId(`release-view-link-${sliceId}`).click();

	await expect(page).toHaveURL(new RegExp(`/slices/${sliceId}$`));
	await expect(page.getByRole('heading', { name: 'Release 1' })).toBeVisible();
	await expect(page.getByTestId('release-story-title')).toHaveText([
		'Pay by card',
		'Browse catalogue'
	]);
	await expect(page.getByTestId('contradicting-blocker')).toHaveCount(1);
	await expect(page.getByTestId('contradicting-blocker')).toContainText(
		'Save card (Unsliced), which is planned after this release'
	);

	await page.getByTestId('back-to-board').click();
	await expect(page.getByRole('heading', { name: mapName })).toBeVisible();
});

test('answers 404 for a slice the map does not have', async ({ page }) => {
	await createMap(page, `E2E release view 404 ${Date.now()}`);

	const response = await page.goto(`${page.url()}/slices/no-such-slice`);

	expect(response?.status()).toBe(404);
});

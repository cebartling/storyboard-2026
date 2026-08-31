import { expect, test } from '@playwright/test';

// End-to-end slice for step 6 (map CRUD): create a map from `/`, land on
// its board, reload, and confirm it persisted. Runs against its own
// e2e.db (see playwright.config.ts) so it never touches dev data.

test('creates a map from the list page and it persists across reload', async ({ page }) => {
	await page.goto('/');

	const mapName = `E2E map ${Date.now()}`;
	await page.getByLabel('New map name').fill(mapName);
	await page.getByRole('button', { name: 'Create map' }).click();

	// The create action redirects to the new map's board.
	await expect(page).toHaveURL(/\/maps\/[^/]+$/);
	await expect(page.getByRole('heading', { name: mapName })).toBeVisible();

	await page.reload();
	await expect(page.getByRole('heading', { name: mapName })).toBeVisible();

	// And it shows up back on the list page.
	await page.goto('/');
	await expect(page.getByRole('link', { name: mapName })).toBeVisible();
});

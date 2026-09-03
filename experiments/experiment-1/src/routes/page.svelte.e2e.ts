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

// D7: the repository could delete a map but nothing reachable ever asked it
// to, so the list was add-only and `save()`'s "map no longer exists" branch
// was unreachable in the running app.
test('deletes a map from the list, behind a confirmation', async ({ page }) => {
	await page.goto('/');

	const mapName = `E2E delete map ${Date.now()}`;
	await page.getByLabel('New map name').fill(mapName);
	await page.getByRole('button', { name: 'Create map' }).click();
	await expect(page).toHaveURL(/\/maps\/[^/]+$/);

	await page.goto('/');
	const row = page.locator('li', { hasText: mapName });
	await row.getByRole('button', { name: `Delete ${mapName}` }).click();

	// Destructive and irreversible, so it asks first — and naming the map in
	// the dialog is what makes the answer meaningful.
	const confirm = page.getByRole('dialog');
	await expect(confirm).toContainText(mapName);

	// Dismissing must not delete.
	await confirm.getByRole('button', { name: 'Cancel' }).click();
	await expect(confirm).toBeHidden();
	await expect(page.getByRole('link', { name: mapName })).toBeVisible();

	await row.getByRole('button', { name: `Delete ${mapName}` }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Delete map' }).click();

	await expect(page.getByRole('link', { name: mapName })).toHaveCount(0);
	await page.reload();
	await expect(page.getByRole('link', { name: mapName })).toHaveCount(0);
});

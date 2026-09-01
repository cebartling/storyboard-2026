import { expect, test } from '@playwright/test';

// E2e coverage for ADR 0010's camera persistence (commit 7 of the plan):
// zoom and scroll position must survive a full page reload, keyed per map in
// `localStorage`. The board needs real overflow in both axes for this to be
// a meaningful test — a board that already fits the viewport would "persist"
// scroll 0/0 either way — so this builds enough activities/steps/slices to
// guarantee it, and zooms in (rather than out) so the enlarged world size
// makes the overflow only more certain.
test('pan and zoom persist across reload', async ({ page }) => {
	await page.goto('/');
	const mapName = `E2E camera board ${Date.now()}`;
	await page.getByLabel('New map name').fill(mapName);
	await page.getByRole('button', { name: 'Create map' }).click();
	await expect(page).toHaveURL(/\/maps\/[^/]+$/);

	for (const name of ['Search', 'Browse', 'Compare', 'Decide', 'Check out', 'Confirm']) {
		await page.getByLabel('New activity').fill(name);
		await page.getByRole('button', { name: 'Add activity' }).click();
	}
	await expect(page.getByRole('heading', { name: mapName })).toBeVisible();

	const activityHeaders = page.locator('[data-testid^="activity-"]');
	const activityCount = await activityHeaders.count();
	for (let i = 0; i < activityCount; i++) {
		const header = activityHeaders.nth(i);
		await header.getByLabel('New step name').fill(`Step ${i}`);
		await header.getByRole('button', { name: 'Add step' }).click();
	}

	for (const name of ['Release 1', 'Release 2', 'Release 3', 'Release 4', 'Release 5']) {
		await page.getByLabel('New slice').fill(name);
		await page.getByRole('button', { name: 'Add slice' }).click();
	}
	await expect(page.getByRole('button', { name: 'Delete slice' })).toHaveCount(5);

	// --- Zoom in one step, then pan away from the origin ---------------------
	//
	// With this much content, the board exceeds the viewport, so the initial
	// (no saved state yet) camera lands on whatever `fit()` computes rather
	// than 100% — this only needs the *post-zoom-in* readout to differ from
	// that and to survive the reload, not a specific starting percentage.
	const readout = page.getByTestId('zoom-readout');
	const zoomBeforeReload = await readout.textContent();
	await page.getByTestId('zoom-in').click();
	await expect(readout).not.toHaveText(zoomBeforeReload ?? '');
	const zoomedInReadout = await readout.textContent();

	const viewport = page.getByTestId('board-viewport');
	await viewport.evaluate((el) => {
		el.scrollLeft = 200;
		el.scrollTop = 150;
	});

	// Sanity check: the board must actually have overflow for this scroll to
	// mean anything, and the viewport's own scroll<->camera sync must have
	// picked it up (rather than the value bouncing back to 0).
	await expect.poll(() => viewport.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
	await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

	const scrollLeftBeforeReload = await viewport.evaluate((el) => el.scrollLeft);
	const scrollTopBeforeReload = await viewport.evaluate((el) => el.scrollTop);

	// The save is debounced ~250ms; give it time to land before reloading.
	await page.waitForTimeout(500);

	await page.reload();

	await expect(readout).toHaveText(zoomedInReadout ?? '');
	await expect.poll(() => viewport.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
	await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

	// Restored scroll should match what was saved (clampScroll may adjust it
	// slightly if the board's measured size differs by a pixel or two between
	// loads, so this allows a small tolerance rather than exact equality).
	const scrollLeftAfterReload = await viewport.evaluate((el) => el.scrollLeft);
	const scrollTopAfterReload = await viewport.evaluate((el) => el.scrollTop);
	expect(Math.abs(scrollLeftAfterReload - scrollLeftBeforeReload)).toBeLessThan(5);
	expect(Math.abs(scrollTopAfterReload - scrollTopBeforeReload)).toBeLessThan(5);
});

import { expect, test } from '@playwright/test';
import { addActivity, addSlice, addStep, createMap } from './board-helpers';

// E2e coverage for ADR 0010's camera persistence (commit 7 of the plan):
// zoom and scroll position must survive a full page reload, keyed per map in
// `localStorage`. The board needs real overflow in both axes for this to be
// a meaningful test — a board that already fits the viewport would "persist"
// scroll 0/0 either way — so this builds enough activities/steps/slices to
// guarantee it, and zooms in (rather than out) so the enlarged world size
// makes the overflow only more certain.
test('pan and zoom persist across reload', async ({ page }) => {
	await createMap(page, `E2E camera board ${Date.now()}`);

	for (const name of ['Search', 'Browse', 'Compare', 'Decide', 'Check out', 'Confirm']) {
		await addActivity(page, name);
	}

	const activityHeaders = page.locator('[data-testid^="activity-"]');
	const activityCount = await activityHeaders.count();
	for (let i = 0; i < activityCount; i++) {
		// The "Add step" trigger is per activity header, so it has to be
		// scoped — every header renders one.
		await addStep(page, `Step ${i}`, activityHeaders.nth(i));
	}

	for (const name of ['Release 1', 'Release 2', 'Release 3', 'Release 4', 'Release 5']) {
		await addSlice(page, name);
	}
	await expect(page.getByRole('button', { name: 'Edit slice' })).toHaveCount(5);

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

	// No wait for the ~250ms debounce: the page flushes a pending save when it
	// goes away, so a reload this soon after a pan has to persist it. Waiting
	// here would hide a regression in that flush (finding F10).

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

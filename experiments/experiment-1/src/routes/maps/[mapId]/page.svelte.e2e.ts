import { expect, test, type Page } from '@playwright/test';

// End-to-end slice for steps 7-9 (board UI + drag-and-drop): create a map,
// build a small backbone by hand, drag a story to reorder it within a step,
// drag another story onto a release slice band, reload, and confirm BOTH
// the order and the slice membership persisted. This is the plan's headline
// verification scenario.
//
// `svelte-dnd-action` is pointer-event based, not native HTML5 drag-and-drop
// — Playwright's built-in `dragTo` does not trigger it. The working
// choreography (proven in src/routes/spike/page.svelte.e2e.ts) is manual
// mouse events: mouse.down() on the source, several mouse.move(..., {steps})
// waypoints toward the target with small pauses, then mouse.up(). A single
// long move does not work.
async function dragTo(
	page: Page,
	source: {
		boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null>;
	},
	target: { boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null> }
) {
	const sourceBox = await source.boundingBox();
	const targetBox = await target.boundingBox();
	if (!sourceBox || !targetBox) throw new Error('missing bounding box');

	const startX = sourceBox.x + sourceBox.width / 2;
	const startY = sourceBox.y + sourceBox.height / 2;
	const endX = targetBox.x + targetBox.width / 2;
	const endY = targetBox.y + targetBox.height / 2;

	await page.mouse.move(startX, startY);
	await page.mouse.down();
	await page.waitForTimeout(100);

	const waypoints = 6;
	for (let i = 1; i <= waypoints; i++) {
		const x = startX + ((endX - startX) * i) / waypoints;
		const y = startY + ((endY - startY) * i) / waypoints;
		await page.mouse.move(x, y, { steps: 5 });
		await page.waitForTimeout(30);
	}
	await page.waitForTimeout(100);
	await page.mouse.up();
	// The move POST + invalidateAll() round-trip is async relative to
	// mouseup; give it a moment to land before the caller asserts.
	await page.waitForTimeout(300);
}

test('drag story to slice', async ({ page }) => {
	// --- Build a minimal backbone by hand, via real form POSTs -------------
	await page.goto('/');
	const mapName = `E2E board ${Date.now()}`;
	await page.getByLabel('New map name').fill(mapName);
	await page.getByRole('button', { name: 'Create map' }).click();
	await expect(page).toHaveURL(/\/maps\/[^/]+$/);

	await page.getByLabel('New activity').fill('Search');
	await page.getByRole('button', { name: 'Add activity' }).click();
	await expect(page.getByRole('heading', { name: mapName })).toBeVisible();

	await page.getByLabel('New step name').fill('Find a product');
	await page.getByRole('button', { name: 'Add step' }).click();
	await expect(page.getByLabel('New story title')).toBeVisible();

	await page.getByLabel('New slice').fill('Release 1');
	await page.getByRole('button', { name: 'Add slice' }).click();
	await expect(page.getByRole('button', { name: 'Delete slice' })).toBeVisible();

	// Two stories in the unsliced band, in this order: Story A, Story B.
	await page.getByLabel('New story title').fill('Story A');
	await page.getByRole('button', { name: 'Add story' }).click();
	await expect(page.getByTestId(/^story-/).first()).toBeVisible();

	await page.getByLabel('New story title').fill('Story B');
	await page.getByRole('button', { name: 'Add story' }).click();
	await expect(page.getByText('Story B')).toBeVisible();

	// --- Resolve the real ids the board rendered ----------------------------
	const stepId = (await page
		.locator('[data-testid^="step-"]')
		.first()
		.getAttribute('data-testid'))!.replace('step-', '');
	const sliceId = (await page
		.locator('[data-testid^="row-label-"]:not([data-testid="row-label-unsliced"])')
		.first()
		.getAttribute('data-testid'))!.replace('row-label-', '');

	const unslicedCell = page.getByTestId(`cell-${stepId}-unsliced`);
	const sliceCell = page.getByTestId(`cell-${stepId}-${sliceId}`);

	const storyACard = unslicedCell.locator('[data-testid^="story-"]', { hasText: 'Story A' });
	const storyBCard = unslicedCell.locator('[data-testid^="story-"]', { hasText: 'Story B' });

	await expect(storyACard).toBeVisible();
	await expect(storyBCard).toBeVisible();
	await expect(sliceCell.locator('[data-testid^="story-"]')).toHaveCount(0);

	// Sanity: Story A is first, Story B second, before any drag.
	await expect(unslicedCell.locator('[data-testid^="story-"]')).toHaveText([/Story A/, /Story B/]);

	// --- Drag 1: reorder Story A past Story B within the same step/band -----
	await dragTo(page, storyACard, storyBCard);
	await expect(unslicedCell.locator('[data-testid^="story-"]')).toHaveText([/Story B/, /Story A/]);

	// --- Drag 2: drag Story A onto the Release 1 slice band -----------------
	await dragTo(
		page,
		unslicedCell.locator('[data-testid^="story-"]', { hasText: 'Story A' }),
		sliceCell
	);
	await expect(sliceCell.locator('[data-testid^="story-"]')).toHaveText([/Story A/]);
	await expect(unslicedCell.locator('[data-testid^="story-"]')).toHaveText([/Story B/]);

	// --- Reload: both the order and the slice reassignment must persist -----
	await page.reload();

	await expect(sliceCell.locator('[data-testid^="story-"]')).toHaveText([/Story A/]);
	await expect(unslicedCell.locator('[data-testid^="story-"]')).toHaveText([/Story B/]);
});

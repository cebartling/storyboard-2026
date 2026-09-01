import { expect, test, type Page } from '@playwright/test';
import {
	addActivity,
	addSlice,
	addStep,
	addStory,
	createMap,
	firstSliceId,
	firstStepId
} from './board-helpers';

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
		scrollIntoViewIfNeeded(): Promise<void>;
	},
	target: {
		boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null>;
		scrollIntoViewIfNeeded(): Promise<void>;
	}
) {
	// The board now lives inside `BoardViewport`, a bounded-height scroll
	// container (ADR 0010), so a target is not guaranteed to already be
	// in view the way it was in the old `overflow-x-auto` panel.
	await source.scrollIntoViewIfNeeded();
	await target.scrollIntoViewIfNeeded();

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
	// --- Build a minimal backbone by hand, through the board's dialogs -----
	await createMap(page, `E2E board ${Date.now()}`);
	await addActivity(page, 'Search');
	await addStep(page, 'Find a product');
	await addSlice(page, 'Release 1');
	await expect(page.getByRole('button', { name: 'Edit slice' })).toBeVisible();

	// --- Resolve the real ids the board rendered ----------------------------
	// The add-story trigger is per cell, so the ids have to be known before
	// any story can be added.
	const stepId = await firstStepId(page);
	const sliceId = await firstSliceId(page);

	// Two stories in the unsliced band, in this order: Story A, Story B.
	await addStory(page, stepId, 'unsliced', 'Story A');
	await addStory(page, stepId, 'unsliced', 'Story B');
	await expect(page.getByText('Story B')).toBeVisible();

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

	// The restored camera (ADR 0010) leaves the board scrolled where it was,
	// which can put the slice band underneath the sticky activity/step
	// headers. A pointerdown there lands on the header, not the card, and
	// `dragTo`'s `scrollIntoViewIfNeeded` cannot help: it scrolls the card to
	// the nearest edge, which is exactly where the sticky headers sit.
	// Fitting the board to the window removes the overflow altogether, so the
	// drag below starts on the card.
	await page.getByTestId('zoom-fit').click();

	// A failed direct drag action must explain the failure instead of silently
	// snapping back. Delete Story A behind the rendered page so its next move
	// exercises the server's stale-client validation path.
	const storyAId = (await sliceCell
		.locator('[data-testid^="story-"]')
		.getAttribute('data-testid'))!.replace('story-', '');
	await page.evaluate(async (storyId) => {
		const body = new FormData();
		body.set('storyId', storyId);
		await fetch('?/deleteStory', { method: 'POST', body });
	}, storyAId);
	await dragTo(page, sliceCell.locator('[data-testid^="story-"]'), unslicedCell);
	await expect(page.locator('p.error[role="alert"]')).toContainText(`Story not found: ${storyAId}`);
});

// The two things the dialogs made possible that the inline forms could not do
// (ADR 0011): adding a story straight into a release slice, and editing a
// story's description at all.
test('adds a story into a slice band and edits its description', async ({ page }) => {
	await createMap(page, `E2E story editor ${Date.now()}`);
	await addActivity(page, 'Search');
	await addStep(page, 'Find a product');
	// Three slices, and the story goes in the first: that band sits in the
	// upper half of the board, clear of the minimap and zoom-control overlays
	// pinned to the bottom of the panel.
	await addSlice(page, 'Release 1');
	await addSlice(page, 'Release 2');
	await addSlice(page, 'Release 3');

	const stepId = await firstStepId(page);
	const sliceId = await firstSliceId(page);

	await addStory(page, stepId, sliceId, 'Search by keyword');

	// Straight into the slice band — never via the unsliced row.
	await expect(
		page.getByTestId(`cell-${stepId}-${sliceId}`).getByText('Search by keyword')
	).toBeVisible();
	await expect(
		page.getByTestId(`cell-${stepId}-unsliced`).locator('[data-testid^="story-"]')
	).toHaveCount(0);

	// --- Give it a description, which no UI could reach before -------------
	await page.getByRole('button', { name: 'Edit story Search by keyword' }).click();
	const editor = page.getByRole('dialog');
	await editor.getByLabel('Story title').fill('Search by keyword or SKU');
	await editor.getByLabel('Description').fill('Matches product name and SKU.');
	await editor.getByRole('button', { name: 'Save' }).click();
	await expect(editor).toBeHidden();

	await expect(page.getByText('Search by keyword or SKU')).toBeVisible();

	// --- It has to survive a reload, not just the in-page refetch ----------
	await page.reload();
	await page.getByRole('button', { name: 'Edit story Search by keyword or SKU' }).click();
	await expect(page.getByRole('dialog').getByLabel('Description')).toHaveValue(
		'Matches product name and SKU.'
	);
});

// Empirical check for the zoom/dnd interaction ADR 0010 discusses: drop
// hit-testing and the drag mirror are both viewport-space, so a drag should
// behave the same at any CSS `zoom` level as it does at 100%. This zooms out
// one step via the zoom-controls button, then runs the same choreography as
// "drag story to slice" and asserts the drop actually lands.
test('drag story to slice at non-100% zoom', async ({ page }) => {
	await createMap(page, `E2E zoom board ${Date.now()}`);
	await addActivity(page, 'Search');
	await addStep(page, 'Find a product');
	await addSlice(page, 'Release 1');

	const stepIdForZoom = await firstStepId(page);
	await addStory(page, stepIdForZoom, 'unsliced', 'Story A');
	await expect(page.getByTestId(/^story-/).first()).toBeVisible();

	// --- Zoom out one step before dragging -----------------------------------
	//
	// The initial zoom is whatever `fit()` computed for this board's actual
	// content (ADR 0010's persistence commit: no saved camera state yet ->
	// fit to content), not necessarily 100% — so this resets to a known 100%
	// baseline first rather than asserting on the auto-fit value.
	await page.getByTestId('zoom-reset').click();
	await expect(page.getByTestId('zoom-readout')).toHaveText('100%');
	await page.getByTestId('zoom-out').click();
	await expect(page.getByTestId('zoom-readout')).toHaveText('75%');

	const stepId = stepIdForZoom;
	const sliceId = await firstSliceId(page);

	const unslicedCell = page.getByTestId(`cell-${stepId}-unsliced`);
	const sliceCell = page.getByTestId(`cell-${stepId}-${sliceId}`);
	const storyACard = unslicedCell.locator('[data-testid^="story-"]', { hasText: 'Story A' });

	await expect(storyACard).toBeVisible();
	await expect(sliceCell.locator('[data-testid^="story-"]')).toHaveCount(0);

	await dragTo(page, storyACard, sliceCell);

	await expect(sliceCell.locator('[data-testid^="story-"]')).toHaveText([/Story A/]);
	await expect(unslicedCell.locator('[data-testid^="story-"]')).toHaveCount(0);
});

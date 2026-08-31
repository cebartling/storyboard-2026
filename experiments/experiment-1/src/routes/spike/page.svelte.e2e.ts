import { expect, test } from '@playwright/test';

// THROWAWAY SPIKE spec — proves svelte-dnd-action is drivable by Playwright.
// svelte-dnd-action is pointer-event based, not native HTML5 drag-and-drop, so
// Playwright's built-in `dragTo` does not trigger it. The working approach is
// manual mouse choreography: mouse.down() on the source -> several
// mouse.move(..., { steps }) toward the target (intermediate steps matter —
// the library needs pointermove events to register the drag) -> mouse.up().

async function dragCardTo(
	page: import('@playwright/test').Page,
	sourceTestId: string,
	targetTestId: string
) {
	const source = page.getByTestId(sourceTestId);
	const target = page.getByTestId(targetTestId);

	const sourceBox = await source.boundingBox();
	const targetBox = await target.boundingBox();
	if (!sourceBox || !targetBox) throw new Error('missing bounding box');

	const startX = sourceBox.x + sourceBox.width / 2;
	const startY = sourceBox.y + sourceBox.height / 2;
	const endX = targetBox.x + targetBox.width / 2;
	const endY = targetBox.y + targetBox.height / 2;

	await page.mouse.move(startX, startY);
	await page.mouse.down();
	// A short pause after mousedown lets svelte-dnd-action register drag start
	// before the pointer moves away from the source element.
	await page.waitForTimeout(100);
	// Several intermediate moves with steps are required: svelte-dnd-action
	// listens for pointermove and needs to see the pointer travel across
	// waypoints, not just teleport from start to end.
	const waypoints = 6;
	for (let i = 1; i <= waypoints; i++) {
		const x = startX + ((endX - startX) * i) / waypoints;
		const y = startY + ((endY - startY) * i) / waypoints;
		await page.mouse.move(x, y, { steps: 5 });
		await page.waitForTimeout(30);
	}
	await page.waitForTimeout(100);
	await page.mouse.up();
}

test('reorders cards within a column', async ({ page }) => {
	await page.goto('/spike');

	const columnA = page.getByTestId('column-a');
	await expect(columnA.getByTestId('card-a1')).toBeVisible();

	// Drag card a1 down past a3 (last card in column A).
	await dragCardTo(page, 'card-a1', 'card-a3');

	const orderAfter = await columnA.locator('[data-testid^="card-"]').allTextContents();
	expect(orderAfter[0]).not.toBe('Card A1');
	expect(orderAfter).toContain('Card A1');
});

test('moves a card between columns', async ({ page }) => {
	await page.goto('/spike');

	const columnB = page.getByTestId('column-b');

	// Drag card a2 (column A) onto card b1 (column B).
	await dragCardTo(page, 'card-a2', 'card-b1');

	await expect(columnB.getByTestId('card-a2')).toBeVisible();
	await expect(page.getByTestId('column-a').getByTestId('card-a2')).toHaveCount(0);
});

import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import BoardMinimap from './board-minimap.svelte';
import { createCamera } from '$lib/canvas/camera.svelte';
import type { MinimapModel } from '$lib/canvas/minimap-model';

const model: MinimapModel = {
	columns: 2,
	rows: [
		{ sliceId: 'slice-1', name: 'Release 1' },
		{ sliceId: null, name: 'Unsliced' }
	],
	cells: [
		{ col: 0, row: 0, storyCount: 2 },
		{ col: 1, row: 0, storyCount: 0 },
		{ col: 0, row: 1, storyCount: 1 },
		{ col: 1, row: 1, storyCount: 0 }
	]
};

function cameraWithGeometry() {
	const camera = createCamera();
	camera.setWorldSize(2000, 1000);
	camera.setViewportSize(400, 200);
	return camera;
}

describe('BoardMinimap', () => {
	it('renders one row rect per model row and shades cells by story count', async () => {
		const camera = cameraWithGeometry();
		render(BoardMinimap, { camera, model });

		const rows = page.getByTestId('minimap-row').elements();
		expect(rows).toHaveLength(model.rows.length);

		const cells = page.getByTestId('minimap-cell').elements() as unknown as SVGRectElement[];
		expect(cells).toHaveLength(model.cells.length);
		const withStories = cells.filter((c) => c.getAttribute('data-story-count') !== '0');
		expect(withStories).toHaveLength(2);
	});

	it('keeps the focusable handle in the accessibility tree', async () => {
		const camera = cameraWithGeometry();
		render(BoardMinimap, { camera, model });

		// `role="img"` on the svg would make every child presentational, taking the
		// handle out of the accessibility tree despite its tabindex.
		const svg = page.getByTestId('board-minimap').element() as SVGSVGElement;
		expect(svg.getAttribute('role')).toBe('group');

		const handle = page.getByTestId('minimap-viewport').element() as SVGRectElement;
		expect(handle.getAttribute('tabindex')).toBe('0');
		// Not `button`: the handle has no Enter/Space activation to offer.
		expect(handle.getAttribute('role')).toBe('application');
		expect(handle.getAttribute('aria-label')).toBeTruthy();

		for (const decorative of page.getByTestId('minimap-cell').elements()) {
			expect(decorative.getAttribute('aria-hidden')).toBe('true');
		}
	});

	it('dragging the viewport rect pans the camera', async () => {
		const camera = cameraWithGeometry();
		render(BoardMinimap, { camera, model });

		const handle = page.getByTestId('minimap-viewport').element() as SVGRectElement;
		handle.setPointerCapture = () => {};
		handle.releasePointerCapture = () => {};
		const box = handle.getBoundingClientRect();

		const startScrollX = camera.scrollX;
		const startScrollY = camera.scrollY;

		handle.dispatchEvent(
			new PointerEvent('pointerdown', {
				pointerId: 1,
				clientX: box.x + box.width / 2,
				clientY: box.y + box.height / 2,
				bubbles: true
			})
		);
		handle.dispatchEvent(
			new PointerEvent('pointermove', {
				pointerId: 1,
				clientX: box.x + box.width / 2 + 40,
				clientY: box.y + box.height / 2,
				bubbles: true
			})
		);

		expect(camera.scrollX).toBeGreaterThan(startScrollX);
		expect(camera.scrollY).toBe(startScrollY);
	});

	it('clicking the minimap background elsewhere centres the viewport there', async () => {
		const camera = cameraWithGeometry();
		render(BoardMinimap, { camera, model });

		const svg = page.getByTestId('board-minimap').element() as SVGSVGElement;
		const box = svg.getBoundingClientRect();

		svg.dispatchEvent(
			new PointerEvent('pointerdown', {
				pointerId: 2,
				clientX: box.x + box.width - 2,
				clientY: box.y + box.height - 2,
				bubbles: true
			})
		);

		// Clicking near the bottom-right corner of the minimap should pan
		// toward the end of the (larger-than-viewport) world in both axes.
		expect(camera.scrollX).toBeGreaterThan(0);
		expect(camera.scrollY).toBeGreaterThan(0);
	});
});

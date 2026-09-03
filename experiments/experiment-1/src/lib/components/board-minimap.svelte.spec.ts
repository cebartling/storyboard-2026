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

	it('paints a density ramp so busier cells read darker', async () => {
		const camera = cameraWithGeometry();
		// Counts straddle both bucket boundaries (1 | 2-3 | 4+), so a ramp that
		// stepped at the wrong count would fail rather than slip through.
		const dense: MinimapModel = {
			columns: 6,
			rows: [{ sliceId: 'slice-1', name: 'Release 1' }],
			cells: [
				{ col: 0, row: 0, storyCount: 0 },
				{ col: 1, row: 0, storyCount: 1 },
				{ col: 2, row: 0, storyCount: 2 },
				{ col: 3, row: 0, storyCount: 3 },
				{ col: 4, row: 0, storyCount: 4 },
				{ col: 5, row: 0, storyCount: 5 }
			]
		};
		render(BoardMinimap, { camera, model: dense });

		const cells = page.getByTestId('minimap-cell').elements() as unknown as SVGRectElement[];
		const byCount = new Map(cells.map((c) => [c.getAttribute('data-story-count'), c]));

		// An empty cell is ground, not a faint tint of the content colour.
		expect(byCount.get('0')?.getAttribute('fill')).toBe('var(--color-surface)');

		const opacityOf = (count: string) =>
			Number(byCount.get(count)?.getAttribute('fill-opacity') ?? '0');
		expect(byCount.get('1')?.getAttribute('fill')).toBe('var(--color-brand)');
		expect(opacityOf('1')).toBeGreaterThan(0);
		expect(opacityOf('2')).toBeGreaterThan(opacityOf('1'));
		expect(opacityOf('4')).toBeGreaterThan(opacityOf('2'));
		// Within a bucket the shade holds steady; the steps are 2 and 4.
		expect(opacityOf('3')).toBe(opacityOf('2'));
		expect(opacityOf('5')).toBe(opacityOf('4'));
	});

	it('holds the overlay back until the camera has been measured', async () => {
		// A camera starts every dimension at 0, and the minimap renders before
		// BoardViewport's measuring effect runs (and during SSR). The viewport
		// rect is empty then, so the scrim's hole would have no area and would
		// paint the whole minimap as a dark slab.
		render(BoardMinimap, { camera: createCamera(), model });

		expect(page.getByTestId('minimap-scrim').elements()).toHaveLength(0);
		expect(page.getByTestId('minimap-viewport').elements()).toHaveLength(0);
		// The grid itself still draws, so the minimap reads as an overview.
		expect(page.getByTestId('minimap-cell').elements()).toHaveLength(model.cells.length);
	});

	it('dims the board outside the viewport without swallowing pointer events', async () => {
		const camera = cameraWithGeometry();
		// Pan off the origin first: at scroll 0 the viewport rect sits at (0, 0),
		// so a hole hard-coded to the origin would pass the geometry check below.
		camera.panTo(600, 300);
		render(BoardMinimap, { camera, model });

		const scrim = page.getByTestId('minimap-scrim').element() as SVGPathElement;
		expect(scrim.getAttribute('aria-hidden')).toBe('true');
		// The scrim covers the whole minimap, so it must not intercept the
		// press-and-drag that `onBackgroundPointerDown` implements.
		expect(getComputedStyle(scrim).pointerEvents).toBe('none');
		// The hole is the viewport rect itself, punched out with evenodd.
		expect(scrim.getAttribute('fill-rule')).toBe('evenodd');

		// Hit-test the painted path rather than comparing the `d` string against
		// the same numbers that built it, which would assert nothing: the hole has
		// to fall where the viewport actually is.
		const handle = page.getByTestId('minimap-viewport').element() as SVGRectElement;
		const x = Number(handle.getAttribute('x'));
		const y = Number(handle.getAttribute('y'));
		const width = Number(handle.getAttribute('width'));
		const height = Number(handle.getAttribute('height'));
		const svg = page.getByTestId('board-minimap').element() as SVGSVGElement;
		const at = (px: number, py: number) => {
			const point = svg.createSVGPoint();
			point.x = px;
			point.y = py;
			return scrim.isPointInFill(point);
		};

		expect(at(x + width / 2, y + height / 2)).toBe(false);
		expect(at(x + width + 5, y + height / 2)).toBe(true);
	});

	it('frames the viewport in a saturated border with a contrasting halo', async () => {
		const camera = cameraWithGeometry();
		render(BoardMinimap, { camera, model });

		const handle = page.getByTestId('minimap-viewport').element() as SVGRectElement;
		expect(handle.getAttribute('stroke')).toBe('var(--color-brand)');
		expect(handle.getAttribute('fill')).toBe('none');
		// `fill="none"` leaves an unpainted interior, so only `pointer-events`
		// keeps the handle draggable across its whole area rather than along its
		// stroke alone. The drag tests below dispatch straight at the element and
		// so bypass hit-testing entirely; this is what guards it.
		expect(handle.getAttribute('pointer-events')).toBe('all');

		// A wider light stroke behind the brand one keeps the frame legible over
		// both the pale empty cells and the darkest populated ones.
		const halo = page.getByTestId('minimap-viewport-halo').element() as SVGRectElement;
		expect(halo.getAttribute('aria-hidden')).toBe('true');
		expect(getComputedStyle(halo).pointerEvents).toBe('none');
		expect(Number(halo.getAttribute('stroke-width'))).toBeGreaterThan(
			Number(handle.getAttribute('stroke-width'))
		);
		expect(halo.getAttribute('x')).toBe(handle.getAttribute('x'));
		expect(halo.getAttribute('width')).toBe(handle.getAttribute('width'));
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

	it('survives a cancelled pointer and ignores a second concurrent one', async () => {
		const camera = cameraWithGeometry();
		render(BoardMinimap, { camera, model });

		const handle = page.getByTestId('minimap-viewport').element() as SVGRectElement;
		handle.setPointerCapture = () => {};
		// A real pointercancel has already released the capture by this point.
		handle.hasPointerCapture = () => false;
		handle.releasePointerCapture = () => {
			throw new DOMException('no capture', 'NotFoundError');
		};
		const box = handle.getBoundingClientRect();
		const centre = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };

		handle.dispatchEvent(
			new PointerEvent('pointerdown', { pointerId: 1, ...centre, bubbles: true })
		);

		// A second finger must not steer a drag owned by pointer 1.
		const before = camera.scrollX;
		handle.dispatchEvent(
			new PointerEvent('pointermove', {
				pointerId: 2,
				clientX: centre.clientX + 40,
				clientY: centre.clientY,
				bubbles: true
			})
		);
		expect(camera.scrollX).toBe(before);

		expect(() =>
			handle.dispatchEvent(
				new PointerEvent('pointercancel', { pointerId: 1, ...centre, bubbles: true })
			)
		).not.toThrow();
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

	it('continues tracking when a press on the background becomes a drag', async () => {
		const camera = cameraWithGeometry();
		render(BoardMinimap, { camera, model });

		const svg = page.getByTestId('board-minimap').element() as SVGSVGElement;
		svg.setPointerCapture = () => {};
		svg.releasePointerCapture = () => {};
		const box = svg.getBoundingClientRect();

		// Press near the left edge, then drag right: the jump alone would leave
		// scroll wherever the press landed, so the move has to move it further.
		svg.dispatchEvent(
			new PointerEvent('pointerdown', {
				pointerId: 4,
				clientX: box.x + 20,
				clientY: box.y + box.height / 2,
				bubbles: true
			})
		);
		const afterJump = camera.scrollX;

		svg.dispatchEvent(
			new PointerEvent('pointermove', {
				pointerId: 4,
				clientX: box.x + box.width - 20,
				clientY: box.y + box.height / 2,
				bubbles: true
			})
		);

		expect(camera.scrollX).toBeGreaterThan(afterJump);
	});

	it('clicking the minimap background elsewhere centres the viewport there', async () => {
		const camera = cameraWithGeometry();
		render(BoardMinimap, { camera, model });

		const svg = page.getByTestId('board-minimap').element() as SVGSVGElement;
		svg.setPointerCapture = () => {};
		svg.releasePointerCapture = () => {};
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

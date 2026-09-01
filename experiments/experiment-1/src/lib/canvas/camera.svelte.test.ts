import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM } from './camera-math';
import { createCamera } from './camera.svelte';

// `createCamera` owns the clamping and the ordering that ties camera-math,
// camera-storage and minimap-model together; the pure modules are covered by
// their own tests, so what matters here is the wiring and the boundaries.
// Runs in the client Vitest project (see the `*.svelte.test.ts` include),
// which is where runes are compiled.

/** A world comfortably larger than the viewport in both axes. */
function overflowingCamera() {
	const camera = createCamera();
	camera.setWorldSize(4000, 3000);
	camera.setViewportSize(800, 600);
	return camera;
}

describe('createCamera zoom boundaries', () => {
	it('does not step past the maximum zoom', () => {
		const camera = overflowingCamera();
		for (let i = 0; i < 12; i++) camera.zoomIn();

		expect(camera.zoom).toBe(MAX_ZOOM);
	});

	it('does not step past the minimum zoom', () => {
		const camera = overflowingCamera();
		for (let i = 0; i < 12; i++) camera.zoomOut();

		expect(camera.zoom).toBe(MIN_ZOOM);
	});

	it('clamps a persisted zoom that is out of range', () => {
		const camera = overflowingCamera();

		camera.restoreZoom(99);
		expect(camera.zoom).toBe(MAX_ZOOM);

		camera.restoreZoom(0.001);
		expect(camera.zoom).toBe(MIN_ZOOM);
	});
});

describe('createCamera fit', () => {
	it('zooms out to bring an overflowing world into view', () => {
		const camera = overflowingCamera();

		camera.fit();

		expect(camera.zoom).toBeLessThan(1);
	});

	it('zooms back in when the world is smaller than the viewport', () => {
		// The regression behind the `fit()` bug: the width of a board that fits is
		// stretch-sized and cannot constrain the fit, so height has to drive it.
		const camera = createCamera();
		camera.setViewportSize(1000, 1000);
		camera.setWorldSize(2000, 500);
		camera.restoreZoom(0.5);

		camera.fit();

		expect(camera.zoom).toBeGreaterThan(0.5);
	});
});

describe('createCamera scroll clamping', () => {
	it('pulls the scroll back in bounds when the world shrinks under it', () => {
		const camera = overflowingCamera();
		camera.panTo(3000, 2000);
		expect(camera.scrollX).toBeGreaterThan(0);

		// A world no larger than the viewport leaves nowhere to scroll.
		camera.setWorldSize(400, 300);

		expect(camera.scrollX).toBe(0);
		expect(camera.scrollY).toBe(0);
	});

	it('never scrolls past the end of the world', () => {
		const camera = overflowingCamera();

		camera.panBy(99_999, 99_999);

		// Scroll is in scaled pixels: world 4000x3000 at zoom 1, viewport 800x600.
		expect(camera.scrollX).toBe(3200);
		expect(camera.scrollY).toBe(2400);
	});

	it('takes an observed scroll verbatim, since the browser already clamped it', () => {
		const camera = overflowingCamera();

		camera.setObservedScroll(123, 456);

		expect(camera.scrollX).toBe(123);
		expect(camera.scrollY).toBe(456);
	});
});

describe('createCamera smooth-scroll hint', () => {
	it('is raised by fit() and consumed exactly once', () => {
		const camera = overflowingCamera();

		camera.fit();

		expect(camera.consumeSmoothScrollHint()).toBe(true);
		expect(camera.consumeSmoothScrollHint()).toBe(false);
	});

	it('is raised by resetZoom()', () => {
		const camera = overflowingCamera();
		camera.zoomIn();
		camera.consumeSmoothScrollHint();

		camera.resetZoom();

		expect(camera.consumeSmoothScrollHint()).toBe(true);
	});

	it('is not raised by the gestures that already track a pointer or key', () => {
		const camera = overflowingCamera();

		camera.zoomAt(100, 100, 1);
		expect(camera.consumeSmoothScrollHint()).toBe(false);

		camera.panBy(50, 50);
		expect(camera.consumeSmoothScrollHint()).toBe(false);

		camera.zoomIn();
		expect(camera.consumeSmoothScrollHint()).toBe(false);
	});
});

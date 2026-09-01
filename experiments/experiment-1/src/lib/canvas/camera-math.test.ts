import { describe, expect, it } from 'vitest';
import {
	MAX_ZOOM,
	MIN_ZOOM,
	clampScroll,
	clampZoom,
	fitZoom,
	nextZoomStep,
	scrollForMinimapPoint,
	scrollForZoomAt,
	viewportRectInMinimap
} from './camera-math';

describe('clampZoom', () => {
	it('leaves an in-range zoom untouched', () => {
		expect(clampZoom(1)).toBe(1);
	});

	it('clamps below the minimum', () => {
		expect(clampZoom(0.01)).toBe(MIN_ZOOM);
	});

	it('clamps above the maximum', () => {
		expect(clampZoom(10)).toBe(MAX_ZOOM);
	});
});

describe('nextZoomStep', () => {
	it('steps up to the next defined level', () => {
		expect(nextZoomStep(1, 1)).toBe(1.25);
	});

	it('steps down to the previous defined level', () => {
		expect(nextZoomStep(1, -1)).toBe(0.75);
	});

	it('stays at the maximum when stepping up from the top', () => {
		expect(nextZoomStep(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
	});

	it('stays at the minimum when stepping down from the bottom', () => {
		expect(nextZoomStep(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
	});

	it('steps up from an off-step value to the next step above it', () => {
		expect(nextZoomStep(0.9, 1)).toBe(1);
	});

	it('steps down from an off-step value to the next step below it', () => {
		expect(nextZoomStep(0.9, -1)).toBe(0.75);
	});
});

describe('fitZoom', () => {
	it('fits a wide world by its width', () => {
		expect(fitZoom({ width: 2000, height: 500 }, { width: 1000, height: 1000 })).toBeCloseTo(0.5);
	});

	it('fits a tall world by its height', () => {
		expect(fitZoom({ width: 500, height: 2000 }, { width: 1000, height: 1000 })).toBeCloseTo(0.5);
	});

	it('clamps the fit result into the supported zoom range', () => {
		expect(fitZoom({ width: 100, height: 100 }, { width: 1000, height: 1000 })).toBe(MAX_ZOOM);
	});

	it('returns 100% when a world dimension is zero, guarding divide-by-zero', () => {
		expect(fitZoom({ width: 0, height: 500 }, { width: 1000, height: 1000 })).toBe(1);
		expect(fitZoom({ width: 500, height: 0 }, { width: 1000, height: 1000 })).toBe(1);
	});
});

describe('scrollForZoomAt', () => {
	it('keeps the world point under the cursor stationary when zooming in', () => {
		const prev = { scrollX: 0, scrollY: 0, zoom: 1 };
		const cursor = { x: 100, y: 50 };
		const worldXBefore = (prev.scrollX + cursor.x) / prev.zoom;
		const worldYBefore = (prev.scrollY + cursor.y) / prev.zoom;

		const next = scrollForZoomAt(prev, cursor, 2);
		const worldXAfter = (next.scrollX + cursor.x) / 2;
		const worldYAfter = (next.scrollY + cursor.y) / 2;

		expect(worldXAfter).toBeCloseTo(worldXBefore);
		expect(worldYAfter).toBeCloseTo(worldYBefore);
	});

	it('keeps the world point under the cursor stationary when zooming out', () => {
		const prev = { scrollX: 400, scrollY: 200, zoom: 2 };
		const cursor = { x: 60, y: 30 };
		const worldXBefore = (prev.scrollX + cursor.x) / prev.zoom;
		const worldYBefore = (prev.scrollY + cursor.y) / prev.zoom;

		const next = scrollForZoomAt(prev, cursor, 1);
		const worldXAfter = (next.scrollX + cursor.x) / 1;
		const worldYAfter = (next.scrollY + cursor.y) / 1;

		expect(worldXAfter).toBeCloseTo(worldXBefore);
		expect(worldYAfter).toBeCloseTo(worldYBefore);
	});

	it('keeps the invariant from a non-zero starting scroll', () => {
		const prev = { scrollX: 733, scrollY: 211, zoom: 0.75 };
		const cursor = { x: 320, y: 180 };
		const worldXBefore = (prev.scrollX + cursor.x) / prev.zoom;
		const worldYBefore = (prev.scrollY + cursor.y) / prev.zoom;

		const next = scrollForZoomAt(prev, cursor, 1.5);
		const worldXAfter = (next.scrollX + cursor.x) / 1.5;
		const worldYAfter = (next.scrollY + cursor.y) / 1.5;

		expect(worldXAfter).toBeCloseTo(worldXBefore);
		expect(worldYAfter).toBeCloseTo(worldYBefore);
	});
});

describe('clampScroll', () => {
	it('clamps to zero when the world is smaller than the viewport', () => {
		const world = { width: 400, height: 300 };
		const viewport = { width: 1000, height: 800 };

		expect(clampScroll({ scrollX: 50, scrollY: 20 }, world, viewport)).toEqual({
			scrollX: 0,
			scrollY: 0
		});
	});

	it('pulls a saved scroll back in bounds when the board has shrunk', () => {
		const world = { width: 1000, height: 800 };
		const viewport = { width: 600, height: 500 };

		expect(clampScroll({ scrollX: 5000, scrollY: 5000 }, world, viewport)).toEqual({
			scrollX: 400,
			scrollY: 300
		});
	});

	it('leaves an in-bounds scroll untouched', () => {
		const world = { width: 1000, height: 800 };
		const viewport = { width: 600, height: 500 };

		expect(clampScroll({ scrollX: 200, scrollY: 100 }, world, viewport)).toEqual({
			scrollX: 200,
			scrollY: 100
		});
	});
});

describe('minimap projection', () => {
	it('round-trips: the centre of the projected rect maps back to the same scroll', () => {
		const world = { width: 4000, height: 3000 };
		const viewport = { width: 800, height: 600 };
		const minimap = { width: 200, height: 150 };
		const scroll = clampScroll({ scrollX: 900, scrollY: 400 }, world, viewport);

		const rect = viewportRectInMinimap(world, viewport, scroll, minimap);
		const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };

		const result = scrollForMinimapPoint(world, viewport, minimap, centre);

		expect(result.scrollX).toBeCloseTo(scroll.scrollX, 5);
		expect(result.scrollY).toBeCloseTo(scroll.scrollY, 5);
	});

	it('keeps the viewport rect within the minimap bounds', () => {
		const world = { width: 4000, height: 3000 };
		const viewport = { width: 800, height: 600 };
		const minimap = { width: 200, height: 150 };

		const rect = viewportRectInMinimap(world, viewport, { scrollX: 3900, scrollY: 2900 }, minimap);

		expect(rect.x + rect.width).toBeLessThanOrEqual(minimap.width + 1e-9);
		expect(rect.y + rect.height).toBeLessThanOrEqual(minimap.height + 1e-9);
		expect(rect.x).toBeGreaterThanOrEqual(0);
		expect(rect.y).toBeGreaterThanOrEqual(0);
	});

	it('clicking a point centers the viewport there, clamped to the world', () => {
		const world = { width: 4000, height: 3000 };
		const viewport = { width: 800, height: 600 };
		const minimap = { width: 200, height: 150 };

		// Bottom-right corner of the minimap: clamped to the maximum scroll.
		const result = scrollForMinimapPoint(world, viewport, minimap, {
			x: minimap.width,
			y: minimap.height
		});

		expect(result).toEqual({ scrollX: 3200, scrollY: 2400 });
	});
});

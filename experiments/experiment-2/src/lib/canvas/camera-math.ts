// ---------------------------------------------------------------------------
// Pure pan/zoom math for the board canvas (ADR 0010).
//
// This module is intentionally plain TypeScript with no DOM lib types and no
// imports from svelte/@sveltejs/kit/mongodb, so it is unit-testable in the
// node Vitest project and stays outside src/lib/domain (it is presentation
// state for one route, not a story-mapping domain invariant — see ADR 0006).
//
// The board is zoomed with the CSS `zoom` property, not `transform: scale()`.
// `zoom` is layout-affecting, so a container's scroll extents
// (scrollWidth/scrollHeight) already reflect the zoomed size — scroll offsets
// below are therefore expressed in *scaled* pixels, matching what the browser
// reports for scrollLeft/scrollTop.
// ---------------------------------------------------------------------------

export interface Size {
	width: number;
	height: number;
}

export interface Scroll {
	scrollX: number;
	scrollY: number;
}

/** Snapped zoom levels; snapping avoids sub-pixel gap hairlines in the grid. */
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

export const MIN_ZOOM = ZOOM_STEPS[0];
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

/** Clamps a zoom value into [MIN_ZOOM, MAX_ZOOM]. */
export function clampZoom(z: number): number {
	return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/**
 * Returns the next zoom step strictly above (`dir` 1) or below (`dir` -1)
 * `z`, clamped at the ends of `ZOOM_STEPS`. Works for an off-step `z` (e.g.
 * 0.9): stepping up finds the first step greater than `z`; stepping down
 * finds the last step less than `z`.
 */
export function nextZoomStep(z: number, dir: 1 | -1): number {
	if (dir === 1) {
		const next = ZOOM_STEPS.find((step) => step > z);
		return next ?? MAX_ZOOM;
	}
	const steps = ZOOM_STEPS.filter((step) => step < z);
	return steps.length > 0 ? steps[steps.length - 1] : MIN_ZOOM;
}

/**
 * Zoom level that fits `world` entirely inside `viewport`, clamped to the
 * supported zoom range. Guards against a zero-sized world (e.g. before the
 * board has laid out) by returning 100%.
 *
 * `zoom` is the zoom the world was measured at, and it is needed because the
 * board's width is elastic: the world element stretches to at least the
 * container's width, and its grid columns (`minmax(240px, 1fr)`) stretch with
 * it. So a world that does not overflow horizontally reports a width of
 * exactly `viewport.width / zoom` — stretch-sized, not content-sized — and its
 * width ratio degenerates to the current zoom, which would pin `fit()` to
 * "never zoom in". Only an overflowing width is a real content measurement, so
 * only then does width constrain the fit. Height is always content-driven
 * (the rows are `auto`), so it always counts.
 */
export function fitZoom(world: Size, viewport: Size, zoom: number): number {
	if (world.width === 0 || world.height === 0) {
		return 1;
	}
	const ratios = [viewport.height / world.height];
	// The 1px slack absorbs sub-pixel rounding in the measured box.
	if (world.width * zoom > viewport.width + 1) {
		ratios.push(viewport.width / world.width);
	}
	return clampZoom(Math.min(...ratios));
}

/**
 * Scroll offset that keeps the world point under `cursor` stationary while
 * zooming from `prev.zoom` to `nextZoom`. `cursor` is viewport-relative
 * pixels (already offset by the container's client rect).
 */
export function scrollForZoomAt(
	prev: Scroll & { zoom: number },
	cursor: { x: number; y: number },
	nextZoom: number
): Scroll {
	const worldX = (prev.scrollX + cursor.x) / prev.zoom;
	const worldY = (prev.scrollY + cursor.y) / prev.zoom;
	return {
		scrollX: worldX * nextZoom - cursor.x,
		scrollY: worldY * nextZoom - cursor.y
	};
}

/**
 * Clamps a scroll offset to [0, max(0, world size - viewport size)] per
 * axis. `world` is the already-scaled (zoomed) world size.
 */
export function clampScroll(s: Scroll, world: Size, viewport: Size): Scroll {
	const maxX = Math.max(0, world.width - viewport.width);
	const maxY = Math.max(0, world.height - viewport.height);
	return {
		scrollX: Math.min(maxX, Math.max(0, s.scrollX)),
		scrollY: Math.min(maxY, Math.max(0, s.scrollY))
	};
}

/**
 * Projects the visible viewport window onto the minimap box, proportional to
 * `world`. The result is clamped so the rectangle never exceeds the minimap
 * bounds or spills outside them.
 */
export function viewportRectInMinimap(
	world: Size,
	viewport: Size,
	s: Scroll,
	minimap: Size
): { x: number; y: number; width: number; height: number } {
	const scaleX = world.width > 0 ? minimap.width / world.width : 0;
	const scaleY = world.height > 0 ? minimap.height / world.height : 0;

	const width = Math.min(minimap.width, viewport.width * scaleX);
	const height = Math.min(minimap.height, viewport.height * scaleY);

	const x = Math.min(Math.max(0, s.scrollX * scaleX), minimap.width - width);
	const y = Math.min(Math.max(0, s.scrollY * scaleY), minimap.height - height);

	return { x, y, width, height };
}

/**
 * Scroll offset that centers the viewport on `point`, a position within the
 * minimap box. Round-trips with `viewportRectInMinimap`: feeding the centre
 * of that rectangle back in returns (within floating-point tolerance) the
 * scroll that produced it.
 */
export function scrollForMinimapPoint(
	world: Size,
	viewport: Size,
	minimap: Size,
	point: { x: number; y: number }
): Scroll {
	const scaleX = minimap.width > 0 ? world.width / minimap.width : 0;
	const scaleY = minimap.height > 0 ? world.height / minimap.height : 0;

	const worldX = point.x * scaleX;
	const worldY = point.y * scaleY;

	return clampScroll(
		{ scrollX: worldX - viewport.width / 2, scrollY: worldY - viewport.height / 2 },
		world,
		viewport
	);
}

// ---------------------------------------------------------------------------
// Camera rune module (ADR 0010): reactive state for the board canvas's
// pan/zoom, backed entirely by the pure math in camera-math.ts.
//
// This file touches no DOM API. It holds `$state`, and its intent methods
// (zoomIn, panBy, ...) are the only way callers change that state — the
// board-viewport component is responsible for translating gestures (wheel,
// pointer drag, keyboard) into calls here, and for reporting measured sizes
// and observed native scroll back in via the setters below.
//
// `worldWidth`/`worldHeight` are the board's *natural*, unzoomed content
// size (what the grid would measure at 100% zoom); camera-math scales them
// by `zoom` wherever a scaled world size is required (clampScroll, minimap
// projection).
// ---------------------------------------------------------------------------

import {
	clampScroll,
	clampZoom,
	fitZoom,
	nextZoomStep,
	scrollForZoomAt,
	type Scroll,
	type Size
} from './camera-math';

export interface Camera {
	readonly zoom: number;
	readonly scrollX: number;
	readonly scrollY: number;
	readonly worldWidth: number;
	readonly worldHeight: number;
	readonly viewWidth: number;
	readonly viewHeight: number;

	/** Reports the board content's natural (unzoomed) size. */
	setWorldSize(width: number, height: number): void;
	/** Reports the viewport container's measured (client) size. */
	setViewportSize(width: number, height: number): void;
	/** Reports the container's native scroll position, e.g. after a user scroll gesture. */
	setObservedScroll(scrollX: number, scrollY: number): void;

	zoomIn(): void;
	zoomOut(): void;
	resetZoom(): void;
	fit(): void;
	/** Zooms one step in (`dir` 1) or out (`dir` -1), keeping `cursor` fixed in world space. */
	zoomAt(cursorX: number, cursorY: number, dir: 1 | -1): void;
	panBy(dx: number, dy: number): void;
	panTo(scrollX: number, scrollY: number): void;
}

export function createCamera(): Camera {
	let zoom = $state(1);
	let scrollX = $state(0);
	let scrollY = $state(0);
	let worldWidth = $state(0);
	let worldHeight = $state(0);
	let viewWidth = $state(0);
	let viewHeight = $state(0);

	function scaledWorld(): Size {
		return { width: worldWidth * zoom, height: worldHeight * zoom };
	}

	function viewport(): Size {
		return { width: viewWidth, height: viewHeight };
	}

	function applyScroll(s: Scroll): void {
		const clamped = clampScroll(s, scaledWorld(), viewport());
		scrollX = clamped.scrollX;
		scrollY = clamped.scrollY;
	}

	function setZoom(nextZoom: number, cursor: { x: number; y: number }): void {
		const clamped = clampZoom(nextZoom);
		const next = scrollForZoomAt({ scrollX, scrollY, zoom }, cursor, clamped);
		zoom = clamped;
		applyScroll(next);
	}

	/** Zoom step centred on the viewport, used by the button/keyboard shortcuts. */
	function setZoomCentered(nextZoom: number): void {
		setZoom(nextZoom, { x: viewWidth / 2, y: viewHeight / 2 });
	}

	return {
		get zoom() {
			return zoom;
		},
		get scrollX() {
			return scrollX;
		},
		get scrollY() {
			return scrollY;
		},
		get worldWidth() {
			return worldWidth;
		},
		get worldHeight() {
			return worldHeight;
		},
		get viewWidth() {
			return viewWidth;
		},
		get viewHeight() {
			return viewHeight;
		},

		setWorldSize(width: number, height: number) {
			worldWidth = width;
			worldHeight = height;
			applyScroll({ scrollX, scrollY });
		},
		setViewportSize(width: number, height: number) {
			viewWidth = width;
			viewHeight = height;
			applyScroll({ scrollX, scrollY });
		},
		setObservedScroll(observedX: number, observedY: number) {
			scrollX = observedX;
			scrollY = observedY;
		},

		zoomIn() {
			setZoomCentered(nextZoomStep(zoom, 1));
		},
		zoomOut() {
			setZoomCentered(nextZoomStep(zoom, -1));
		},
		resetZoom() {
			setZoomCentered(1);
		},
		fit() {
			setZoomCentered(fitZoom({ width: worldWidth, height: worldHeight }, viewport()));
		},
		zoomAt(cursorX: number, cursorY: number, dir: 1 | -1) {
			setZoom(nextZoomStep(zoom, dir), { x: cursorX, y: cursorY });
		},
		panBy(dx: number, dy: number) {
			applyScroll({ scrollX: scrollX + dx, scrollY: scrollY + dy });
		},
		panTo(nextScrollX: number, nextScrollY: number) {
			applyScroll({ scrollX: nextScrollX, scrollY: nextScrollY });
		}
	};
}

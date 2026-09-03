/**
 * Wires a `Camera` to `camera-storage.ts`: restore on arrival, save while
 * moving, flush before leaving. This was ~60 lines of effects in the board
 * route (finding A11 of `documentation/review-2026-09-02.md`), which made the
 * three rules below invisible among the page's other wiring and untestable
 * without rendering the whole board.
 *
 * The rules, all of which were learned the hard way:
 *
 * 1. **Hydrate once per map, and only once measured.** Both sizes come from
 *    independent `ResizeObserver`s and can settle a tick apart; computing
 *    `fit()` against an unmeasured viewport divides by ~0 and lands on the
 *    minimum zoom step.
 * 2. **Do not save before hydrating.** The pre-restore camera reads 1/0/0, and
 *    writing that would destroy the state we are about to restore.
 * 3. **Flush on the way out.** The debounce cancels its pending timer on
 *    teardown exactly as it does on a rerun, so the last ≤250ms of movement was
 *    being dropped. Svelte teardown covers client-side navigation; `pagehide`
 *    covers reload, tab close, and bfcache, where no teardown runs at all.
 *
 * Must be called during component initialisation — it creates `$effect`s.
 */

import type { Camera } from './camera.svelte';
import { loadCameraState, saveCameraState, type CameraState } from './camera-storage';

/** Debounce for the save. Long enough that a drag is one write, not fifty. */
const SAVE_DEBOUNCE_MS = 250;

/** `localStorage` can throw merely on access in some locked-down browsers. */
function tryGetLocalStorage(): Storage | null {
	try {
		return localStorage;
	} catch {
		return null;
	}
}

export function persistCamera(camera: Camera, getMapId: () => string): void {
	// Gates both effects: the hydrate effect runs once per map id, and the save
	// effect stays silent until hydration for the *current* map has completed.
	let hydratedMapId: string | null = $state(null);

	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	/** Kept outside the effect so the teardown below can still write it. Plain,
	 *  not `$state`: nothing renders from it. */
	let pending: { mapId: string; state: CameraState } | undefined;

	function flush() {
		if (!pending) return;
		const storage = tryGetLocalStorage();
		if (storage) saveCameraState(storage, pending.mapId, pending.state);
		pending = undefined;
	}

	$effect(() => {
		const mapId = getMapId();
		const sizeReady =
			camera.worldWidth > 0 &&
			camera.worldHeight > 0 &&
			camera.viewWidth > 0 &&
			camera.viewHeight > 0;
		if (!sizeReady || hydratedMapId === mapId) return;

		const storage = tryGetLocalStorage();
		const saved = storage ? loadCameraState(storage, mapId) : null;
		if (saved) {
			// Zoom first: the scroll extents the world reports only reflect the
			// new `zoom` after the browser reflows it, so the matching scroll is
			// applied a frame later (and re-clamped there, in case the board has
			// shrunk since this was saved).
			camera.restoreZoom(saved.zoom);
			requestAnimationFrame(() => camera.panTo(saved.scrollX, saved.scrollY));
		} else {
			camera.fit();
		}
		hydratedMapId = mapId;
	});

	$effect(() => {
		const mapId = getMapId();
		const state = { zoom: camera.zoom, scrollX: camera.scrollX, scrollY: camera.scrollY };
		if (hydratedMapId !== mapId) return;

		pending = { mapId, state };
		clearTimeout(saveTimer);
		saveTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);
		return () => clearTimeout(saveTimer);
	});

	// Reads nothing reactive, so it runs once and its cleanup fires only on
	// destroy — see rule 3.
	$effect(() => {
		const onPageHide = () => {
			clearTimeout(saveTimer);
			flush();
		};
		window.addEventListener('pagehide', onPageHide);
		return () => {
			window.removeEventListener('pagehide', onPageHide);
			onPageHide();
		};
	});
}

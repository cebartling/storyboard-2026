// ---------------------------------------------------------------------------
// Camera persistence (ADR 0010): per-map `localStorage` read/write/parse for
// the board's pan/zoom state, key `storyboard:camera:v1:${mapId}`.
//
// This module is deliberately the only place that touches `localStorage` or
// parses its contents, so it can be unit-tested (round-trip, malformed JSON,
// missing/NaN fields, a throwing storage backend) without any DOM or Svelte
// effect involved. The `$effect` wiring in the route stays a thin caller of
// `load`/`save`.
//
// Every storage access is wrapped in try/catch: `localStorage` throws in
// private-mode Safari once its (zero) quota is exceeded, and can be entirely
// unavailable (throws on access) in locked-down browser configurations.
// Neither case should break the page — it should just mean "nothing saved".
// ---------------------------------------------------------------------------

export interface CameraState {
	zoom: number;
	scrollX: number;
	scrollY: number;
}

/** Minimal shape this module needs from `localStorage` — real or a test stub. */
export interface CameraStorageBackend {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

export function cameraStorageKey(mapId: string): string {
	return `storyboard:camera:v1:${mapId}`;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

/** Validates an unknown parsed JSON value into a `CameraState`, or `null` if it isn't one. */
function toCameraState(value: unknown): CameraState | null {
	if (typeof value !== 'object' || value === null) return null;
	const { zoom, scrollX, scrollY } = value as Record<string, unknown>;
	if (!isFiniteNumber(zoom) || !isFiniteNumber(scrollX) || !isFiniteNumber(scrollY)) {
		return null;
	}
	return { zoom, scrollX, scrollY };
}

/**
 * Reads and validates the saved camera state for `mapId`. Returns `null` on
 * anything short of a fully-valid `CameraState` — missing entry, malformed
 * JSON, wrong shape, or non-finite fields — and on a throwing backend, so
 * callers can treat "no state" and "corrupt state" identically (fall back to
 * `fit()`).
 */
export function loadCameraState(backend: CameraStorageBackend, mapId: string): CameraState | null {
	try {
		const raw = backend.getItem(cameraStorageKey(mapId));
		if (raw === null) return null;
		return toCameraState(JSON.parse(raw));
	} catch {
		return null;
	}
}

/**
 * Saves the camera state for `mapId`. Swallows any storage error (quota,
 * disabled storage) — a failed save should never break the page.
 */
export function saveCameraState(
	backend: CameraStorageBackend,
	mapId: string,
	state: CameraState
): void {
	try {
		backend.setItem(cameraStorageKey(mapId), JSON.stringify(state));
	} catch {
		// Private-mode quota, disabled storage, etc. — persistence is a nicety,
		// not a requirement; the current session already has the camera state.
	}
}

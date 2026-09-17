// ---------------------------------------------------------------------------
// Slice density persistence (ADR 0022, extending ADR 0020): per-map
// `localStorage` read/write of how much of each release slice this viewer wants
// to see, key `storyboard:slice-density:v1:${mapId}`.
//
// Presentation state for one viewer, like the camera (ADR 0010) — it never
// reaches the server, the aggregate, or a collaborator's board. Shaped after
// `camera-storage.ts` for the same reason: the only module that touches
// `localStorage` for this, testable without a DOM.
//
// The key is a new namespace rather than a v2 of `storyboard:collapsed-slices`,
// and nothing migrates the old entry — a viewer's collapsed slices come back
// expanded once (ADR 0022).
//
// Stale ids (a slice someone else deleted) are kept and simply match no row;
// every access is wrapped because `localStorage` can throw on use or access.
// ---------------------------------------------------------------------------

import { isSliceDensity, type SliceDensity } from './slice-density';

/** Minimal shape this module needs from `localStorage` — real or a test stub. */
export interface SliceDensityStorageBackend {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

export function sliceDensityStorageKey(mapId: string): string {
	return `storyboard:slice-density:v1:${mapId}`;
}

/**
 * Reads the per-slice densities for `mapId`. Returns an empty map for a missing
 * entry, malformed JSON, anything that is not an object of valid densities, and
 * a throwing backend — all of which mean "everything expanded".
 *
 * An entry is dropped wholesale rather than per-key on a bad value: a value
 * this module did not write is a value it cannot reason about, and half-reading
 * it would leave the board in a state no cycle of the control produced.
 */
export function loadSliceDensities(
	backend: SliceDensityStorageBackend,
	mapId: string
): Map<string, SliceDensity> {
	try {
		const raw = backend.getItem(sliceDensityStorageKey(mapId));
		if (raw === null) return new Map();
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			return new Map();
		}
		const entries = Object.entries(parsed);
		if (!entries.every(([, density]) => isSliceDensity(density))) return new Map();
		return new Map(entries as [string, SliceDensity][]);
	} catch {
		return new Map();
	}
}

/** Saves the per-slice densities for `mapId`, swallowing any storage error. */
export function saveSliceDensities(
	backend: SliceDensityStorageBackend,
	mapId: string,
	densities: Iterable<[string, SliceDensity]>
): void {
	try {
		backend.setItem(sliceDensityStorageKey(mapId), JSON.stringify(Object.fromEntries(densities)));
	} catch {
		// Private-mode quota, disabled storage, etc. — the current session still
		// has the state; only its survival across a reload is lost.
	}
}

// ---------------------------------------------------------------------------
// Slice collapse persistence (ADR 0020): per-map `localStorage` read/write of
// which release slices this viewer has collapsed, key
// `storyboard:collapsed-slices:v1:${mapId}`.
//
// Presentation state for one viewer, like the camera (ADR 0010) — it never
// reaches the server, the aggregate, or a collaborator's board. Shaped after
// `camera-storage.ts` for the same reason: the only module that touches
// `localStorage` for this, testable without a DOM.
//
// Stale ids (a slice someone else deleted) are kept and simply match no row;
// every access is wrapped because `localStorage` can throw on use or access.
// ---------------------------------------------------------------------------

/** Minimal shape this module needs from `localStorage` — real or a test stub. */
export interface SliceCollapseStorageBackend {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

export function sliceCollapseStorageKey(mapId: string): string {
	return `storyboard:collapsed-slices:v1:${mapId}`;
}

/**
 * Reads the collapsed slice ids for `mapId`. Returns an empty set for a missing
 * entry, malformed JSON, anything other than an array of strings, and a
 * throwing backend — all of which mean "everything expanded".
 */
export function loadCollapsedSlices(
	backend: SliceCollapseStorageBackend,
	mapId: string
): Set<string> {
	try {
		const raw = backend.getItem(sliceCollapseStorageKey(mapId));
		if (raw === null) return new Set();
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === 'string')) {
			return new Set();
		}
		return new Set(parsed);
	} catch {
		return new Set();
	}
}

/** Saves the collapsed slice ids for `mapId`, swallowing any storage error. */
export function saveCollapsedSlices(
	backend: SliceCollapseStorageBackend,
	mapId: string,
	sliceIds: Iterable<string>
): void {
	try {
		backend.setItem(sliceCollapseStorageKey(mapId), JSON.stringify([...sliceIds]));
	} catch {
		// Private-mode quota, disabled storage, etc. — the current session still
		// has the state; only its survival across a reload is lost.
	}
}

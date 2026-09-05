import { untrack } from 'svelte';
import type { ClientId } from '$lib/domain/ids';
import { createMapSync, type MapSync, type MapSyncOptions } from './map-sync.svelte';

export interface MapSyncLifecycleOptions {
	/** The map to follow. Read through a `$derived`, so a new `data` object
	 *  carrying the same id does not reconnect. */
	mapId: () => string;
	/** The version the page is currently showing. Read once, at connect. */
	version: () => number;
	clientId: ClientId;
	refetch: () => Promise<void>;
	/** Injected by tests; defaults to the real thing. */
	create?: (options: MapSyncOptions) => MapSync;
}

/**
 * Owns the map sync's lifetime: connect on arrival, dispose on the way out,
 * reconnect only when the map itself changes.
 *
 * This lives in its own module because the dependency question is subtle enough
 * to have been got wrong once. Reading `data.board.id` directly inside an
 * `$effect` tracks `data`, and `invalidateAll()` replaces `data` wholesale on
 * every refetch — so the stream was torn down and rebuilt on every change,
 * remote or local. Every viewer flapped out of and back into presence, cursors
 * reset, and a lone viewer's hub was dropped and recreated, losing its replay
 * buffer.
 *
 * The fix is that `$derived` only notifies its dependents when the value it
 * produces actually changes. Wrapping the id in one turns "a new `data` object"
 * into "the same string", and the effect stays put. `untrack` around the
 * version is still needed for a different reason: the starting position is read
 * once at connect and must not be a dependency at all.
 */
export function useMapSync(options: MapSyncLifecycleOptions): { readonly current: MapSync | null } {
	const create = options.create ?? createMapSync;
	const mapId = $derived(options.mapId());

	let sync = $state<MapSync | null>(null);

	$effect(() => {
		const started = create({
			mapId,
			initialSeq: untrack(() => options.version()),
			clientId: options.clientId,
			refetch: options.refetch
		});
		sync = started;
		return () => {
			started.dispose();
			sync = null;
		};
	});

	return {
		get current() {
			return sync;
		}
	};
}

import { describe, expect, it, vi, type Mock } from 'vitest';
import { flushSync } from 'svelte';
import type { MapSync, MapSyncOptions } from './map-sync.svelte';
import { useMapSync } from './map-sync-lifecycle.svelte';

function fakeSync(): MapSync {
	return {
		state: 'connected',
		seq: 0,
		participants: [],
		cursors: [],
		observe: () => {},
		pause: () => {},
		resume: () => {},
		dispose: vi.fn()
	} as unknown as MapSync;
}

describe('useMapSync', () => {
	it('connects once on arrival', () => {
		const create: Mock<(options: MapSyncOptions) => MapSync> = vi.fn(() => fakeSync());
		const board = $state({ current: { id: 'm1', version: 1 } });

		const stop = $effect.root(() => {
			useMapSync({
				mapId: () => board.current.id,
				version: () => board.current.version,
				clientId: 'tab-1',
				refetch: async () => {},
				create
			});
		});
		flushSync();

		expect(create).toHaveBeenCalledTimes(1);
		expect(create.mock.calls[0][0]).toMatchObject({ mapId: 'm1', initialSeq: 1 });
		stop();
	});

	it('does not reconnect when a refetch replaces the data for the same map', () => {
		// The regression this module exists for. `invalidateAll()` hands the page a
		// brand-new `data` object on every refetch — remote change, own edit, or
		// drag — and reading the id straight out of it inside the effect tracked
		// the object rather than the id. The stream was torn down and rebuilt every
		// time: presence flapped, cursors reset, and a lone viewer's hub was
		// dropped and recreated without its replay buffer.
		const create: Mock<(options: MapSyncOptions) => MapSync> = vi.fn(() => fakeSync());
		const board = $state({ current: { id: 'm1', version: 1 } });

		const stop = $effect.root(() => {
			useMapSync({
				mapId: () => board.current.id,
				version: () => board.current.version,
				clientId: 'tab-1',
				refetch: async () => {},
				create
			});
		});
		flushSync();

		// A refetch: a different object, the same map, a newer version.
		board.current = { id: 'm1', version: 2 };
		flushSync();
		board.current = { id: 'm1', version: 3 };
		flushSync();

		expect(create).toHaveBeenCalledTimes(1);
		stop();
	});

	it('reconnects when the map itself changes, starting from the new map version', () => {
		const created: MapSync[] = [];
		const create: Mock<(options: MapSyncOptions) => MapSync> = vi.fn(() => {
			const s = fakeSync();
			created.push(s);
			return s;
		});
		const board = $state({ current: { id: 'm1', version: 1 } });

		const stop = $effect.root(() => {
			useMapSync({
				mapId: () => board.current.id,
				version: () => board.current.version,
				clientId: 'tab-1',
				refetch: async () => {},
				create
			});
		});
		flushSync();

		board.current = { id: 'm2', version: 7 };
		flushSync();

		expect(create).toHaveBeenCalledTimes(2);
		expect(create.mock.calls[1][0]).toMatchObject({ mapId: 'm2', initialSeq: 7 });
		// The old stream is closed rather than left open alongside the new one.
		expect(created[0].dispose).toHaveBeenCalledTimes(1);
		stop();
	});

	it('disposes the stream when the page goes away', () => {
		const created: MapSync[] = [];
		const create: Mock<(options: MapSyncOptions) => MapSync> = vi.fn(() => {
			const s = fakeSync();
			created.push(s);
			return s;
		});
		const board = $state({ current: { id: 'm1', version: 1 } });

		const stop = $effect.root(() => {
			useMapSync({
				mapId: () => board.current.id,
				version: () => board.current.version,
				clientId: 'tab-1',
				refetch: async () => {},
				create
			});
		});
		flushSync();

		stop();

		expect(created[0].dispose).toHaveBeenCalledTimes(1);
	});

	it('exposes the live sync while it is connected, and null once it is gone', () => {
		const board = $state({ current: { id: 'm1', version: 1 } });
		let lifecycle!: ReturnType<typeof useMapSync>;

		const stop = $effect.root(() => {
			lifecycle = useMapSync({
				mapId: () => board.current.id,
				version: () => board.current.version,
				clientId: 'tab-1',
				refetch: async () => {},
				create: () => fakeSync()
			});
		});
		flushSync();

		expect(lifecycle.current).not.toBeNull();
		stop();
		expect(lifecycle.current).toBeNull();
	});
});

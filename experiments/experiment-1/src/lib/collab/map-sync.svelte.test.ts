import { describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { createMapSync } from './map-sync.svelte';

/**
 * A stand-in for the browser's `EventSource`, so the sync loop can be driven
 * event by event without a server. The real one is injected, not mocked
 * globally, which is why `createMapSync` takes a constructor.
 */
class FakeEventSource {
	static instances: FakeEventSource[] = [];
	readonly listeners = new Map<string, ((event: MessageEvent) => void)[]>();
	onerror: (() => void) | null = null;
	readyState = 0;
	closed = false;

	constructor(readonly url: string) {
		FakeEventSource.instances.push(this);
	}

	addEventListener(type: string, handler: (event: MessageEvent) => void) {
		const existing = this.listeners.get(type) ?? [];
		this.listeners.set(type, [...existing, handler]);
	}

	emit(type: string, data: unknown) {
		for (const handler of this.listeners.get(type) ?? []) {
			handler(new MessageEvent(type, { data: JSON.stringify(data) }));
		}
	}

	fail({ closedByBrowser = true } = {}) {
		this.readyState = closedByBrowser ? 2 : 0;
		this.onerror?.();
	}

	close() {
		this.closed = true;
	}
}

function setup(overrides: Partial<Parameters<typeof createMapSync>[0]> = {}) {
	FakeEventSource.instances = [];
	const refetch = vi.fn(async () => {});
	const sync = createMapSync({
		mapId: 'm1',
		initialSeq: 3,
		clientId: 'tab-1',
		refetch,
		EventSourceCtor: FakeEventSource as unknown as typeof EventSource,
		...overrides
	});
	return { sync, refetch, source: () => FakeEventSource.instances.at(-1)! };
}

describe('createMapSync', () => {
	it('subscribes with the version the page was loaded at', () => {
		const { source, sync } = setup();

		expect(source().url).toContain('lastSeq=3');
		expect(source().url).toContain('client=tab-1');
		sync.dispose();
	});

	it('refetches once per change and tracks the sequence', async () => {
		const { sync, refetch, source } = setup();
		source().emit('hello', { seq: 3 });

		source().emit('change', { seq: 4 });
		await vi.waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));

		flushSync();
		expect(sync.seq).toBe(4);
		sync.dispose();
	});

	it('coalesces changes that arrive while a refetch is still running', async () => {
		// Without this, a burst of remote edits queues a full board reload each and
		// the board lags by however long the backlog takes.
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		const refetch = vi.fn(() => gate);
		const { sync, source } = setup({ refetch });

		source().emit('change', { seq: 4 });
		source().emit('change', { seq: 5 });
		source().emit('change', { seq: 6 });
		expect(refetch).toHaveBeenCalledTimes(1);

		release();
		// Exactly one more: the three that piled up collapse into a single catch-up.
		await vi.waitFor(() => expect(refetch).toHaveBeenCalledTimes(2));
		flushSync();
		expect(sync.seq).toBe(6);
		sync.dispose();
	});

	it('treats a resync as "refetch", since the notification carries no data anyway', async () => {
		const { sync, refetch, source } = setup();

		source().emit('resync', { seq: 42 });

		await vi.waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
		flushSync();
		expect(sync.seq).toBe(42);
		sync.dispose();
	});

	it('reports connection state so the UI (and the e2e suite) can wait for it', () => {
		const { sync, source } = setup();
		flushSync();
		expect(sync.state).toBe('connecting');

		source().emit('hello', { seq: 3 });

		flushSync();
		expect(sync.state).toBe('connected');
		sync.dispose();
	});

	describe('while paused for a drag', () => {
		it('does not refetch, which would pull the card out from under the pointer', async () => {
			const { sync, refetch, source } = setup();
			sync.pause();

			source().emit('change', { seq: 4 });

			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(refetch).not.toHaveBeenCalled();
			sync.dispose();
		});

		it('catches up exactly once on resume, however many changes arrived', async () => {
			// Queued rather than dropped: a remote change during a three-second drag
			// would otherwise be invisible until the next unrelated event.
			const { sync, refetch, source } = setup();
			sync.pause();
			source().emit('change', { seq: 4 });
			source().emit('change', { seq: 5 });

			sync.resume();

			await vi.waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
			sync.dispose();
		});

		it('does nothing on resume if nothing happened', async () => {
			const { sync, refetch } = setup();
			sync.pause();

			sync.resume();

			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(refetch).not.toHaveBeenCalled();
			sync.dispose();
		});
	});

	describe('presence and cursors', () => {
		it('tracks the participant list', () => {
			const { sync, source } = setup();

			source().emit('presence', {
				participants: [{ userId: 'u1', displayName: 'Alice', clientId: 'tab-1' }]
			});

			flushSync();
			expect(sync.participants).toEqual([
				{ userId: 'u1', displayName: 'Alice', clientId: 'tab-1' }
			]);
			sync.dispose();
		});

		it('replaces a cursor rather than accumulating one per move', () => {
			const { sync, source } = setup();

			source().emit('cursor', { clientId: 'other', displayName: 'Bob', x: 1, y: 2 });
			source().emit('cursor', { clientId: 'other', displayName: 'Bob', x: 5, y: 6 });

			flushSync();
			expect(sync.cursors).toEqual([{ clientId: 'other', displayName: 'Bob', x: 5, y: 6 }]);
			sync.dispose();
		});

		it('clears a cursor when its owner leaves the board area', () => {
			const { sync, source } = setup();
			source().emit('cursor', { clientId: 'other', displayName: 'Bob', x: 1, y: 2 });

			source().emit('cursor', { clientId: 'other', x: null });

			flushSync();
			expect(sync.cursors).toEqual([]);
			sync.dispose();
		});

		it('drops the cursor of someone who has disconnected', () => {
			// Presence is the authority on who is here; a stale pointer left behind
			// by a closed tab would sit on the board forever.
			const { sync, source } = setup();
			source().emit('cursor', { clientId: 'gone', displayName: 'Bob', x: 1, y: 2 });

			source().emit('presence', { participants: [] });

			flushSync();
			expect(sync.cursors).toEqual([]);
			sync.dispose();
		});
	});

	describe('reconnection', () => {
		it('reconnects itself rather than trusting the browser to recover', async () => {
			// A stuck EventSource left in CONNECTING does not reliably come back
			// after a real network drop, and "has the browser given up yet" is not a
			// state worth reasoning about. The position travels in the URL, so a
			// fresh connection resumes exactly where the old one stopped.
			const { sync, source } = setup({ baseDelayMs: 5 });

			source().fail({ closedByBrowser: false });
			flushSync();
			expect(sync.state).toBe('reconnecting');

			await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
			sync.dispose();
		});

		it('does not open a second connection while one attempt is already pending', async () => {
			const { sync, source } = setup({ baseDelayMs: 20 });

			source().fail();
			source().fail();
			source().fail();

			await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
			await new Promise((resolve) => setTimeout(resolve, 40));
			expect(FakeEventSource.instances.length).toBeLessThanOrEqual(3);
			sync.dispose();
		});

		it('reconnects with backoff when the source closes for good', async () => {
			const { sync, source } = setup({ baseDelayMs: 5 });
			source().emit('hello', { seq: 3 });
			source().emit('change', { seq: 9 });

			source().fail();

			await vi.waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
			// It resumes from where it got to, not from where the page loaded.
			expect(FakeEventSource.instances[1].url).toContain('lastSeq=9');
			sync.dispose();
		});

		it('stops reconnecting once disposed', async () => {
			const { sync, source } = setup({ baseDelayMs: 5 });
			const first = source();

			sync.dispose();
			first.fail();

			await new Promise((resolve) => setTimeout(resolve, 30));
			expect(FakeEventSource.instances).toHaveLength(1);
			expect(first.closed).toBe(true);
		});
	});

	describe('ignoring its own echo', () => {
		it('does not refetch for a change it has already seen', async () => {
			// A mutation is broadcast to everyone including whoever made it — the
			// server does not know which connection caused it. The originating tab
			// has already refetched as part of its own submission.
			const { sync, refetch, source } = setup();
			sync.observe(4);

			source().emit('change', { seq: 4 });

			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(refetch).not.toHaveBeenCalled();
			sync.dispose();
		});

		it('still refetches for a change that is genuinely newer', async () => {
			const { sync, refetch, source } = setup();
			sync.observe(4);

			source().emit('change', { seq: 5 });

			await vi.waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
			sync.dispose();
		});

		it('never moves its position backwards', async () => {
			const { sync, source } = setup();
			source().emit('change', { seq: 9 });
			flushSync();

			sync.observe(4);

			flushSync();
			expect(sync.seq).toBe(9);
			sync.dispose();
		});
	});
});

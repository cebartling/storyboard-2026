import { describe, expect, it } from 'vitest';
import type { MapId, UserId } from '$lib/domain/ids';
import { CollabHubs, MapHub, type HubEvent, type Subscriber } from './map-hub';

function recorder(clientId: string, userId = clientId, displayName = clientId) {
	const events: HubEvent[] = [];
	const subscriber: Subscriber = {
		clientId,
		userId: userId as UserId,
		displayName,
		send: (event) => events.push(event)
	};
	return { subscriber, events, changes: () => events.filter((e) => e.type === 'change') };
}

describe('MapHub', () => {
	describe('change notifications', () => {
		it('fans a change out to every subscriber with its sequence number', () => {
			const hub = new MapHub();
			const alice = recorder('a');
			const bob = recorder('b');
			hub.subscribe(alice.subscriber, null);
			hub.subscribe(bob.subscriber, null);

			hub.publishChange(4);

			expect(alice.changes()).toEqual([{ type: 'change', seq: 4 }]);
			expect(bob.changes()).toEqual([{ type: 'change', seq: 4 }]);
		});

		it('carries no payload beyond the sequence number', () => {
			// ADR 0015 §5: notify-and-refetch, not diff broadcast. Keeping the event
			// empty is what makes the decision cheap to revisit and impossible to
			// half-implement.
			const hub = new MapHub();
			const alice = recorder('a');
			hub.subscribe(alice.subscriber, null);

			hub.publishChange(1);

			expect(Object.keys(alice.changes()[0])).toEqual(['type', 'seq']);
		});

		it('skips the tab that caused the change, which has already refetched', () => {
			// Otherwise every local edit re-renders the board twice — and mid-drag
			// the second render pulls the card out from under the pointer.
			const hub = new MapHub();
			const alice = recorder('a');
			const bob = recorder('b');
			hub.subscribe(alice.subscriber, null);
			hub.subscribe(bob.subscriber, null);

			hub.publishChange(4, 'a');

			expect(alice.changes()).toEqual([]);
			expect(bob.changes()).toEqual([{ type: 'change', seq: 4 }]);
		});

		it('still buffers a change it skipped, so a reconnect replays it correctly', () => {
			const hub = new MapHub();
			const alice = recorder('a');
			hub.subscribe(alice.subscriber, null);
			hub.publishChange(1, 'a');

			const late = recorder('late');
			hub.subscribe(late.subscriber, 0);

			expect(late.changes()).toEqual([{ type: 'change', seq: 1 }]);
		});
	});

	describe('catching up on connect', () => {
		it('sends nothing to a subscriber that is already up to date', () => {
			const hub = new MapHub();
			hub.observe(7);
			const alice = recorder('a');

			hub.subscribe(alice.subscriber, 7);

			expect(alice.changes()).toEqual([]);
		});

		it('replays the changes a subscriber missed', () => {
			const hub = new MapHub();
			hub.observe(3);
			hub.publishChange(4);
			hub.publishChange(5);
			const alice = recorder('a');

			hub.subscribe(alice.subscriber, 3);

			expect(alice.changes()).toEqual([
				{ type: 'change', seq: 4 },
				{ type: 'change', seq: 5 }
			]);
		});

		it('tells a subscriber that has fallen past the buffer to resync', () => {
			const hub = new MapHub(2);
			hub.observe(0);
			for (const seq of [1, 2, 3, 4]) hub.publishChange(seq);
			const alice = recorder('a');

			hub.subscribe(alice.subscriber, 1);

			expect(alice.events.filter((e) => e.type === 'resync')).toEqual([{ type: 'resync', seq: 4 }]);
		});

		it('tells a subscriber ahead of a restarted hub to resync', () => {
			// The process restarted, so the hub's sequence is behind a version the
			// client legitimately holds. There is nothing to replay, and rewinding
			// would be wrong.
			const hub = new MapHub();
			hub.observe(2);
			const alice = recorder('a');

			hub.subscribe(alice.subscriber, 9);

			expect(alice.events.filter((e) => e.type === 'resync')).toHaveLength(1);
		});

		it('never lowers its sequence, so a stale read cannot rewind everyone', () => {
			const hub = new MapHub();
			hub.observe(8);

			hub.observe(3);

			expect(hub.seq).toBe(8);
		});
	});

	describe('presence', () => {
		it('announces the participant list when someone joins and when they leave', () => {
			const hub = new MapHub();
			const alice = recorder('a-tab', 'alice', 'Alice');
			const release = hub.subscribe(alice.subscriber, null);
			const bob = recorder('b-tab', 'bob', 'Bob');
			hub.subscribe(bob.subscriber, null);

			const afterJoin = alice.events.filter((e) => e.type === 'presence').at(-1);
			expect(afterJoin).toMatchObject({
				participants: [{ displayName: 'Alice' }, { displayName: 'Bob' }]
			});

			release();

			const afterLeave = bob.events.filter((e) => e.type === 'presence').at(-1);
			expect(afterLeave).toMatchObject({ participants: [{ displayName: 'Bob' }] });
		});

		it('counts one person once, however many tabs they have open', () => {
			const hub = new MapHub();
			hub.subscribe(recorder('tab-1', 'alice', 'Alice').subscriber, null);
			const second = recorder('tab-2', 'alice', 'Alice');
			hub.subscribe(second.subscriber, null);

			expect(hub.participants()).toHaveLength(1);
			expect(hub.subscriberCount).toBe(2);
		});
	});

	describe('cursors', () => {
		it('sends a cursor to everyone except the person moving it', () => {
			const hub = new MapHub();
			const alice = recorder('a', 'alice', 'Alice');
			const bob = recorder('b', 'bob', 'Bob');
			hub.subscribe(alice.subscriber, null);
			hub.subscribe(bob.subscriber, null);

			hub.publishCursor(alice.subscriber, { x: 10, y: 20 });

			expect(bob.events.filter((e) => e.type === 'cursor')).toEqual([
				{ type: 'cursor', clientId: 'a', displayName: 'Alice', x: 10, y: 20 }
			]);
			// Echoing it back would fight the local pointer.
			expect(alice.events.filter((e) => e.type === 'cursor')).toEqual([]);
		});

		it('sends a null cursor when someone leaves the board area', () => {
			const hub = new MapHub();
			const alice = recorder('a', 'alice', 'Alice');
			const bob = recorder('b', 'bob', 'Bob');
			hub.subscribe(alice.subscriber, null);
			hub.subscribe(bob.subscriber, null);

			hub.publishCursor(alice.subscriber, null);

			expect(bob.events.filter((e) => e.type === 'cursor')).toEqual([
				{ type: 'cursor', clientId: 'a', x: null }
			]);
		});

		it('never persists anything: cursors are events, not state', () => {
			const hub = new MapHub();
			const alice = recorder('a', 'alice', 'Alice');
			hub.subscribe(alice.subscriber, null);
			hub.publishCursor(alice.subscriber, { x: 1, y: 2 });

			// A later joiner learns nothing about where anyone's pointer was; losing
			// them on reconnect is correct behaviour, not data loss (ADR 0015 §6).
			const bob = recorder('b', 'bob', 'Bob');
			hub.subscribe(bob.subscriber, null);
			expect(bob.events.filter((e) => e.type === 'cursor')).toEqual([]);
		});
	});

	describe('lifecycle', () => {
		it('unsubscribing twice is harmless', () => {
			const hub = new MapHub();
			const alice = recorder('a');
			const release = hub.subscribe(alice.subscriber, null);

			release();
			release();

			expect(hub.subscriberCount).toBe(0);
		});
	});
});

describe('CollabHubs', () => {
	it('gives the same hub for the same map', () => {
		const hubs = new CollabHubs();

		expect(hubs.hubFor('m1' as MapId)).toBe(hubs.hubFor('m1' as MapId));
	});

	it('keeps maps apart', () => {
		const hubs = new CollabHubs();

		expect(hubs.hubFor('m1' as MapId)).not.toBe(hubs.hubFor('m2' as MapId));
	});

	it('drops a hub once its last subscriber leaves, so idle maps cost nothing', () => {
		const hubs = new CollabHubs();
		const hub = hubs.hubFor('m1' as MapId);
		const release = hub.subscribe(recorder('a').subscriber, null);
		expect(hubs.size).toBe(1);

		release();

		expect(hubs.size).toBe(0);
	});
});

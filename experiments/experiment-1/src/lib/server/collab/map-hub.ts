import type { MapId, UserId } from '$lib/domain/ids';

/**
 * In-process fan-out for one story map (ADR 0015 §§5-7).
 *
 * Pure TypeScript: no Kit, no database, no HTTP. That is what lets the replay
 * and presence rules be tested directly instead of through a stream.
 *
 * **Single process only.** Two server instances would each fan out to their own
 * subscribers and neither would see the other's writes — the same assumption
 * the per-map write lock rests on, and the one ADR 0015 §2 promotes to a
 * correctness requirement.
 */

export interface Participant {
	userId: UserId;
	displayName: string;
	/** Distinguishes two tabs of one account. Minted by the client per stream
	 *  connection — never a cookie, never an identity (ADR 0016 §6). */
	clientId: string;
}

/**
 * One person on the board, with every tab they have open.
 *
 * Presence is per *person* — a colleague with two windows is one colleague —
 * but cursors and "is this me?" are per *tab*, so the list has to carry all of
 * a person's client ids rather than whichever tab happened to connect first.
 * Keeping only the first meant a second tab's cursor was pruned every time
 * anyone joined or left, and that tab saw its own account listed as a stranger.
 */
export interface PresenceEntry {
	userId: UserId;
	displayName: string;
	clientIds: string[];
}

export type HubEvent =
	/** Something changed; the payload is a sequence number, never data (§5). */
	| { type: 'change'; seq: number }
	/** You are too far behind to replay — refetch. */
	| { type: 'resync'; seq: number }
	| { type: 'presence'; participants: PresenceEntry[] }
	// `userId` travels with the cursor so the receiver can colour it by person:
	// a cursor and its owner's avatar must not be different colours.
	| { type: 'cursor'; clientId: string; userId: UserId; displayName: string; x: number; y: number }
	| { type: 'cursor'; clientId: string; x: null };

export interface Subscriber extends Participant {
	send(event: HubEvent): void;
}

/** Small on purpose: notifications carry no payload, so falling behind costs a
 *  refetch the client was going to do anyway. */
const DEFAULT_BUFFER = 32;

export class MapHub {
	private readonly subscribers = new Set<Subscriber>();
	private readonly buffer: number[] = [];
	private currentSeq = 0;

	constructor(
		private readonly bufferSize = DEFAULT_BUFFER,
		private readonly onEmpty?: () => void
	) {}

	get seq(): number {
		return this.currentSeq;
	}

	get subscriberCount(): number {
		return this.subscribers.size;
	}

	/**
	 * Tells the hub what the persisted version is. ADR 0015 §7 implied a
	 * hub-local counter; using the map's own version instead means a client can
	 * compare what `load()` gave it against what the hub has, which a counter
	 * that resets on restart could not support. Never lowers the sequence: a
	 * stale read must not rewind everyone.
	 */
	observe(version: number): void {
		if (version > this.currentSeq) this.currentSeq = version;
	}

	/**
	 * `originClientId` is the connection that caused the change, if it is one of
	 * ours. It is skipped, because it has already refetched as part of its own
	 * submission — telling it again would re-render the board a second time for
	 * every local edit, which is both wasteful and, mid-drag, enough to pull an
	 * element out from under the pointer.
	 *
	 * The change still goes into the buffer, so a reconnecting client replays it
	 * correctly however it was caused.
	 */
	publishChange(seq: number, originClientId?: string): void {
		this.observe(seq);
		this.buffer.push(seq);
		if (this.buffer.length > this.bufferSize) this.buffer.shift();
		for (const subscriber of this.subscribers) {
			if (subscriber.clientId !== originClientId) subscriber.send({ type: 'change', seq });
		}
	}

	publishCursor(from: Participant, cursor: { x: number; y: number } | null): void {
		const event: HubEvent = cursor
			? {
					type: 'cursor',
					clientId: from.clientId,
					userId: from.userId,
					displayName: from.displayName,
					...cursor
				}
			: { type: 'cursor', clientId: from.clientId, x: null };
		// Everyone but the origin: a client already knows where its own pointer is,
		// and echoing it back would fight the local cursor.
		for (const subscriber of this.subscribers) {
			if (subscriber.clientId !== from.clientId) subscriber.send(event);
		}
	}

	/** One entry per account, carrying every tab that account has open. */
	participants(): PresenceEntry[] {
		const byUser = new Map<UserId, PresenceEntry>();
		for (const subscriber of this.subscribers) {
			const existing = byUser.get(subscriber.userId);
			if (existing) {
				existing.clientIds.push(subscriber.clientId);
				continue;
			}
			byUser.set(subscriber.userId, {
				userId: subscriber.userId,
				displayName: subscriber.displayName,
				clientIds: [subscriber.clientId]
			});
		}
		return [...byUser.values()];
	}

	subscribe(subscriber: Subscriber, lastSeq: number | null): () => void {
		this.subscribers.add(subscriber);
		this.catchUp(subscriber, lastSeq);
		this.broadcastPresence();

		let released = false;
		return () => {
			// Idempotent: a stream can be cancelled and then closed, and unsubscribing
			// twice must not fire presence twice or empty the hub early.
			if (released) return;
			released = true;
			this.subscribers.delete(subscriber);
			this.broadcastPresence();
			if (this.subscribers.size === 0) this.onEmpty?.();
		};
	}

	private catchUp(subscriber: Subscriber, lastSeq: number | null): void {
		if (lastSeq === null || lastSeq === this.currentSeq) return;
		// Ahead of us: the process restarted and this hub's sequence is behind what
		// the client legitimately holds. Nothing to replay, so tell it to refetch.
		if (lastSeq > this.currentSeq) {
			subscriber.send({ type: 'resync', seq: this.currentSeq });
			return;
		}
		const replayable = this.buffer.filter((seq) => seq > lastSeq);
		const contiguous = replayable.length > 0 && replayable[0] === lastSeq + 1;
		if (!contiguous) {
			subscriber.send({ type: 'resync', seq: this.currentSeq });
			return;
		}
		for (const seq of replayable) subscriber.send({ type: 'change', seq });
	}

	private broadcastPresence(): void {
		this.broadcast({ type: 'presence', participants: this.participants() });
	}

	private broadcast(event: HubEvent): void {
		for (const subscriber of this.subscribers) subscriber.send(event);
	}
}

/** The per-map hubs for this process. Created on demand, dropped when empty. */
export class CollabHubs {
	private readonly hubs = new Map<MapId, MapHub>();

	constructor(private readonly bufferSize = DEFAULT_BUFFER) {}

	/**
	 * The hub for a map **only if somebody is watching it**.
	 *
	 * Publishers use this rather than `hubFor`, because a broadcast with no
	 * subscribers has nowhere to go and creating a hub to deliver it leaves an
	 * empty one behind forever — `onEmpty` fires from `unsubscribe`, which never
	 * happens for a hub nobody subscribed to. The page's unload cursor POST is
	 * sent with `keepalive`, so it routinely arrives after the last stream has
	 * closed and would otherwise resurrect the hub it just emptied.
	 */
	watching(mapId: MapId): MapHub | undefined {
		return this.hubs.get(mapId);
	}

	/** Creates the hub if it does not exist. For subscribers only. */
	hubFor(mapId: MapId): MapHub {
		const existing = this.hubs.get(mapId);
		if (existing) return existing;
		const hub = new MapHub(this.bufferSize, () => this.hubs.delete(mapId));
		this.hubs.set(mapId, hub);
		return hub;
	}

	get size(): number {
		return this.hubs.size;
	}
}

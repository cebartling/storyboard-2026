import type { ClientId, UserId } from '$lib/domain/ids';

export interface RemoteParticipant {
	userId: UserId;
	displayName: string;
	/** Every tab this person has open. Presence is per person; cursors and
	 *  "is this me?" are per tab. */
	clientIds: ClientId[];
}

export interface RemoteCursor {
	clientId: ClientId;
	/** Colour is keyed on the person, so a cursor matches its owner's avatar. */
	userId: UserId;
	displayName: string;
	x: number;
	y: number;
}

export interface MapSyncOptions {
	mapId: string;
	/** The version `load()` gave the page — the client's starting position. */
	initialSeq: number;
	/** This tab. Not an identity; it only separates two tabs of one account. */
	clientId: ClientId;
	refetch: () => Promise<void>;
	/** Injected so tests can drive the stream without a server. */
	EventSourceCtor?: typeof EventSource;
	baseDelayMs?: number;
	maxDelayMs?: number;
}

export type SyncState = 'connecting' | 'connected' | 'reconnecting';

export interface MapSync {
	readonly state: SyncState;
	readonly seq: number;
	readonly participants: RemoteParticipant[];
	readonly cursors: RemoteCursor[];
	/**
	 * Tell the sync which version the page is now showing. Notifications at or
	 * below it are already accounted for and are ignored.
	 */
	observe(version: number): void;
	/** Hold refetches — used while a drag is in flight (ADR 0014 Stage 1). */
	pause(): void;
	resume(): void;
	dispose(): void;
}

/**
 * Subscribes the board to its map's event stream and refetches when something
 * changes (ADR 0014 §5: notify-and-refetch, not diff broadcast).
 *
 * The reconnect logic leans on the browser first. An `EventSource` retries a
 * dropped connection by itself, sending `Last-Event-ID`, and the server's
 * `retry:` field tunes how fast — so the manual backoff here is only for the
 * case the browser gives up on, a connection that closes with an HTTP error.
 */
export function createMapSync(options: MapSyncOptions): MapSync {
	const {
		mapId,
		initialSeq,
		clientId,
		refetch,
		EventSourceCtor = EventSource,
		baseDelayMs = 1000,
		maxDelayMs = 30_000
	} = options;

	let state = $state<SyncState>('connecting');
	let seq = $state(initialSeq);
	let participants = $state<RemoteParticipant[]>([]);
	let cursors = $state<RemoteCursor[]>([]);

	let source: EventSource | null = null;
	let disposed = false;
	let paused = false;
	/** A change arrived while paused, or while a refetch was already running. */
	let pending = false;
	let refetching = false;
	let attempt = 0;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	/**
	 * At most one refetch in flight, with at most one queued behind it. Without
	 * the coalescing, a burst of remote edits would queue a full board reload per
	 * event and the board would lag behind by however long the backlog took.
	 */
	async function sync(): Promise<void> {
		if (paused || disposed) {
			pending = true;
			return;
		}
		if (refetching) {
			pending = true;
			return;
		}
		refetching = true;
		try {
			await refetch();
		} catch {
			// A refetch can fail for reasons that have nothing to do with the board
			// — a flaky network, a server restart. Swallowing it here keeps a
			// transient failure from becoming an unhandled rejection; the next
			// notification, or the reconnect that follows, brings the board up to
			// date.
		} finally {
			refetching = false;
			if (pending && !paused && !disposed) {
				pending = false;
				void sync();
			}
		}
	}

	function connect(): void {
		if (disposed) return;
		// `lastSeq` is only read on a first connection; a browser-driven reconnect
		// carries `Last-Event-ID`, which the server prefers.
		const url = `/maps/${mapId}/events?client=${encodeURIComponent(clientId)}&lastSeq=${seq}`;
		source = new EventSourceCtor(url);

		source.addEventListener('hello', () => {
			attempt = 0;
			state = 'connected';
		});

		source.addEventListener('change', (event) => {
			const data = JSON.parse((event as MessageEvent).data) as { seq: number };
			// The hub already skips the tab that caused a change, so this is not the
			// main defence against re-rendering twice for a local edit. It covers
			// what the skip cannot: a replayed change after a reconnect, and the
			// race where a notification lands before the page has told us the
			// version it is now showing.
			if (data.seq <= seq) return;
			seq = data.seq;
			void sync();
		});

		source.addEventListener('resync', (event) => {
			const data = JSON.parse((event as MessageEvent).data) as { seq: number };
			seq = Math.max(seq, data.seq);
			void sync();
		});

		source.addEventListener('presence', (event) => {
			const data = JSON.parse((event as MessageEvent).data) as {
				participants: RemoteParticipant[];
			};
			participants = data.participants;
			// Someone who has left cannot still have a pointer on the board — a
			// stale cursor from a closed tab would otherwise sit there forever.
			// Every tab counts, not just the first one a person opened: pruning
			// against one id per person removed a colleague's second-window cursor
			// every time anybody joined or left.
			// A plain array rather than a Set: this list is a handful of people,
			// and it is a throwaway local rather than reactive state.
			const present = data.participants.flatMap((p) => p.clientIds);
			cursors = cursors.filter((c) => present.includes(c.clientId));
		});

		source.addEventListener('cursor', (event) => {
			const data = JSON.parse((event as MessageEvent).data) as
				| { clientId: ClientId; userId: UserId; displayName: string; x: number; y: number }
				| { clientId: ClientId; x: null };
			cursors = cursors.filter((c) => c.clientId !== data.clientId);
			if (data.x !== null) cursors = [...cursors, data as RemoteCursor];
		});

		source.onerror = () => {
			if (disposed) return;
			state = 'reconnecting';
			// Always reconnect ourselves rather than deferring to the browser's own
			// retry. Leaving a stuck `EventSource` in CONNECTING to recover on its
			// own does not survive a real network drop — after the connection is
			// restored it can sit there indefinitely — and "did the browser give up
			// yet" is not a state worth reasoning about. Since the position travels
			// in the URL as well as in `Last-Event-ID`, a fresh connection resumes
			// from exactly where the old one stopped.
			scheduleReconnect();
		};
	}

	function scheduleReconnect(): void {
		if (reconnectTimer) return; // one attempt in flight at a time
		source?.close();
		source = null;
		attempt += 1;
		const backoff = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
		// Jitter, so a server restart does not bring every client back at once.
		const delay = backoff + Math.random() * 250;
		reconnectTimer = setTimeout(() => {
			reconnectTimer = null;
			connect();
		}, delay);
	}

	connect();

	return {
		get state() {
			return state;
		},
		get seq() {
			return seq;
		},
		get participants() {
			return participants;
		},
		get cursors() {
			return cursors;
		},
		observe(version: number) {
			if (version > seq) seq = version;
		},
		pause() {
			paused = true;
		},
		resume() {
			paused = false;
			if (pending) {
				pending = false;
				void sync();
			}
		},
		dispose() {
			disposed = true;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			source?.close();
			source = null;
		}
	};
}

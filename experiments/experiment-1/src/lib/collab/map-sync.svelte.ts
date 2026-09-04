export interface RemoteParticipant {
	userId: string;
	displayName: string;
	clientId: string;
}

export interface RemoteCursor {
	clientId: string;
	displayName: string;
	x: number;
	y: number;
}

export interface MapSyncOptions {
	mapId: string;
	/** The version `load()` gave the page — the client's starting position. */
	initialSeq: number;
	/** This tab. Not an identity; it only separates two tabs of one account. */
	clientId: string;
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
	/** Hold refetches — used while a drag is in flight (ADR 0015 Stage 1). */
	pause(): void;
	resume(): void;
	dispose(): void;
}

/**
 * Subscribes the board to its map's event stream and refetches when something
 * changes (ADR 0015 §5: notify-and-refetch, not diff broadcast).
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
			seq = Math.max(seq, data.seq);
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
			// A plain array rather than a Set: this list is a handful of people,
			// and it is a throwaway local rather than reactive state.
			const present = data.participants.map((p) => p.clientId);
			cursors = cursors.filter((c) => present.includes(c.clientId));
		});

		source.addEventListener('cursor', (event) => {
			const data = JSON.parse((event as MessageEvent).data) as
				| { clientId: string; displayName: string; x: number; y: number }
				| { clientId: string; x: null };
			cursors = cursors.filter((c) => c.clientId !== data.clientId);
			if (data.x !== null) cursors = [...cursors, data as RemoteCursor];
		});

		source.onerror = () => {
			if (disposed) return;
			// readyState CONNECTING means the browser is already retrying by itself,
			// which handles the ordinary transient drop. Only a CLOSED source needs
			// us to do anything.
			if (source && source.readyState !== 2) {
				state = 'reconnecting';
				return;
			}
			state = 'reconnecting';
			scheduleReconnect();
		};
	}

	function scheduleReconnect(): void {
		source?.close();
		source = null;
		attempt += 1;
		const backoff = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
		// Jitter, so a server restart does not bring every client back at once.
		const delay = backoff + Math.random() * 250;
		reconnectTimer = setTimeout(connect, delay);
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

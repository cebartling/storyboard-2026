import type { MapHub, Participant, HubEvent } from './map-hub';

/**
 * Server-sent events for one map's stream (ADR 0015 §4).
 *
 * SSE rather than a WebSocket because `@sveltejs/adapter-node` has no upgrade
 * seam — supporting sockets would mean replacing the adapter's entry point and
 * wiring dev and built output separately. The direction split matches the
 * model anyway: the server pushes notifications, the client posts intent.
 */

/** Under the 30s idle timeout intermediaries commonly apply to a quiet stream. */
export const HEARTBEAT_MS = 25_000;

/** Every stream currently open in this process, so shutdown can end them. */
const openStreams = new Set<() => void>();

function frame(event: string, data: unknown, id?: number): string {
	const idLine = id === undefined ? '' : `id: ${id}\n`;
	return `${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * `Last-Event-ID` wins over the query parameter. The browser sets the header
 * automatically on a reconnect, and it is the more recent of the two — the
 * query parameter is the version the page was rendered with, which is only
 * right for the very first connection.
 */
export function parseLastSeq(header: string | null, query: string | null): number | null {
	for (const raw of [header, query]) {
		if (raw === null || raw === '') continue;
		const value = Number(raw);
		if (Number.isInteger(value) && value >= 0) return value;
	}
	return null;
}

export interface EventStreamOptions {
	heartbeatMs?: number;
}

export function createEventStream(
	hub: MapHub,
	viewer: Participant,
	lastSeq: number | null,
	options: EventStreamOptions = {}
): Response {
	const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
	const encoder = new TextEncoder();

	let unsubscribe: (() => void) | null = null;
	let heartbeat: ReturnType<typeof setInterval> | null = null;
	let close: (() => void) | null = null;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let closed = false;
			const write = (chunk: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					// The consumer went away between our check and the enqueue. Nothing
					// to do but stop writing; `cancel` will clean the rest up.
					closed = true;
				}
			};

			close = () => {
				if (closed) return;
				closed = true;
				unsubscribe?.();
				if (heartbeat) clearInterval(heartbeat);
				openStreams.delete(close!);
				try {
					controller.close();
				} catch {
					// Already closed by the runtime.
				}
			};
			openStreams.add(close);

			// `retry` tunes the browser's own reconnect delay, which handles the
			// ordinary transient drop without any code of ours running.
			write(`retry: 1000\n\n`);
			write(frame('hello', { seq: hub.seq, clientId: viewer.clientId }));

			unsubscribe = hub.subscribe(
				{
					...viewer,
					send(event: HubEvent) {
						// Only `change` carries an id, so the browser's automatic
						// `Last-Event-ID` on reconnect is exactly the last change seen —
						// presence and cursors are ephemeral and must not rewind it.
						write(
							event.type === 'change' ? frame('change', event, event.seq) : frame(event.type, event)
						);
					}
				},
				lastSeq
			);

			heartbeat = setInterval(() => write(`: ping\n\n`), heartbeatMs);
		},

		cancel() {
			// The client disconnected. Without this the subscription and the interval
			// would outlive the request, and the hub would never empty.
			close?.();
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			// Nginx and friends buffer proxied responses by default, which turns a
			// live stream into one that delivers nothing until it ends.
			'x-accel-buffering': 'no'
		}
	});
}

/**
 * Ends every open stream.
 *
 * ADR 0015 §4 says to do this on `sveltekit:shutdown`, which cannot work:
 * adapter-node emits that event inside `httpServer.close()`'s callback, and
 * Node runs that callback only once every connection has ended — an open SSE
 * stream is a live connection, so the event would arrive at the force-kill
 * deadline it was meant to avoid. The signal handler in `shutdown.ts` is what
 * actually runs.
 */
export function closeAllStreams(): void {
	for (const close of [...openStreams]) close();
}

export function openStreamCount(): number {
	return openStreams.size;
}

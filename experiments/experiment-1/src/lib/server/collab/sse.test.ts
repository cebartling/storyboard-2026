import { afterEach, describe, expect, it } from 'vitest';
import type { UserId } from '$lib/domain/ids';
import { MapHub, type Participant } from './map-hub';
import { closeAllStreams, createEventStream, openStreamCount, parseLastSeq } from './sse';

const viewer: Participant = {
	userId: 'alice' as UserId,
	displayName: 'Alice',
	clientId: 'tab-1'
};

/** Reads whatever the stream has produced so far without waiting for it to end
 *  — an event stream never ends on its own. */
async function drain(response: Response): Promise<string> {
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	let text = '';
	// One read per already-enqueued chunk; `read()` resolves immediately while
	// the internal queue is non-empty.
	for (;;) {
		const next = await Promise.race([
			reader.read(),
			new Promise<null>((resolve) => setTimeout(() => resolve(null), 0))
		]);
		if (!next || next.done) break;
		text += decoder.decode(next.value);
	}
	reader.releaseLock();
	return text;
}

describe('createEventStream', () => {
	afterEach(() => {
		closeAllStreams();
	});

	it('announces itself with the hub sequence and a reconnect delay', async () => {
		const hub = new MapHub();
		hub.observe(5);

		const text = await drain(createEventStream(hub, viewer, null));

		expect(text).toContain('retry: 1000');
		expect(text).toContain('event: hello');
		expect(text).toContain('"seq":5');
	});

	it('declares the headers a proxy needs to leave the stream alone', () => {
		const response = createEventStream(new MapHub(), viewer, null);

		expect(response.headers.get('content-type')).toBe('text/event-stream');
		expect(response.headers.get('cache-control')).toContain('no-transform');
		// Without this, nginx buffers the response and nothing arrives until it ends.
		expect(response.headers.get('x-accel-buffering')).toBe('no');
	});

	it('gives a change an id, so the browser reconnects with the right Last-Event-ID', async () => {
		const hub = new MapHub();
		const response = createEventStream(hub, viewer, null);
		await drain(response);

		hub.publishChange(7);

		expect(await drain(response)).toContain('id: 7\nevent: change');
	});

	it('does not put an id on presence or cursors, which must not rewind the client', async () => {
		const hub = new MapHub();
		const response = createEventStream(hub, viewer, null);
		hub.publishCursor(
			{ userId: 'bob' as UserId, displayName: 'Bob', clientId: 'other' },
			{ x: 1, y: 2 }
		);

		const text = await drain(response);

		expect(text).toContain('event: cursor');
		const cursorFrame = text.slice(text.indexOf('event: cursor'));
		expect(cursorFrame).not.toContain('id:');
	});

	it('sends a heartbeat comment, so an idle stream is not dropped', async () => {
		// A real timer with a tiny interval rather than fake ones: `drain` waits on
		// a timer itself, so freezing the clock would deadlock the read.
		const response = createEventStream(new MapHub(), viewer, null, { heartbeatMs: 5 });
		await drain(response);

		await new Promise((resolve) => setTimeout(resolve, 30));

		expect(await drain(response)).toContain(': ping');
	});

	it('unsubscribes from the hub when the client disconnects', async () => {
		const hub = new MapHub();
		const response = createEventStream(hub, viewer, null);
		expect(hub.subscriberCount).toBe(1);

		await response.body!.cancel();

		// Without this the subscription and its heartbeat outlive the request, and
		// the hub never empties.
		expect(hub.subscriberCount).toBe(0);
	});

	it('closeAllStreams ends every open stream', async () => {
		const hub = new MapHub();
		createEventStream(hub, viewer, null);
		createEventStream(hub, { ...viewer, clientId: 'tab-2' }, null);
		expect(openStreamCount()).toBe(2);

		closeAllStreams();

		expect(openStreamCount()).toBe(0);
		expect(hub.subscriberCount).toBe(0);
	});
});

describe('parseLastSeq', () => {
	it('prefers Last-Event-ID over the query parameter', () => {
		// The header is what the browser sets on a reconnect and is the more recent
		// of the two; the query parameter is only right for a first connection.
		expect(parseLastSeq('9', '3')).toBe(9);
	});

	it('falls back to the query parameter on a first connection', () => {
		expect(parseLastSeq(null, '3')).toBe(3);
	});

	it.each([
		[null, null],
		['', ''],
		['abc', null],
		['-1', null],
		['1.5', null]
	])('reads (%p, %p) as "no position"', (header, query) => {
		expect(parseLastSeq(header, query)).toBeNull();
	});

	it('ignores a malformed header in favour of a usable query parameter', () => {
		expect(parseLastSeq('abc', '4')).toBe(4);
	});
});

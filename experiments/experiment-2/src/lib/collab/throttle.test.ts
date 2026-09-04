import { describe, expect, it, vi } from 'vitest';
import { trailingThrottle } from './throttle';

describe('trailingThrottle', () => {
	it('sends at most one call per interval', async () => {
		const sent: number[] = [];
		const send = trailingThrottle<number>((n) => sent.push(n), 20);

		for (const n of [1, 2, 3, 4, 5]) send(n);

		await vi.waitFor(() => expect(sent).toHaveLength(1));
		expect(sent).toEqual([5]);
	});

	it('always delivers the last value, which for a cursor is the one that matters', async () => {
		// A leading-only throttle drops exactly the position the pointer stopped
		// at, leaving everyone else's view of the cursor somewhere it no longer is.
		const sent: number[] = [];
		const send = trailingThrottle<number>((n) => sent.push(n), 10);

		send(1);
		await vi.waitFor(() => expect(sent).toEqual([1]));
		send(2);
		send(3);

		await vi.waitFor(() => expect(sent).toEqual([1, 3]));
	});

	it('stops delivering once cancelled', async () => {
		const sent: number[] = [];
		const send = trailingThrottle<number>((n) => sent.push(n), 10);

		send(1);
		send.cancel();

		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(sent).toEqual([]);
	});
});

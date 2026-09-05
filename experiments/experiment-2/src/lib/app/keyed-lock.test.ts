import { describe, expect, it } from 'vitest';
import { KeyedLock } from './keyed-lock';

/** A promise plus its resolver, so tests can control ordering without timers. */
function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

describe('KeyedLock', () => {
	it('runs work for the same key one at a time, in call order', async () => {
		const lock = new KeyedLock<string>();
		const first = deferred();
		const events: string[] = [];

		const a = lock.run('map', async () => {
			events.push('a:start');
			await first.promise;
			events.push('a:end');
		});
		const b = lock.run('map', async () => {
			events.push('b:start');
		});

		// `b` must not have started while `a` holds the key.
		await Promise.resolve();
		expect(events).toEqual(['a:start']);

		first.resolve();
		await Promise.all([a, b]);
		expect(events).toEqual(['a:start', 'a:end', 'b:start']);
	});

	it('runs work for different keys concurrently', async () => {
		const lock = new KeyedLock<string>();
		const blocked = deferred();
		const events: string[] = [];

		const a = lock.run('one', async () => {
			events.push('one:start');
			await blocked.promise;
		});
		const b = lock.run('two', async () => {
			events.push('two:start');
		});

		await b;
		// `two` finished while `one` is still holding its own key.
		expect(events).toEqual(['one:start', 'two:start']);

		blocked.resolve();
		await a;
	});

	it('releases the key when work throws, so the next caller still runs', async () => {
		const lock = new KeyedLock<string>();

		const failed = lock.run('map', async () => {
			throw new Error('boom');
		});
		const after = lock.run('map', async () => 'ran anyway');

		await expect(failed).rejects.toThrow('boom');
		await expect(after).resolves.toBe('ran anyway');
	});

	it('returns what the work returns', async () => {
		const lock = new KeyedLock<string>();

		await expect(lock.run('map', async () => 42)).resolves.toBe(42);
	});

	it('forgets a key once its last caller finishes, so the map cannot grow without bound', async () => {
		const lock = new KeyedLock<string>();

		await lock.run('a', async () => undefined);
		await lock.run('b', async () => undefined);
		expect(lock.held).toBe(0);

		// Still zero after a failure — a rejected body must not leak its key.
		await expect(
			lock.run('c', async () => {
				throw new Error('boom');
			})
		).rejects.toThrow('boom');
		expect(lock.held).toBe(0);
	});

	it('keeps the key while callers are still queued behind it', async () => {
		const lock = new KeyedLock<string>();
		const blocked = deferred();

		const a = lock.run('map', () => blocked.promise);
		const b = lock.run('map', async () => undefined);

		expect(lock.held).toBe(1);

		blocked.resolve();
		await Promise.all([a, b]);
		expect(lock.held).toBe(0);
	});
});

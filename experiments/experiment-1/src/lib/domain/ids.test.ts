import { describe, expect, it } from 'vitest';
import { newId, type MapId } from './ids';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('newId', () => {
	it('generates a well-formed UUID', () => {
		const id = newId<MapId>();
		expect(id).toMatch(UUID_RE);
	});

	it('sets the UUIDv7 version nibble', () => {
		const id = newId<MapId>();
		expect(id[14]).toBe('7');
	});

	it('sets the RFC 9562 variant bits', () => {
		const id = newId<MapId>();
		expect(['8', '9', 'a', 'b']).toContain(id[19]);
	});

	it('generates unique ids', () => {
		const ids = new Set(Array.from({ length: 1000 }, () => newId<MapId>()));
		expect(ids.size).toBe(1000);
	});

	it('is time-ordered: ids generated later sort later', async () => {
		const first = newId<MapId>();
		await new Promise((resolve) => setTimeout(resolve, 5));
		const second = newId<MapId>();
		expect(first < second).toBe(true);
	});
});

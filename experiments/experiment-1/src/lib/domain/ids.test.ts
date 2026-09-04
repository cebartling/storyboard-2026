import { describe, expect, it } from 'vitest';
import { newId, type ClientId, type MapId, type UserId } from './ids';

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

	// The 5ms sleep is the guarantee, not an accident of timing: ordering holds
	// across milliseconds, and there is no sub-millisecond counter, so two ids
	// minted in the same tick are ordered randomly. Naming that here stops the
	// sleep from looking like flakiness someone should tidy away.
	it('is time-ordered across milliseconds: ids generated later sort later', async () => {
		const first = newId<MapId>();
		await new Promise((resolve) => setTimeout(resolve, 5));
		const second = newId<MapId>();
		expect(first < second).toBe(true);
	});
});

describe('UserId', () => {
	it('is a distinct brand, so an entity id cannot stand in for a caller', () => {
		const userId = newId<UserId>();
		const mapId = newId<MapId>();

		// @ts-expect-error a MapId is not a UserId, even though both are strings
		const wrong: UserId = mapId;
		expect(typeof wrong).toBe('string');
		expect(userId).not.toBe(mapId);
	});
});

describe('ClientId', () => {
	it('cannot be passed where an identity is expected, or the reverse', () => {
		// ADR 0015 §6 requires that presence identity never becomes authentication
		// identity, and ADR 0016 §6 claims the type checker enforces it in both
		// directions. This is that claim, written down where it can fail.
		const clientId = newId<ClientId>();
		const userId = newId<UserId>();

		// @ts-expect-error which tab this is does not say who is using it
		const asUser: UserId = clientId;
		// @ts-expect-error and who someone is does not identify one of their tabs
		const asClient: ClientId = userId;

		expect(typeof asUser).toBe('string');
		expect(typeof asClient).toBe('string');
	});
});

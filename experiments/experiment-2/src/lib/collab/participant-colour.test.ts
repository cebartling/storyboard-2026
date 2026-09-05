import { describe, expect, it } from 'vitest';
import { initials, participantColour } from './participant-colour';

describe('participantColour', () => {
	it('gives the same person the same colour every time', () => {
		// The whole point: one person is one colour on every screen, so "the blue
		// cursor" means something when said out loud.
		//
		// Note this covers determinism only. "Does not depend on join order" is
		// not testable here — a pure function of an id cannot — and the place it
		// could actually break is the components, which the specs for
		// `PresenceList` and `RemoteCursors` check by asserting the colour comes
		// from the user id rather than from a position in the array.
		expect(participantColour('user-7')).toEqual(participantColour('user-7'));
	});

	it('spreads people across the palette rather than clustering', () => {
		const ids = Array.from({ length: 40 }, (_, i) => `user-${i}`);
		const used = new Set(ids.map((id) => participantColour(id).bg));

		// Not a uniformity proof — just that the hash is not degenerate. Eight
		// colours for forty people obviously collide; that is why the name, not
		// the colour, is what identifies someone.
		expect(used.size).toBeGreaterThan(4);
	});

	it('returns matching classes for the three places a colour is used', () => {
		const colour = participantColour('user-7');

		// The avatar fills, the cursor icon strokes, and both must read as the
		// same colour — they are the same person.
		expect(colour.bg).toMatch(/^bg-/);
		expect(colour.text).toMatch(/^text-/);
		expect(colour.bg.replace('bg-', '')).toBe(colour.text.replace('text-', ''));
	});
});

describe('initials', () => {
	it.each([
		['Ada Lovelace', 'AL'],
		['Bob Lindqvist', 'BL'],
		// First and last, not first two: "Ada Byron King" is AK, the name people
		// would actually shorten it to.
		['Ada Byron King', 'AK'],
		['Prince', 'PR'],
		['jo', 'JO'],
		['  Ada   Lovelace  ', 'AL']
	])('reads %p as %p', (name, expected) => {
		expect(initials(name)).toBe(expected);
	});

	it.each(['', '   ', '\t\n'])('falls back rather than throwing on %p', (name) => {
		// Display names are required at registration, so this should be
		// unreachable — but an avatar is the wrong place to discover otherwise.
		expect(initials(name)).toBe('?');
	});
});

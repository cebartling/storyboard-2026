import { describe, expect, it } from 'vitest';
import { rankAtEnd, rankBetween } from './rank';

describe('rankBetween', () => {
	// `toBeTypeOf('string')` passed for any implementation that did not throw.
	// What matters about the first rank is that both directions stay open: the
	// scheme has to be able to insert before and after it forever.
	it('generates a rank at the start of an empty scope that can still be extended both ways', () => {
		const first = rankBetween(null, null);

		expect(first).not.toBe('');
		expect(rankBetween(null, first) < first).toBe(true);
		expect(rankBetween(first, null) > first).toBe(true);
	});

	it('generates a rank before the first existing rank', () => {
		const first = rankBetween(null, null);
		const before = rankBetween(null, first);
		expect(before < first).toBe(true);
	});

	it('generates a rank after the last existing rank', () => {
		const first = rankBetween(null, null);
		const after = rankBetween(first, null);
		expect(after > first).toBe(true);
	});

	it('generates a rank strictly between two neighbours', () => {
		const a = rankBetween(null, null);
		const c = rankBetween(a, null);
		const b = rankBetween(a, c);
		expect(a < b).toBe(true);
		expect(b < c).toBe(true);
	});

	it('matches the worked example in domain-model.md (a0 / a1 -> between)', () => {
		const between = rankBetween('a0', 'a1');
		expect(between > 'a0').toBe(true);
		expect(between < 'a1').toBe(true);
	});

	it('throws when prev and next are equal', () => {
		expect(() => rankBetween('a0', 'a0')).toThrow();
	});

	it('throws when prev and next are out of order', () => {
		expect(() => rankBetween('a1', 'a0')).toThrow();
	});
});

describe('rankAtEnd', () => {
	it('returns a rank after every rank in a non-empty list', () => {
		const ranks = ['a0', 'a1', 'a2'];
		const end = rankAtEnd(ranks);
		expect(ranks.every((r) => end > r)).toBe(true);
	});

	it('returns a rank for an empty list that behaves like a first rank', () => {
		const only = rankAtEnd([]);

		expect(only).toBe(rankBetween(null, null));
		expect(rankAtEnd([only]) > only).toBe(true);
	});

	// The whole scheme rests on lexicographic comparison, and keys are not
	// fixed width — `rankAtEnd` reduces over an unsorted list, so a naive
	// "last element" or a length-sensitive comparison would pass the sorted
	// cases above and fail here.
	it('sorts after the true maximum of shuffled, mixed-length keys', () => {
		// Deliberately not sorted, and the maximum ('a1') is not last: a naive
		// "take the last element" reduces to 'Zz' and would return a rank below
		// half the list.
		const ranks = ['a0', 'a1', 'a0V', 'Zz'];

		const end = rankAtEnd(ranks);

		expect(ranks.every((r) => end > r)).toBe(true);
	});
});

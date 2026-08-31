import { describe, expect, it } from 'vitest';
import { rankAtEnd, rankBetween } from './rank';

describe('rankBetween', () => {
	it('generates a rank at the start of an empty scope', () => {
		expect(rankBetween(null, null)).toBeTypeOf('string');
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

	it('returns a rank for an empty list', () => {
		expect(rankAtEnd([])).toBeTypeOf('string');
	});
});

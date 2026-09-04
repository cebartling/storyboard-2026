import { describe, expect, it } from 'vitest';
import { InvariantError } from '$lib/domain/errors';
import { optionalNeighbour, requireString, requireVersion } from './form-fields';

describe('requireString', () => {
	it('returns the trimmed value', () => {
		expect(requireString('  Browse  ', 'Name')).toBe('Browse');
	});

	it.each([null, '', '   '])('rejects %p with a named InvariantError', (value) => {
		expect(() => requireString(value, 'Name')).toThrow(/Name is required/);
	});
});

describe('optionalNeighbour', () => {
	it('reads an id as itself', () => {
		expect(optionalNeighbour('story-1')).toBe('story-1');
	});

	it.each([null, ''])('reads %p as "no neighbour on this side"', (value) => {
		expect(optionalNeighbour(value)).toBeNull();
	});
});

describe('requireVersion', () => {
	it('accepts a non-negative integer', () => {
		expect(requireVersion('7')).toBe(7);
	});

	it('accepts version 0, which a freshly created map really has', () => {
		expect(requireVersion('0')).toBe(0);
	});

	it.each([null, '', 'abc', '1.5', '-1', 'NaN', 'Infinity'])(
		'rejects %p rather than guessing a version',
		(value) => {
			expect(() => requireVersion(value)).toThrow(InvariantError);
		}
	);
});

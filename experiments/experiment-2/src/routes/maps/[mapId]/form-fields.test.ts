import { describe, expect, it } from 'vitest';
import { InvariantError } from '$lib/domain/errors';
import { STORY_STATUSES } from '$lib/domain/story-map';
import {
	optionalNeighbour,
	requireDirection,
	requireStatus,
	requireString,
	requireVersion
} from './form-fields';

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

describe('requireDirection', () => {
	it.each(['blocks', 'blockedBy'] as const)('accepts %s', (value) => {
		expect(requireDirection(value)).toBe(value);
	});

	// Anything else is a malformed request. Defaulting would silently record the
	// opposite of what was asked for, which is worse than a 400.
	it.each([
		['an unknown value', 'sideways'],
		['the empty string', ''],
		['nothing at all', null]
	])('rejects %s', (_label, value) => {
		expect(() => requireDirection(value)).toThrow(InvariantError);
	});
});

describe('requireStatus', () => {
	it.each(STORY_STATUSES)('accepts %s', (value) => {
		expect(requireStatus(value)).toBe(value);
	});

	// Same rule as `requireDirection`: the set is closed, so an unrecognised
	// value is a malformed request. Defaulting it would quietly move the story
	// to `todo`, undoing whatever status it actually had.
	it.each([
		['a label rather than a value', 'In progress'],
		['an unknown status', 'shipped'],
		['the empty string', ''],
		['nothing at all', null]
	])('rejects %s', (_label, value) => {
		expect(() => requireStatus(value)).toThrow(InvariantError);
	});
});

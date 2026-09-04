import { describe, expect, it } from 'vitest';
import { parseCursorBody } from './cursor-body';

describe('parseCursorBody', () => {
	it('accepts a position', () => {
		expect(parseCursorBody({ clientId: 'tab-1', x: 12.5, y: -3 })).toEqual({
			clientId: 'tab-1',
			cursor: { x: 12.5, y: -3 }
		});
	});

	it('accepts a null x as "my pointer left the board"', () => {
		// A real message, not an absent one: it is what clears the cursor for
		// everyone else.
		expect(parseCursorBody({ clientId: 'tab-1', x: null })).toEqual({
			clientId: 'tab-1',
			cursor: null
		});
	});

	it.each([
		null,
		'not an object',
		{},
		{ x: 1, y: 2 },
		{ clientId: '', x: 1, y: 2 },
		{ clientId: 'tab-1' },
		{ clientId: 'tab-1', x: 1 },
		{ clientId: 'tab-1', x: '1', y: '2' },
		{ clientId: 'tab-1', x: Number.NaN, y: 2 },
		{ clientId: 'tab-1', x: Number.POSITIVE_INFINITY, y: 2 }
	])('rejects %p rather than publishing it', (body) => {
		// A NaN here becomes an element every viewer tries to position at NaN.
		expect(parseCursorBody(body)).toBeUndefined();
	});
});

import { describe, expect, it } from 'vitest';
import type { GlossaryEntryId } from '$lib/domain/ids';
import type { GlossaryEntry } from '$lib/domain/story-map';
import { filterEntries, sortByTerm } from './glossary-list';

function entry(term: string, definition = `Definition of ${term}`): GlossaryEntry {
	return { id: `id-${term}` as GlossaryEntryId, term, definition };
}

describe('sortByTerm', () => {
	it('sorts by term ignoring case and accents', () => {
		const sorted = sortByTerm([entry('SKU'), entry('Éclair'), entry('basket'), entry('Apple')]);

		expect(sorted.map((e) => e.term)).toEqual(['Apple', 'basket', 'Éclair', 'SKU']);
	});

	it('does not reorder its input', () => {
		const input = [entry('SKU'), entry('Apple')];

		sortByTerm(input);

		expect(input.map((e) => e.term)).toEqual(['SKU', 'Apple']);
	});
});

describe('filterEntries', () => {
	const entries = [
		entry('SKU', 'Stock keeping unit'),
		entry('Basket', 'Items a shopper has chosen but not bought')
	];

	it('keeps everything for a blank query', () => {
		expect(filterEntries(entries, '   ')).toEqual(entries);
	});

	it('matches the term, ignoring case and surrounding space', () => {
		expect(filterEntries(entries, ' sKu ').map((e) => e.term)).toEqual(['SKU']);
	});

	it('matches the definition', () => {
		expect(filterEntries(entries, 'SHOPPER').map((e) => e.term)).toEqual(['Basket']);
	});

	it('returns nothing when nothing matches', () => {
		expect(filterEntries(entries, 'refund')).toEqual([]);
	});
});

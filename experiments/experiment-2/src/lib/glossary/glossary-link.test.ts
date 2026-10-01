import { describe, expect, it } from 'vitest';
import { newId, type GlossaryEntryId } from '$lib/domain/ids';
import {
	glossaryLinkMarkdown,
	isGlossaryEntryId,
	linkableSelection,
	parseGlossaryHref
} from './glossary-link';

describe('parseGlossaryHref', () => {
	const id = newId<GlossaryEntryId>();

	it('returns the id of a glossary link', () => {
		expect(parseGlossaryHref(`glossary:${id}`)).toBe(id);
	});

	it('ignores the case of the scheme', () => {
		expect(parseGlossaryHref(`Glossary:${id}`)).toBe(id);
	});

	it('returns null for any other link', () => {
		expect(parseGlossaryHref('https://example.com')).toBeNull();
		expect(parseGlossaryHref('mailto:a@b.test')).toBeNull();
	});

	it.each([
		['an empty id', 'glossary:'],
		['a non-UUID', 'glossary:sku'],
		['a UUIDv4', 'glossary:0f8fad5b-d9cb-469f-a165-70867728950e'],
		['an id with trailing markup', `glossary:${'0'.repeat(8)}-0000-7000-8000-000000000000"><b>`],
		['an upper-case id', `glossary:${id.toUpperCase()}`]
	])('reports %s as invalid', (_label, href) => {
		expect(parseGlossaryHref(href)).toBe('invalid');
	});
});

describe('isGlossaryEntryId', () => {
	it('accepts what the domain mints', () => {
		expect(isGlossaryEntryId(newId<GlossaryEntryId>())).toBe(true);
	});
});

describe('linkableSelection', () => {
	it('returns the selected words and their range', () => {
		expect(linkableSelection('Find a SKU here', 7, 10)).toEqual({ start: 7, end: 10, text: 'SKU' });
	});

	// Double-clicking a word selects its trailing space in some browsers.
	it('trims surrounding whitespace off the range', () => {
		expect(linkableSelection('Find a SKU here', 6, 11)).toEqual({ start: 7, end: 10, text: 'SKU' });
	});

	it('refuses an empty or blank selection', () => {
		expect(linkableSelection('Find a SKU', 4, 4)).toBeNull();
		expect(linkableSelection('Find   a', 4, 7)).toBeNull();
	});

	it('refuses a selection that crosses a line break', () => {
		expect(linkableSelection('stock\nunit', 0, 10)).toBeNull();
	});
});

describe('glossaryLinkMarkdown', () => {
	const id = newId<GlossaryEntryId>();

	it('builds a glossary link the parser reads back', () => {
		const markdown = glossaryLinkMarkdown('stock unit', id);

		expect(markdown).toBe(`[stock unit](glossary:${id})`);
		expect(parseGlossaryHref(markdown.slice(markdown.indexOf('(') + 1, -1))).toBe(id);
	});

	it('escapes brackets and backslashes in the words', () => {
		expect(glossaryLinkMarkdown('a [b] \\c', id)).toBe(`[a \\[b\\] \\\\c](glossary:${id})`);
	});
});

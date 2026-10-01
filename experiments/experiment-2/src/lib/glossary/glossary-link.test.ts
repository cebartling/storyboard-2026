import { describe, expect, it } from 'vitest';
import { newId, type GlossaryEntryId } from '$lib/domain/ids';
import { isGlossaryEntryId, parseGlossaryHref } from './glossary-link';

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

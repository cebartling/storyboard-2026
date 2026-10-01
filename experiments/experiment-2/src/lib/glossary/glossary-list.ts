import type { GlossaryEntry } from '$lib/domain/story-map';

/**
 * The glossary page's ordering and filter (ADR 0025). Pure and DOM-free, like
 * `src/lib/board/`, so it is tested without a page.
 *
 * Entries carry no rank — a glossary is read alphabetically — so the order is
 * computed here rather than stored.
 */

/** By term, ignoring case and accents, so "apple", "Basket" and "Éclair" sort
 *  the way a reader expects rather than by code point. */
export function sortByTerm(entries: readonly GlossaryEntry[]): GlossaryEntry[] {
	return [...entries].sort((a, b) =>
		a.term.localeCompare(b.term, undefined, { sensitivity: 'base' })
	);
}

/**
 * The entries whose term or definition contains `query`, ignoring case.
 *
 * Matches definitions too: someone looking for "the thing a shopper fills" has
 * the meaning in mind, not the word. A blank query keeps everything.
 */
export function filterEntries(entries: readonly GlossaryEntry[], query: string): GlossaryEntry[] {
	const needle = query.trim().toLowerCase();
	if (needle === '') return [...entries];
	return entries.filter(
		(e) => e.term.toLowerCase().includes(needle) || e.definition.toLowerCase().includes(needle)
	);
}

import type { GlossaryEntryId } from '$lib/domain/ids';

/**
 * A description links a phrase to a glossary entry with an ordinary Markdown
 * link whose target is `glossary:<entryId>` (ADR 0025).
 *
 * The id has to be a UUIDv7 exactly, because it ends up as an attribute value
 * inside ADR 0018's `{@html}` sink. Anything looser — "starts with glossary:",
 * "no quotes in it" — is a parser the author gets to probe. A strict shape is
 * one the sanitiser can check twice, once in the renderer and once in its hook.
 */
const ENTRY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const SCHEME = 'glossary:';

/** Whether `value` has the shape of an entry id, and so is safe to emit. */
export function isGlossaryEntryId(value: string): value is GlossaryEntryId {
	return ENTRY_ID.test(value);
}

/**
 * What a link target means: not a glossary link at all (`null`), a glossary
 * link whose id is malformed (`'invalid'`), or the id it names.
 *
 * Three answers rather than two because the renderer treats them differently.
 * An ordinary link keeps today's handling; a malformed glossary link is not an
 * ordinary link to send through the URI policy — it renders as its words.
 */
export function parseGlossaryHref(href: string): GlossaryEntryId | 'invalid' | null {
	if (!href.toLowerCase().startsWith(SCHEME)) return null;
	const id = href.slice(SCHEME.length);
	return isGlossaryEntryId(id) ? id : 'invalid';
}

/** A stretch of a description chosen to become a glossary link. */
export interface LinkableSelection {
	start: number;
	end: number;
	text: string;
}

/**
 * What of a textarea selection can be linked, or `null` when nothing can.
 *
 * Surrounding whitespace is trimmed off the range rather than kept inside the
 * link: double-clicking a word selects its trailing space in some browsers,
 * and `[SKU ](glossary:…)` underlines a space. A selection that crosses a line
 * break is refused, because Markdown link text cannot span one reliably — a
 * blank line ends it outright, and the result would not be a link at all.
 */
export function linkableSelection(
	value: string,
	start: number,
	end: number
): LinkableSelection | null {
	const raw = value.slice(start, end);
	const leading = raw.length - raw.trimStart().length;
	const text = raw.trim();
	if (text === '' || text.includes('\n')) return null;
	return { start: start + leading, end: start + leading + text.length, text };
}

/**
 * The Markdown for `words` linked to an entry (ADR 0025).
 *
 * Brackets and backslashes are escaped, so selected text that happens to look
 * like Markdown link syntax stays the reader's words instead of closing the
 * link early or opening a second one inside it.
 */
export function glossaryLinkMarkdown(words: string, id: GlossaryEntryId): string {
	const escaped = words.replace(/[\\[\]]/g, (c) => `\\${c}`);
	return `[${escaped}](${SCHEME}${id})`;
}

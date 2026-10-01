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

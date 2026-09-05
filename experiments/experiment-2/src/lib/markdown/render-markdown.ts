// ---------------------------------------------------------------------------
// Markdown rendering for story descriptions (ADR 0018).
//
// Presentation for one route, not a domain invariant, so this sits outside
// `src/lib/domain/` and keeps ADR 0006's pure core free of it. `Story.description`
// stays raw text everywhere else — in the aggregate, in Mongo, and in the
// textarea that edits it. Markdown exists only at the moment it is read.
//
// **This runs in the browser only.** `+page.svelte` starts with `dialog = null`,
// so no dialog branch renders during SSR and DOMPurify is never asked for a
// `window` it does not have. Rendering a description anywhere server-side would
// break that assumption and need a DOM shim.
// ---------------------------------------------------------------------------

import DOMPurify from 'dompurify';
import { marked } from 'marked';

/**
 * What a description is allowed to become. An explicit allowlist rather than
 * DOMPurify's default profile: the default is a general-purpose "safe HTML"
 * set, while this is the much smaller set of things Markdown can emit that a
 * story description has any use for. Anything outside it is a surprise, and a
 * surprise in a `{@html}` sink is exactly what we do not want.
 */
const ALLOWED_TAGS = [
	'p',
	'br',
	'hr',
	'strong',
	'em',
	'del',
	'code',
	'pre',
	'blockquote',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'ul',
	'ol',
	'li',
	'a'
];

/** No `style`, no `on*`, no `id`: a description cannot reach outside its own box. */
const ALLOWED_ATTR = ['href', 'title', 'target', 'rel'];

// A description is written by one account and read by another (ADR 0015), so
// an outbound link must not hand the opener a `window` reference back to the
// board. Applied after sanitisation, so it only ever lands on an anchor whose
// href already survived the URI policy.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
	if (node.tagName === 'A' && node.hasAttribute('href')) {
		node.setAttribute('target', '_blank');
		node.setAttribute('rel', 'noopener noreferrer');
	}
});

/**
 * Render a story description as sanitised HTML, ready for `{@html}`.
 *
 * `null` and blank both collapse to `''` so the caller has one branch rather
 * than three — "no description" and "a description of spaces" should read the
 * same on the board.
 */
export function renderMarkdown(source: string | null): string {
	if (source === null || source.trim() === '') return '';

	// `async: false` pins the return type to `string`; `marked.parse` is
	// otherwise `string | Promise<string>` and would infect every caller.
	// `breaks` because this is typed into a textarea, where a single newline is
	// meant as a line break rather than as paragraph continuation.
	const html = marked.parse(source, { async: false, gfm: true, breaks: true });

	return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}

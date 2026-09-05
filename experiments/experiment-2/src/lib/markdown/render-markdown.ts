// ---------------------------------------------------------------------------
// Markdown rendering for story descriptions (ADR 0018).
//
// Presentation for one route, not a domain invariant, so this sits outside
// `src/lib/domain/` and keeps ADR 0006's pure core free of it. `Story.description`
// stays raw text everywhere else — in the aggregate, in Mongo, and in the
// textarea that edits it. Markdown exists only at the moment it is read.
//
// **This renders in the browser only**, and — the part that is easy to get
// wrong — it must also do *nothing* at import time. SvelteKit imports the whole
// module graph to server-render a route, so this file is loaded on the server
// even though `+page.svelte` starts with `dialog = null` and no dialog branch
// ever renders there. In Node, `dompurify`'s default export is the factory
// rather than a bound instance: `isSupported` is false and `addHook` is
// `undefined`. Registering the hook at module scope therefore threw a
// `TypeError` during SSR and turned the whole board route into a 500.
//
// So setup is deferred to the first actual render, and a call without a DOM
// fails loudly rather than falling back to unsanitised HTML.
// ---------------------------------------------------------------------------

import DOMPurify from 'dompurify';
import { Marked } from 'marked';

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
	'a',
	// Inert structure. Tables carry no attribute surface beyond what is already
	// blocked, and a table flattened into a run of cell text loses the only
	// thing that made it a table.
	'table',
	'thead',
	'tbody',
	'tr',
	'th',
	'td'
];

/**
 * No `style`, no `on*`, no `id`: a description cannot reach outside its own box.
 *
 * `target` and `rel` are deliberately absent even though every rendered anchor
 * ends up with both. They are ours to set, not the author's to supply — the
 * hook below writes them on any anchor that kept its `href`, and DOMPurify
 * preserves attributes set from a hook regardless of this list. Leaving them in
 * only meant an anchor whose `href` was stripped could keep whatever `target`
 * the description asked for.
 */
const ALLOWED_ATTR = ['href', 'title'];

/**
 * Task-list boxes as text, so no `<input>` is ever emitted for the sanitiser to
 * have to strip.
 *
 * Without this the checkbox is dropped and its state goes with it — "done" and
 * "todo" render identically, which is worse than showing no box at all.
 * Acceptance criteria are the motivating use for descriptions (ADR 0018), and a
 * task list is how people write them.
 */
const CHECKBOX_GLYPHS = { checked: '\u2611\uFE0E ', unchecked: '\u2610\uFE0E ' };

let instance: ReturnType<typeof DOMPurify> | null = null;

function noDom(): Error {
	return new Error(
		'renderMarkdown needs a DOM, and there is none. Story descriptions render client-side ' +
			'only (ADR 0018); rendering one on the server needs a DOM shim. Failing here on ' +
			'purpose — the alternative is emitting unsanitised HTML.'
	);
}

/**
 * Our own DOMPurify instance, built once, with the anchor hook on it.
 *
 * A private instance rather than the shared default export, because a hook is
 * installed on whatever instance it is added to and applies to every later
 * `sanitize` call on it. Hanging ours on the global would silently rewrite the
 * anchors of any future caller anywhere in the app, and nothing at that call
 * site would say why. Keeping the instance and its hook as one object also
 * means there is no separate "have I registered yet" flag to fall out of step
 * with the thing it is tracking.
 *
 * Lazy rather than module-scope: see the note at the top of this file — doing
 * any of this at import time breaks SSR for the whole board route.
 */
function purifier(): ReturnType<typeof DOMPurify> {
	if (instance) return instance;

	// Checked before `window` is touched at all: on the server the bare
	// identifier is a ReferenceError, and this needs to say what is actually
	// wrong rather than bottom out in one.
	if (typeof window === 'undefined') throw noDom();

	const created = DOMPurify(window);
	if (!created.isSupported) throw noDom();

	// A description is written by one account and read by another (ADR 0015), so
	// an outbound link must not hand the opener a `window` reference back to the
	// board. Applied after sanitisation, so it only ever lands on an anchor whose
	// href already survived the URI policy.
	created.addHook('afterSanitizeAttributes', (node) => {
		if (node.tagName === 'A' && node.hasAttribute('href')) {
			node.setAttribute('target', '_blank');
			node.setAttribute('rel', 'noopener noreferrer');
		}
	});

	instance = created;
	return created;
}

/**
 * Our own parser, not the shared `marked` singleton.
 *
 * `marked.use()` mutates the one global instance, so overriding the renderer
 * there would change how every other caller in the app parses — the same
 * hazard the private DOMPurify instance below avoids. The constructor merges
 * these overrides with the defaults, unlike passing `renderer` to `parse()`,
 * which replaces the renderer wholesale and leaves it without a `paragraph`.
 *
 * `breaks` because this is typed into a textarea, where a single newline is
 * meant as a line break rather than as paragraph continuation.
 */
const markdown = new Marked({
	gfm: true,
	breaks: true,
	renderer: {
		checkbox: ({ checked }) => (checked ? CHECKBOX_GLYPHS.checked : CHECKBOX_GLYPHS.unchecked),
		// Images are deliberately unsupported. With no CSP, an `img` pointing at
		// an arbitrary host is a request the reader's browser makes on the
		// author's behalf — a read receipt and an IP beacon that one editor could
		// aim at the map's owner (ADR 0015). Rendering the alt text keeps the
		// author's words rather than dropping them silently, which is what the
		// sanitiser alone would do.
		image: ({ text }) => (text ? escapeHtml(text) : '')
	}
});

/** Only ever applied to text we are about to hand back through the parser. */
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * Render a story description as sanitised HTML, ready for `{@html}`.
 *
 * `null` and blank both collapse to `''` so the caller has one branch rather
 * than three — "no description" and "a description of spaces" should read the
 * same on the board.
 */
export function renderMarkdown(source: string | null): string {
	if (source === null || source.trim() === '') return '';

	// `async: false` pins the return type to `string`; `parse` is otherwise
	// `string | Promise<string>` and would infect every caller.
	const html = markdown.parse(source, { async: false });

	return purifier().sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}

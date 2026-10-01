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
import { isGlossaryEntryId, parseGlossaryHref } from '$lib/glossary/glossary-link';

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
	'td',
	// A glossary term (ADR 0025). Emitted only by the `link` renderer below; the
	// hook pins every attribute it can carry, and `unwrapStrayButtons` turns any
	// button that did not come out as a valid term back into its text. So an
	// author who writes one by hand gets exactly what the renderer would have
	// produced, or their words.
	'button'
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
const ALLOWED_ATTR = ['href', 'title', 'type', 'class', 'data-glossary-id'];

/**
 * The three attributes a glossary term needs, and that nothing else may keep.
 * They are on the allowlist only so the glossary button survives; the hook
 * strips them from every other element, and rewrites them on the button.
 *
 * `class` is the one that matters most. Allowed generally, it would let an
 * author put any Tailwind utility on their prose — `fixed inset-0 z-50` is a
 * full-screen overlay a reader cannot dismiss, written by someone else.
 */
const GLOSSARY_ATTRS = ['type', 'class', 'data-glossary-id'] as const;

/** The class the board's delegated handlers and `app.css` both look for. */
export const GLOSSARY_TERM_CLASS = 'glossary-term';

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
		pinGlossaryAttributes(node);
	});

	instance = created;
	return created;
}

/**
 * A glossary button keeps a well-formed id and nothing of its own choosing;
 * every other element keeps none of the glossary attributes at all.
 *
 * Run on what the renderer emitted *and* on raw HTML an author typed, which
 * reach this hook identically. The renderer already validated its own ids;
 * checking again here is what covers the hand-written ones.
 */
function pinGlossaryAttributes(node: Element): void {
	const id = node.tagName === 'BUTTON' ? node.getAttribute('data-glossary-id') : null;
	for (const name of GLOSSARY_ATTRS) node.removeAttribute(name);
	if (node.tagName !== 'BUTTON') return;
	// A button is never a submit control here. There is no form for it to
	// submit (forms are stripped), but `button` is the default type, and the
	// description renders inside a dialog that does contain forms.
	node.setAttribute('type', 'button');
	if (id !== null && isGlossaryEntryId(id)) {
		node.setAttribute('class', GLOSSARY_TERM_CLASS);
		node.setAttribute('data-glossary-id', id);
	}
}

/**
 * Replaces every button that is not a glossary term with its own content.
 *
 * An inert button is not harmless in someone else's prose. It is still a tab
 * stop and still announced as a control, and a description is written by one
 * account and read by another (ADR 0015), so "Approve, button" that does
 * nothing is a lie told to the reader. Unwrapping keeps the author's words,
 * which is what DOMPurify does for every other tag it refuses.
 *
 * Done after sanitising rather than in a hook: DOMPurify walks the tree with a
 * live iterator, and restructuring nodes from inside a hook is not something
 * it promises to survive.
 */
function unwrapStrayButtons(root: DocumentFragment): void {
	for (const button of root.querySelectorAll(`button:not(.${GLOSSARY_TERM_CLASS})`)) {
		button.replaceWith(...button.childNodes);
	}
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
		image: ({ text }) => (text ? escapeHtml(text) : ''),
		// `[words](glossary:<id>)` is a glossary link (ADR 0025), not a URL: it
		// becomes a button the board resolves to a definition, never an anchor.
		// A malformed id renders as its words alone rather than falling through to
		// the URI policy, which would leave a dead anchor in the reader's prose.
		// Every other link returns `false`, which is marked's "use the default".
		link(token) {
			const glossary = parseGlossaryHref(token.href);
			if (glossary === null) return false;
			const words = this.parser.parseInline(token.tokens);
			if (glossary === 'invalid') return words;
			return `<button type="button" class="${GLOSSARY_TERM_CLASS}" data-glossary-id="${glossary}">${words}</button>`;
		}
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

	// `ALLOW_DATA_ATTR` and `ALLOW_ARIA_ATTR` off because DOMPurify otherwise
	// admits every `data-*` and `aria-*` attribute regardless of `ALLOWED_ATTR`.
	// `data-glossary-id` is now one the board acts on, so the rest are closed off
	// rather than left to whatever a future handler might read. And Markdown
	// never emits `aria-*`, so the only source is an author giving a reader's
	// screen reader a different name for something than the one on screen —
	// "Delete story" on a glossary term, say.
	const fragment = purifier().sanitize(html, {
		ALLOWED_TAGS,
		ALLOWED_ATTR,
		ALLOW_DATA_ATTR: false,
		ALLOW_ARIA_ATTR: false,
		RETURN_DOM_FRAGMENT: true
	});
	unwrapStrayButtons(fragment);
	const host = document.createElement('div');
	host.append(fragment);
	return host.innerHTML;
}

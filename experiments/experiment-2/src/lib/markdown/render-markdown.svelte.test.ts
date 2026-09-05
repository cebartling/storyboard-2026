import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './render-markdown';

// Lives in the *browser* Vitest project, despite the source being plain `.ts`:
// `vite.config.ts` routes `*.svelte.{test,spec}.ts` to the browser project and
// everything else to the node project, and the node project has no jsdom.
// DOMPurify needs a real DOM. `src/lib/actions/tooltip.ts` ->
// `tooltip.svelte.spec.ts` is the same trick for the same reason.

/** Parse the rendered HTML so assertions are about structure, not string shape. */
function parse(html: string): HTMLElement {
	const host = document.createElement('div');
	host.innerHTML = html;
	return host;
}

describe('renderMarkdown', () => {
	describe('empty input', () => {
		// `null` and blank both collapse to '' so the caller has one branch, not
		// three: "no description" and "a description of spaces" read the same.
		it.each([
			['null', null],
			['an empty string', ''],
			['whitespace only', '   \n\t  ']
		])('renders %s as the empty string', (_label, source) => {
			expect(renderMarkdown(source)).toBe('');
		});
	});

	describe('formatting', () => {
		it('renders bold', () => {
			expect(parse(renderMarkdown('A **bold** word')).querySelector('strong')?.textContent).toBe(
				'bold'
			);
		});

		it('renders italics', () => {
			expect(parse(renderMarkdown('An _italic_ word')).querySelector('em')?.textContent).toBe(
				'italic'
			);
		});

		it('renders headings', () => {
			expect(parse(renderMarkdown('## Acceptance criteria')).querySelector('h2')?.textContent).toBe(
				'Acceptance criteria'
			);
		});

		it('renders bullet lists as list items', () => {
			const items = parse(renderMarkdown('- first\n- second')).querySelectorAll('ul > li');

			expect([...items].map((li) => li.textContent)).toEqual(['first', 'second']);
		});

		it('renders inline code', () => {
			expect(parse(renderMarkdown('call `addStory` here')).querySelector('code')?.textContent).toBe(
				'addStory'
			);
		});

		// The whole point of the feature: a Patton-style story body keeps its
		// structure instead of arriving as one run-on paragraph.
		it('keeps a story body and its criteria as separate blocks', () => {
			const host = parse(
				renderMarkdown('As a shopper I want **search** so that:\n\n- I find things\n- Fast')
			);

			expect(host.querySelector('p')?.textContent).toContain('As a shopper');
			expect(host.querySelectorAll('li')).toHaveLength(2);
		});
	});

	describe('links', () => {
		it('renders an http link', () => {
			const anchor = parse(renderMarkdown('[docs](https://example.com/x)')).querySelector('a');

			expect(anchor?.getAttribute('href')).toBe('https://example.com/x');
		});

		// A description is authored by one account and read by another (ADR 0015),
		// so an outbound link must not hand the opener a window reference.
		it('opens links in a new tab without leaking the opener', () => {
			const anchor = parse(renderMarkdown('[docs](https://example.com)')).querySelector('a');

			expect(anchor?.getAttribute('target')).toBe('_blank');
			expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer');
		});
	});

	// This is the load-bearing part. There is no CSP behind this renderer
	// (nothing sets one in `vite.config.ts`, `hooks.server.ts` or `app.html`),
	// and an invited editor authoring a description that an owner then reads is
	// an in-model threat, not a hypothetical.
	describe('sanitisation', () => {
		it.each([
			['a script element', '<script>globalThis.pwned = true;</script>'],
			['an inline error handler', '<img src=x onerror="globalThis.pwned = true">'],
			['an iframe', '<iframe src="https://evil.test"></iframe>'],
			['an object element', '<object data="evil.swf"></object>'],
			['a style element', '<style>body { display: none }</style>'],
			['an inline click handler', '<div onclick="globalThis.pwned = true">click</div>'],
			['a form', '<form action="https://evil.test"><input name="a" /></form>']
		])('strips %s', (_label, payload) => {
			const host = parse(renderMarkdown(payload));

			expect(host.querySelector('script, iframe, object, style, form, input')).toBeNull();
			expect(host.innerHTML).not.toMatch(/onerror|onclick/i);
		});

		it.each([
			['a javascript: markdown link', '[click](javascript:globalThis.pwned=true)'],
			['a javascript: raw anchor', '<a href="javascript:globalThis.pwned=true">click</a>'],
			['a data: URI anchor', '<a href="data:text/html,<script>1</script>">click</a>']
		])('neutralises %s', (_label, payload) => {
			const href = parse(renderMarkdown(payload)).querySelector('a')?.getAttribute('href') ?? '';

			expect(href).not.toMatch(/^\s*(javascript|data):/i);
		});

		// Escaped rather than dropped: the text a user typed should survive even
		// when it looks like markup, or descriptions silently lose content.
		it('keeps the text of a stripped tag as text', () => {
			expect(parse(renderMarkdown('a <b>bold</b> word')).textContent).toContain('bold');
		});
	});
});

import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '$lib/markdown/render-markdown';
import { retailCommerceBlueprint, storyDescription } from './retail-commerce';

// In the browser project because `renderMarkdown` needs a DOM for DOMPurify
// (ADR 0018). The node-side `retail-commerce.test.ts` covers everything that
// does not.
//
// The point of this file: the seed is the corpus the description renderer is
// actually pointed at, so "every seeded description survives the renderer" is
// worth asserting once rather than discovering on the board.
describe('seeded descriptions through the renderer', () => {
	const stories = retailCommerceBlueprint.flatMap((a) => a.steps.flatMap((s) => s.stories));

	it('renders all 157 without throwing, and none render empty', () => {
		for (const story of stories) {
			const html = renderMarkdown(storyDescription(story));
			expect(html.length, story.title).toBeGreaterThan(0);
		}
	});

	it('emits no script, iframe, form control or inline handler anywhere in the corpus', () => {
		const host = document.createElement('div');
		host.innerHTML = stories.map((s) => renderMarkdown(storyDescription(s))).join('');

		expect(host.querySelector('script, iframe, object, style, form, input')).toBeNull();
		expect(host.innerHTML).not.toMatch(/\son[a-z]+=/i);
	});

	it('turns a story with a table into a real table', () => {
		const story = stories.find((s) => s.title === 'See a localised storefront')!;
		const host = document.createElement('div');
		host.innerHTML = renderMarkdown(storyDescription(story));

		expect([...host.querySelectorAll('th')].map((c) => c.textContent)).toEqual([
			'Market',
			'Currency',
			'Language'
		]);
	});

	it('keeps checked and unchecked criteria distinguishable', () => {
		const story = stories.find((s) => s.title === 'Buy a shipping label')!;
		const host = document.createElement('div');
		host.innerHTML = renderMarkdown(storyDescription(story));
		const text = host.textContent ?? '';

		expect(text).toContain('☑');
		expect(text).toContain('☐');
	});
});

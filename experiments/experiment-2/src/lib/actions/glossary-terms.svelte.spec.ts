import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GlossaryEntryId } from '$lib/domain/ids';
import type { GlossaryEntry } from '$lib/domain/story-map';
import { glossaryTerms } from './glossary-terms';

// Named `.svelte.spec.ts` so it runs in the chromium project, as
// `tooltip.svelte.spec.ts` does: the popover and the top layer need a browser.

const SHOW = 120;
const HIDE = 150;

const sku: GlossaryEntry = {
	id: '0190d3c2-0000-7000-8000-000000000001' as GlossaryEntryId,
	term: 'SKU',
	definition: 'Stock keeping unit'
};
const gone = '0190d3c2-0000-7000-8000-00000000dead';

function termButton(id: string, words: string) {
	return `<button type="button" class="glossary-term" data-glossary-id="${id}">${words}</button>`;
}

function mount(html: string, entries: GlossaryEntry[] = [sku]) {
	const host = document.createElement('div');
	host.innerHTML = html;
	document.body.append(host);
	const handle = glossaryTerms(host, entries);
	return { host, handle: handle!, term: host.querySelector<HTMLElement>('button')! };
}

function popup(): HTMLElement | null {
	return document.querySelector('[data-glossary-popup]');
}

function isOpen(): boolean {
	return popup()?.matches(':popover-open') ?? false;
}

function pointer(type: 'pointerover' | 'pointerout', target: Element, relatedTarget?: Element) {
	target.dispatchEvent(
		new PointerEvent(type, { pointerType: 'mouse', bubbles: true, relatedTarget })
	);
}

describe('glossaryTerms action', () => {
	beforeEach(() => vi.useFakeTimers());

	afterEach(() => {
		vi.useRealTimers();
		document.body.replaceChildren();
	});

	it('gives a resolved term its definition as an accessible description', () => {
		const { term } = mount(`Look up a ${termButton(sku.id, 'stock unit')}`);

		expect(term.getAttribute('aria-description')).toBe('SKU: Stock keeping unit');
		expect(term.hasAttribute('data-unresolved')).toBe(false);
	});

	// ADR 0025: a deleted entry leaves its links behind, and they read as words.
	it('marks a term whose entry is gone as unresolved and unfocusable', () => {
		const { term } = mount(termButton(gone, 'basket'));

		expect(term.hasAttribute('data-unresolved')).toBe(true);
		expect(term.getAttribute('tabindex')).toBe('-1');
		expect(term.hasAttribute('aria-description')).toBe(false);
	});

	it('shows the entry after a short hover delay', () => {
		const { term } = mount(termButton(sku.id, 'stock unit'));

		pointer('pointerover', term);
		expect(isOpen()).toBe(false);

		vi.advanceTimersByTime(SHOW);
		expect(isOpen()).toBe(true);
		expect(popup()?.textContent).toContain('SKU');
		expect(popup()?.textContent).toContain('Stock keeping unit');
	});

	it('shows nothing for an unresolved term', () => {
		const { term } = mount(termButton(gone, 'basket'));

		pointer('pointerover', term);
		vi.advanceTimersByTime(SHOW);

		expect(isOpen()).toBe(false);
	});

	it('hides after the pointer leaves, but not if it moves onto the popover', () => {
		const { term } = mount(termButton(sku.id, 'stock unit'));
		pointer('pointerover', term);
		vi.advanceTimersByTime(SHOW);

		pointer('pointerout', term, document.body);
		popup()!.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
		vi.advanceTimersByTime(HIDE);
		expect(isOpen()).toBe(true);

		popup()!.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
		vi.advanceTimersByTime(HIDE);
		expect(isOpen()).toBe(false);
	});

	it('shows immediately on keyboard focus and hides on blur', () => {
		const { term } = mount(termButton(sku.id, 'stock unit'));

		term.focus();
		expect(isOpen()).toBe(true);

		term.blur();
		expect(isOpen()).toBe(false);
	});

	// WCAG 1.4.13: dismissable without moving the pointer or focus. The event is
	// swallowed so the same key does not close the surrounding dialog too.
	it('dismisses on Escape without letting the key reach the dialog', () => {
		const { term } = mount(termButton(sku.id, 'stock unit'));
		term.focus();
		const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		const reachedParent = vi.fn();
		document.body.addEventListener('keydown', reachedParent);

		term.dispatchEvent(escape);

		expect(isOpen()).toBe(false);
		expect(escape.defaultPrevented).toBe(true);
		expect(reachedParent).not.toHaveBeenCalled();
	});

	it('closes when the entry it shows is deleted underneath it', () => {
		const { term, handle } = mount(termButton(sku.id, 'stock unit'));
		term.focus();

		handle.update?.([]);

		expect(isOpen()).toBe(false);
		expect(term.hasAttribute('data-unresolved')).toBe(true);
	});

	// `{@html}` swaps the whole subtree when a collaborator edits the description.
	it('annotates terms that arrive after mount', async () => {
		const { host } = mount('nothing yet');

		host.innerHTML = termButton(sku.id, 'stock unit');
		await Promise.resolve();

		expect(host.querySelector('button')?.getAttribute('aria-description')).toBe(
			'SKU: Stock keeping unit'
		);
	});

	it('removes its popover when destroyed', () => {
		const { term, handle } = mount(termButton(sku.id, 'stock unit'));
		term.focus();

		handle.destroy?.();

		expect(popup()).toBeNull();
	});
});

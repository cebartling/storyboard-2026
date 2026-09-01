import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tooltip } from './tooltip';

// Named `.svelte.spec.ts` so vite.config.ts routes it to the chromium project:
// the whole point of this action is the Popover API and the top layer, neither
// of which exists in the node environment.

const DELAY = 120;

function mountButton(label = 'Edit step') {
	const button = document.createElement('button');
	button.setAttribute('aria-label', label);
	document.body.append(button);
	return { button, handle: tooltip(button, label) };
}

function hover(button: HTMLElement, pointerType = 'mouse') {
	button.dispatchEvent(new PointerEvent('pointerenter', { pointerType, bubbles: false }));
}

function tip(): HTMLElement | null {
	return document.querySelector('[data-tooltip]');
}

describe('tooltip action', () => {
	beforeEach(() => vi.useFakeTimers());

	afterEach(() => {
		vi.useRealTimers();
		document.querySelectorAll('button, [data-tooltip]').forEach((el) => el.remove());
	});

	// The reason this action exists: `title` is browser-timed at roughly a
	// second, with no hook to shorten it.
	it('shows after its own short delay, not before', () => {
		const { button } = mountButton();

		hover(button);
		expect(tip()?.matches(':popover-open') ?? false).toBe(false);

		vi.advanceTimersByTime(DELAY);
		expect(tip()?.matches(':popover-open')).toBe(true);
		expect(tip()?.textContent).toBe('Edit step');
	});

	it('hides immediately when the pointer leaves', () => {
		const { button } = mountButton();
		hover(button);
		vi.advanceTimersByTime(DELAY);

		button.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));

		expect(tip()?.matches(':popover-open') ?? false).toBe(false);
	});

	it('cancels a pending show when the pointer leaves before the delay', () => {
		const { button } = mountButton();
		hover(button);

		button.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
		vi.advanceTimersByTime(DELAY);

		expect(tip()?.matches(':popover-open') ?? false).toBe(false);
	});

	// A keyboard user has already committed to the control by focusing it —
	// there is no accidental-hover to debounce, so the delay would only be lag.
	it('shows immediately on keyboard focus', () => {
		const { button } = mountButton();

		button.dispatchEvent(new FocusEvent('focus'));

		expect(tip()?.matches(':popover-open')).toBe(true);
	});

	// Touch has no hover state, so a tooltip there can only appear stuck.
	it('ignores a touch pointer', () => {
		const { button } = mountButton();

		hover(button, 'touch');
		vi.advanceTimersByTime(DELAY);

		expect(tip()?.matches(':popover-open') ?? false).toBe(false);
	});

	// The text duplicates the button's `aria-label`, so exposing it would make
	// every icon button announce twice.
	it('is hidden from assistive technology', () => {
		const { button } = mountButton();
		hover(button);
		vi.advanceTimersByTime(DELAY);

		expect(tip()?.getAttribute('aria-hidden')).toBe('true');
	});

	// Showing one has to close any other. Without this the board can strand a
	// tooltip: opening a dialog makes the page inert, so the trigger under the
	// pointer never receives the `pointerleave` that would have hidden it, and
	// it is still there when the next one opens.
	it('keeps at most one tooltip open', () => {
		const first = mountButton('Add story');
		const second = mountButton('Edit step');

		hover(first.button);
		vi.advanceTimersByTime(DELAY);
		hover(second.button);
		vi.advanceTimersByTime(DELAY);

		const open = [...document.querySelectorAll('[data-tooltip]')].filter((el) =>
			el.matches(':popover-open')
		);
		expect(open.map((el) => el.textContent)).toEqual(['Edit step']);
	});

	it('takes its element with it when destroyed', () => {
		const { button, handle } = mountButton();
		hover(button);
		vi.advanceTimersByTime(DELAY);

		handle?.destroy?.();

		expect(tip()).toBeNull();
	});
});

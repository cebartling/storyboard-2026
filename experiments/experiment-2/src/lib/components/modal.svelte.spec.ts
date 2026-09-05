import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { createRawSnippet, tick } from 'svelte';
import Modal from './modal.svelte';

const bodySnippet = createRawSnippet(() => ({
	render: () => `<p data-testid="modal-body">Body content</p>`
}));

function renderModal(open: boolean, onClose = () => {}) {
	return render(Modal, {
		open,
		title: 'Edit step',
		testid: 'test-modal',
		onClose,
		children: bodySnippet
	});
}

function dialogEl(): HTMLDialogElement {
	return page.getByTestId('test-modal').element() as HTMLDialogElement;
}

// A body shaped like the real dialogs: the hidden id field every editor
// carries, then the visible field, then a destructive button. Both of the
// focus guarantees below are invisible with a body that has no form controls,
// and the hidden input is not decoration — it is what `board-dialogs.svelte`
// actually renders first in six of the eight dialogs, and a selector that
// matches it focuses nothing.
const formSnippet = createRawSnippet(() => ({
	render: () => `
		<form>
			<input type="hidden" name="storyId" value="st-1" />
			<input name="title" data-testid="modal-field" />
			<button type="submit" data-testid="modal-delete">Delete</button>
		</form>
	`
}));

describe('Modal', () => {
	it('stays closed while `open` is false', async () => {
		renderModal(false);

		expect(dialogEl().open).toBe(false);
	});

	it('opens as a modal dialog when `open` is true', async () => {
		renderModal(true);
		await tick();

		expect(dialogEl().open).toBe(true);
		await expect.element(page.getByTestId('modal-body')).toBeVisible();
	});

	it('labels the dialog with its title', async () => {
		renderModal(true);
		await tick();

		const labelledBy = dialogEl().getAttribute('aria-labelledby');
		expect(document.getElementById(labelledBy!)?.textContent).toBe('Edit step');
	});

	it('puts the initial focus on the first field, not the close button', async () => {
		render(Modal, {
			open: true,
			title: 'Edit story',
			testid: 'test-modal',
			onClose: () => {},
			children: formSnippet
		});
		await tick();

		expect(document.activeElement).toBe(page.getByTestId('modal-field').element());
	});

	it('places the close button before the body in tab order', async () => {
		render(Modal, {
			open: true,
			title: 'Edit story',
			testid: 'test-modal',
			onClose: () => {},
			children: formSnippet
		});
		await tick();

		// Close must come before a dialog's Delete, so tabbing towards it never
		// parks focus on the destructive control on the way.
		const focusables = [...dialogEl().querySelectorAll('button, input:not([type="hidden"])')].map(
			(el) => el.getAttribute('aria-label') ?? el.getAttribute('data-testid')
		);
		expect(focusables).toEqual(['Close', 'modal-field', 'modal-delete']);
	});

	it('closes and calls onClose when `open` flips back to false', async () => {
		const onClose = vi.fn();
		const { rerender } = renderModal(true, onClose);
		await tick();

		await rerender({ open: false });
		await tick();

		expect(dialogEl().open).toBe(false);
		// The native `close` event fires for a programmatic close too, which is
		// why `onClose` has to be idempotent. The browser queues it as a task
		// rather than firing it inline, so a microtask `tick()` is not enough.
		await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
	});

	it('calls onClose when Escape is pressed', async () => {
		const onClose = vi.fn();
		renderModal(true, onClose);
		await tick();

		// Escape is handled by the browser, not by us: `showModal()` focuses
		// inside the dialog, so the key lands there and the element closes
		// itself, firing the `close` event this component listens for.
		await userEvent.keyboard('{Escape}');

		await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(dialogEl().open).toBe(false);
	});

	it('calls onClose when the close button is activated', async () => {
		const onClose = vi.fn();
		renderModal(true, onClose);
		await tick();

		await page.getByRole('button', { name: 'Close' }).click();

		expect(onClose).toHaveBeenCalled();
	});

	it('closes on a backdrop press but not on a press inside the content', async () => {
		const onClose = vi.fn();
		renderModal(true, onClose);
		await tick();

		const body = page.getByTestId('modal-body').element();
		body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(onClose).not.toHaveBeenCalled();

		// Explicit coordinates clear of the box: the backdrop is the region
		// outside it, and relying on a default of (0, 0) would only pass while
		// the dialog happens to be centred.
		const dialog = dialogEl();
		const box = dialog.getBoundingClientRect();
		const outside = { clientX: box.right + 20, clientY: box.bottom + 20 };
		dialog.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, ...outside }));
		dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, ...outside }));
		expect(onClose).toHaveBeenCalledOnce();
	});

	// The test above makes `e.target === dialogEl` true by construction, so it
	// pins the branch but not the layout claim underneath it: that the dialog's
	// own hit area is only ever the backdrop. It is not — the box has padding,
	// and a press there also reports the dialog as the target. Driving real
	// coordinates is the only way to tell the two apart.
	it('does not close on a press inside its own padding', async () => {
		const onClose = vi.fn();
		renderModal(true, onClose);
		await tick();

		const dialog = dialogEl();
		const box = dialog.getBoundingClientRect();
		// A few pixels inside the top-left corner: the dialog's padding ring,
		// which is visually part of the panel but is not any child's box.
		const x = box.left + 4;
		const y = box.top + 4;
		expect(document.elementFromPoint(x, y)).toBe(dialog);

		for (const type of ['mousedown', 'click'] as const) {
			dialog.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
		}

		expect(onClose).not.toHaveBeenCalled();
	});

	// Same reason as the board's other icon buttons: an SVG the stylesheet can
	// size and stroke, not a `×` whose weight depends on the fallback font.
	it('draws its close affordance as the x icon', async () => {
		renderModal(true);

		const button = page.getByRole('button', { name: 'Close' }).element() as HTMLElement;

		expect(button.querySelector('svg.lucide-x')).not.toBeNull();
		expect(button.textContent?.trim()).toBe('');
	});
});

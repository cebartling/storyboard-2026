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

// A body shaped like the real dialogs: a field first, a destructive button
// after it. Both of the focus guarantees below are invisible with a body that
// has no form controls.
const formSnippet = createRawSnippet(() => ({
	render: () => `
		<form>
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
		const focusables = [...dialogEl().querySelectorAll('button, input')].map(
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

		const dialog = dialogEl();
		dialog.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(onClose).toHaveBeenCalledOnce();
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

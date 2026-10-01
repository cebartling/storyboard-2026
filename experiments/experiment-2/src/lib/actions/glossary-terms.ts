import type { Action } from 'svelte/action';
import type { GlossaryEntry } from '$lib/domain/story-map';
import { GLOSSARY_TERM_CLASS } from '$lib/markdown/render-markdown';

// Turns the glossary buttons in a rendered description into terms a reader can
// look up (ADR 0025). Put on the element that holds ADR 0018's `{@html}`: the
// renderer emits `<button class="glossary-term" data-glossary-id>` and nothing
// more, and this resolves each id against the map's glossary on the board side.
// The definition is only ever written with `textContent` — it never goes near
// the HTML sink.
//
// One popover per description, appended to the enclosing `<dialog>` rather than
// to <body>. Under a modal dialog everything outside it is inert, and unlike the
// icon tooltips (ADR 0013) this popover has to take the pointer: WCAG 1.4.13
// wants hover content you can move onto without it vanishing.

const SHOW_DELAY_MS = 120;
/** Long enough to cross the gap from the term to the popover. */
const HIDE_DELAY_MS = 150;
const OFFSET_PX = 6;
const MARGIN_PX = 4;

const TERM_SELECTOR = `button.${GLOSSARY_TERM_CLASS}`;

export const glossaryTerms: Action<HTMLElement, readonly GlossaryEntry[]> = (node, entries) => {
	let byId = index(entries);
	let popup: HTMLElement | undefined;
	let openFor: HTMLElement | undefined;
	let showTimer: ReturnType<typeof setTimeout> | undefined;
	let hideTimer: ReturnType<typeof setTimeout> | undefined;

	function index(list: readonly GlossaryEntry[] = []) {
		return new Map(list.map((e) => [e.id as string, e]));
	}

	function entryFor(button: Element): GlossaryEntry | undefined {
		const id = button.getAttribute('data-glossary-id');
		return id === null ? undefined : byId.get(id);
	}

	/** The term button an event happened in, if it resolves to an entry. */
	function termAt(target: EventTarget | null): HTMLElement | undefined {
		if (!(target instanceof Element)) return undefined;
		const button = target.closest<HTMLElement>(TERM_SELECTOR);
		if (!button || !node.contains(button) || !entryFor(button)) return undefined;
		return button;
	}

	/**
	 * Marks every term as resolved or not. A resolved term carries its
	 * definition as `aria-description`, which is what a screen reader announces;
	 * the popover itself is `aria-hidden` so it is not read twice. An unresolved
	 * term — its entry was deleted (ADR 0025) — reads as plain words and is
	 * taken out of the tab order, since focusing it would offer nothing.
	 */
	function annotate() {
		for (const button of node.querySelectorAll<HTMLElement>(TERM_SELECTOR)) {
			const entry = entryFor(button);
			if (entry) {
				button.removeAttribute('data-unresolved');
				button.removeAttribute('tabindex');
				button.setAttribute('aria-description', `${entry.term}: ${entry.definition}`);
			} else {
				button.setAttribute('data-unresolved', '');
				button.setAttribute('tabindex', '-1');
				button.removeAttribute('aria-description');
			}
		}
		if (openFor && (!openFor.isConnected || !entryFor(openFor))) hide();
	}

	function ensurePopup(): HTMLElement {
		if (popup) return popup;
		popup = document.createElement('div');
		popup.dataset.glossaryPopup = '';
		popup.popover = 'manual';
		popup.setAttribute('aria-hidden', 'true');
		popup.className =
			'border-line bg-surface text-ink fixed m-0 w-max max-w-72 rounded-lg border px-3 py-2 text-sm break-words shadow-lg';
		popup.addEventListener('pointerenter', cancelHide);
		popup.addEventListener('pointerleave', onPopupLeave);
		(node.closest('dialog') ?? document.body).append(popup);
		return popup;
	}

	function fill(el: HTMLElement, entry: GlossaryEntry) {
		const term = document.createElement('p');
		term.className = 'font-medium';
		term.textContent = entry.term;
		const definition = document.createElement('p');
		definition.className = 'text-ink-muted mt-0.5 whitespace-pre-line';
		definition.textContent = entry.definition;
		el.replaceChildren(term, definition);
	}

	/** Below the term by preference, above when there is no room below. */
	function position(el: HTMLElement, anchor: HTMLElement) {
		const at = anchor.getBoundingClientRect();
		const self = el.getBoundingClientRect();
		const below = at.bottom + OFFSET_PX;
		const top =
			below + self.height <= window.innerHeight - MARGIN_PX
				? below
				: Math.max(MARGIN_PX, at.top - self.height - OFFSET_PX);
		const left = Math.min(Math.max(at.left, MARGIN_PX), window.innerWidth - self.width - MARGIN_PX);
		el.style.top = `${top}px`;
		el.style.left = `${left}px`;
	}

	function show(button: HTMLElement) {
		clearTimeout(showTimer);
		cancelHide();
		const entry = entryFor(button);
		if (!entry || !button.isConnected) return;
		const el = ensurePopup();
		fill(el, entry);
		if (!el.matches(':popover-open')) el.showPopover();
		openFor = button;
		// After showing: a closed popover has no size to measure.
		position(el, button);
		document.addEventListener('pointerdown', onOutsidePointer, true);
		document.addEventListener('keydown', onKeyDown, true);
		document.addEventListener('scroll', reposition, true);
	}

	function hide() {
		clearTimeout(showTimer);
		cancelHide();
		if (popup?.matches(':popover-open')) popup.hidePopover();
		openFor = undefined;
		document.removeEventListener('pointerdown', onOutsidePointer, true);
		document.removeEventListener('keydown', onKeyDown, true);
		document.removeEventListener('scroll', reposition, true);
	}

	// The popover is `fixed` in the top layer, so it does not move with the
	// term when the dialog it sits in scrolls.
	function reposition() {
		if (popup && openFor) position(popup, openFor);
	}

	function scheduleHide() {
		cancelHide();
		hideTimer = setTimeout(hide, HIDE_DELAY_MS);
	}

	function cancelHide() {
		clearTimeout(hideTimer);
	}

	// A tap has no hover to leave, so a popover opened by one closes when the
	// reader touches anywhere else.
	function onOutsidePointer(event: PointerEvent) {
		const target = event.target as Node | null;
		if (target && (openFor?.contains(target) || popup?.contains(target))) return;
		hide();
	}

	function onPointerOver(event: PointerEvent) {
		if (event.pointerType === 'touch') return;
		const button = termAt(event.target);
		if (!button) return;
		cancelHide();
		if (button === openFor) return;
		clearTimeout(showTimer);
		showTimer = setTimeout(() => show(button), SHOW_DELAY_MS);
	}

	// Touch lifts fire `pointerout`/`pointerleave` too, and a popover opened by a
	// tap is closed only by a touch elsewhere (above), not by the finger lifting.
	function onPopupLeave(event: PointerEvent) {
		if (event.pointerType !== 'touch') scheduleHide();
	}

	function onPointerOut(event: PointerEvent) {
		if (event.pointerType === 'touch') return;
		const button = termAt(event.target);
		if (!button || button.contains(event.relatedTarget as Node | null)) return;
		clearTimeout(showTimer);
		if (button === openFor) scheduleHide();
	}

	// No delay on focus, as for the tooltips: a keyboard user has already
	// committed to the term.
	function onFocusIn(event: FocusEvent) {
		const button = termAt(event.target);
		if (button) show(button);
	}

	function onFocusOut(event: FocusEvent) {
		if (termAt(event.target) === openFor) hide();
	}

	function onClick(event: MouseEvent) {
		const button = termAt(event.target);
		if (button) show(button);
	}

	// Dismissable without moving (WCAG 1.4.13). Stopped here so the same Escape
	// does not also close the dialog the reader is standing in. Listened for on
	// the document while open, not on the description: a popover opened by hover
	// leaves focus wherever it was — the dialog's Close button, on open — and
	// Escape has to dismiss it from there too.
	function onKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !openFor) return;
		event.preventDefault();
		event.stopPropagation();
		hide();
	}

	// `{@html}` replaces the description's nodes whenever it changes — a
	// collaborator's edit arrives as a whole new subtree — so terms are
	// re-annotated on every replacement rather than once at mount.
	const observer = new MutationObserver(annotate);
	observer.observe(node, { childList: true, subtree: true });
	annotate();

	node.addEventListener('pointerover', onPointerOver);
	node.addEventListener('pointerout', onPointerOut);
	node.addEventListener('focusin', onFocusIn);
	node.addEventListener('focusout', onFocusOut);
	node.addEventListener('click', onClick);

	return {
		update(next) {
			byId = index(next);
			annotate();
			const entry = openFor && entryFor(openFor);
			if (entry && popup && openFor) {
				fill(popup, entry);
				// An edited definition changes the popover's size.
				position(popup, openFor);
			}
		},
		destroy() {
			hide();
			observer.disconnect();
			node.removeEventListener('pointerover', onPointerOver);
			node.removeEventListener('pointerout', onPointerOut);
			node.removeEventListener('focusin', onFocusIn);
			node.removeEventListener('focusout', onFocusOut);
			node.removeEventListener('click', onClick);
			popup?.remove();
		}
	};
};

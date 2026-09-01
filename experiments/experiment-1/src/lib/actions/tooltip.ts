import type { Action } from 'svelte/action';

// A hover/focus label for the icon-only buttons (ADR 0013). This exists
// because `title` cannot be retimed: its ~1s delay is the browser's, with no
// CSS, HTML, or JS hook to shorten it.
//
// The element is a popover appended to <body>, not a child of the trigger.
// Both matter on the board: the trigger sits inside `BoardViewport`'s world
// element, which carries `style="zoom: …"` and lives in an `overflow-auto`
// scroller (ADR 0010). A child tooltip would scale with the board's zoom and
// clip at the viewport edge; the top layer is subject to neither.
const DELAY_MS = 120;

// At most one tooltip is open at a time. Beyond being what a tooltip should
// do, this is load-bearing on the board: opening a dialog makes the rest of
// the page inert, so a trigger under the pointer never receives the
// `pointerleave` that would have hidden its tooltip, and it would otherwise
// still be showing when the next one opens.
let openTip: HTMLElement | undefined;

/** Distance from the trigger, and the smallest gap kept to the viewport edge. */
const OFFSET_PX = 6;
const MARGIN_PX = 4;

export const tooltip: Action<HTMLElement, string> = (node, text) => {
	// Where `showPopover` is missing, `title` is worse than this action but far
	// better than no label at all.
	if (typeof node.showPopover !== 'function') {
		node.title = text;
		return {
			update: (next: string) => (node.title = next),
			destroy: () => node.removeAttribute('title')
		};
	}

	// Built on first show, not at mount: the board renders one trigger per
	// story card and per step, and a map of any size would otherwise put that
	// many permanently-hidden divs in <body> for tooltips most of them never
	// show.
	let tip: HTMLElement | undefined;
	let label = text;
	let timer: ReturnType<typeof setTimeout> | undefined;

	function ensure(): HTMLElement {
		if (tip) return tip;
		tip = document.createElement('div');
		tip.dataset.tooltip = '';
		tip.popover = 'manual';
		// The text repeats the trigger's `aria-label`; exposing it would make
		// every icon button announce its name twice.
		tip.setAttribute('aria-hidden', 'true');
		tip.className =
			'bg-ink pointer-events-none fixed m-0 w-max max-w-56 rounded-md px-2 py-1 text-xs font-medium text-white shadow-md';
		tip.textContent = label;
		document.body.append(tip);
		return tip;
	}

	function position(tip: HTMLElement) {
		const anchor = node.getBoundingClientRect();
		const self = tip.getBoundingClientRect();

		// Above by preference; below when the trigger is too near the top of the
		// viewport for the tooltip to fit — which is exactly where the board's
		// sticky step headers put it.
		const above = anchor.top - self.height - OFFSET_PX;
		const top = above >= MARGIN_PX ? above : anchor.bottom + OFFSET_PX;

		const centred = anchor.left + anchor.width / 2 - self.width / 2;
		const left = Math.min(Math.max(centred, MARGIN_PX), window.innerWidth - self.width - MARGIN_PX);

		tip.style.top = `${top}px`;
		tip.style.left = `${left}px`;
	}

	function show() {
		clearTimeout(timer);
		const el = ensure();
		if (el.matches(':popover-open')) return;
		if (openTip && openTip !== el && openTip.matches(':popover-open')) openTip.hidePopover();
		el.showPopover();
		openTip = el;
		// Positioned after showing: a display:none popover has no measurable
		// size, so its height is only known once it is in the top layer.
		position(el);
	}

	function hide() {
		clearTimeout(timer);
		if (tip?.matches(':popover-open')) tip.hidePopover();
		if (openTip === tip) openTip = undefined;
	}

	function onPointerEnter(event: PointerEvent) {
		// Touch has no hover to leave, so a tooltip opened by a tap can only
		// read as stuck.
		if (event.pointerType === 'touch') return;
		clearTimeout(timer);
		timer = setTimeout(show, DELAY_MS);
	}

	// No delay on focus: a keyboard user has already committed to the control,
	// so there is no stray hover to debounce and the wait would just be lag.
	node.addEventListener('pointerenter', onPointerEnter);
	node.addEventListener('pointerleave', hide);
	node.addEventListener('pointerdown', hide);
	node.addEventListener('focus', show);
	node.addEventListener('blur', hide);
	// A click that opens a dialog leaves the pointer over a button that is no
	// longer there, and `pointerleave` does not always follow.
	node.addEventListener('click', hide);

	return {
		update: (next: string) => {
			label = next;
			if (tip) tip.textContent = next;
		},
		destroy() {
			clearTimeout(timer);
			node.removeEventListener('pointerenter', onPointerEnter);
			node.removeEventListener('pointerleave', hide);
			node.removeEventListener('pointerdown', hide);
			node.removeEventListener('focus', show);
			node.removeEventListener('blur', hide);
			node.removeEventListener('click', hide);
			if (openTip === tip) openTip = undefined;
			tip?.remove();
		}
	};
};

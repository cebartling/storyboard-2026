<script lang="ts">
	// Bounded-height pan/zoom viewport around the board (ADR 0010). Pan is
	// native `overflow: auto` scrolling; zoom is the CSS `zoom` property on
	// the inner world wrapper. This component owns every gesture that drives
	// the `Camera` and reports measured sizes/scroll back into it — it never
	// touches board content, testids, or dnd behaviour.
	import type { Snippet } from 'svelte';
	import type { Camera } from '$lib/canvas/camera.svelte';

	let { camera, children }: { camera: Camera; children: Snippet } = $props();

	let viewportEl: HTMLDivElement | undefined = $state();

	/**
	 * Moves keyboard focus to the scroll region. Exported so a caller can put
	 * focus somewhere truthful after removing whatever had it — a delete takes
	 * its own trigger with it (finding F3) — without reaching for the element
	 * this component owns.
	 */
	export function focusViewport() {
		viewportEl?.focus();
	}
	let worldEl: HTMLDivElement | undefined = $state();
	let spaceHeld = $state(false);
	let isPanning = $state(false);

	// Elements a background/space drag must never hijack. The board itself is
	// read-only since ADR 0011 — every edit happens in a dialog, which is a
	// sibling of this component and never inside it — so the only interactive
	// things here are story cards (dnd) and buttons/links. The form controls
	// this used to list could not match once the inline forms were removed.
	const INTERACTIVE_SELECTOR = '[data-testid^="story-"], button, a';

	function isInteractiveTarget(target: EventTarget | null): boolean {
		return target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null;
	}

	// Deliberately not BUTTON: a button does not consume +/-/0/1, and the zoom
	// controls advertise those very keys with `aria-keyshortcuts`, so clicking a
	// zoom button must not silence the shortcut it just announced. Space is the
	// exception and is guarded at its own branch below.
	function isTypingTarget(el: Element | null): boolean {
		if (!el) return false;
		if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true;
		return el instanceof HTMLElement && el.isContentEditable;
	}

	// --- Size reporting: ResizeObserver on both the container and the world -
	//
	// The world element itself carries `style="zoom: {camera.zoom}"`, so its
	// own measured box (getBoundingClientRect/offsetWidth) is already scaled
	// by that zoom — dividing back out gives the natural, unzoomed size the
	// camera expects (see camera.svelte.ts's worldWidth/worldHeight doc).
	$effect(() => {
		if (!worldEl) return;
		const observer = new ResizeObserver(() => {
			if (!worldEl) return;
			const rect = worldEl.getBoundingClientRect();
			const zoom = camera.zoom || 1;
			camera.setWorldSize(rect.width / zoom, rect.height / zoom);
		});
		observer.observe(worldEl);
		return () => observer.disconnect();
	});

	$effect(() => {
		if (!viewportEl) return;
		const observer = new ResizeObserver(() => {
			if (!viewportEl) return;
			camera.setViewportSize(viewportEl.clientWidth, viewportEl.clientHeight);
		});
		observer.observe(viewportEl);
		return () => observer.disconnect();
	});

	// --- Scroll <-> camera sync, guarded against feedback loops -------------
	let scrollRafId: number | null = null;
	let suppressScrollSync = false;

	function onScroll() {
		if (suppressScrollSync || scrollRafId !== null) return;
		scrollRafId = requestAnimationFrame(() => {
			scrollRafId = null;
			if (!viewportEl || suppressScrollSync) return;
			camera.setObservedScroll(viewportEl.scrollLeft, viewportEl.scrollTop);
		});
	}

	function prefersReducedMotion(): boolean {
		return (
			typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
		);
	}

	// Writes the camera's scroll back onto the element when it changed
	// programmatically (zoomAt, panTo, keyboard shortcuts) rather than by the
	// user scrolling. Suppressed briefly afterwards so the resulting native
	// `scroll` event does not bounce back into `setObservedScroll`.
	//
	// `fit()`/`resetZoom()` flag their jump as worth animating (see
	// `consumeSmoothScrollHint`'s doc) — honoured here as `behavior: 'smooth'`
	// unless the user has asked for reduced motion. Every other camera-driven
	// scroll (wheel-zoom, drag panning, minimap drag, keyboard nudges) stays
	// an instant jump: those already track a live gesture, so animating them
	// would only add lag.
	$effect(() => {
		const targetX = camera.scrollX;
		const targetY = camera.scrollY;
		const smooth = camera.consumeSmoothScrollHint();
		if (!viewportEl) return;
		if (
			Math.abs(viewportEl.scrollLeft - targetX) < 1 &&
			Math.abs(viewportEl.scrollTop - targetY) < 1
		) {
			return;
		}
		suppressScrollSync = true;
		viewportEl.scrollTo({
			left: targetX,
			top: targetY,
			behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto'
		});
		requestAnimationFrame(() => {
			suppressScrollSync = false;
		});
	});

	// --- Ctrl/Cmd+wheel and pinch zoom ---------------------------------------
	//
	// Svelte 5's `onwheel` attribute is a passive listener, so calling
	// `preventDefault()` from it silently fails. This listener is attached
	// manually with `{ passive: false }` so ctrl/cmd+wheel (and trackpad
	// pinch, which browsers report as ctrl+wheel) can suppress the browser's
	// native page-zoom.
	//
	// Zoom levels are snapped (see `ZOOM_STEPS`), so a step has to be earned
	// rather than taken per event: a pinch arrives as dozens of events with
	// small deltas, and stepping on each one would cross the whole zoom range in
	// a single gesture. Accumulating instead means one mouse notch (100 in
	// Chrome, comfortably over the threshold) still zooms immediately, while a
	// pinch advances at a usable rate.
	const WHEEL_STEP_THRESHOLD = 50;
	let wheelAccum = 0;

	$effect(() => {
		if (!viewportEl) return;
		// Captured once: reading the `$state` at teardown would remove the
		// listener from whatever element is bound *then*, leaking this one.
		const el = viewportEl;
		function handleWheel(e: WheelEvent) {
			if (!(e.ctrlKey || e.metaKey)) return;
			e.preventDefault();
			// Reversing direction mid-gesture discards the residue, so the first
			// event of the new direction is not cancelled out by the old one.
			if (wheelAccum !== 0 && Math.sign(e.deltaY) !== Math.sign(wheelAccum)) {
				wheelAccum = 0;
			}
			wheelAccum += e.deltaY;
			if (Math.abs(wheelAccum) < WHEEL_STEP_THRESHOLD) return;
			const dir = wheelAccum < 0 ? 1 : -1;
			wheelAccum = 0;
			const rect = el.getBoundingClientRect();
			camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, dir);
		}
		el.addEventListener('wheel', handleWheel, { passive: false });
		return () => el.removeEventListener('wheel', handleWheel);
	});

	// --- Background / middle-mouse / space drag panning ----------------------

	/**
	 * How far a plain left press has to move before it counts as a pan rather
	 * than a click or the start of a text selection. Small enough that a
	 * deliberate drag feels immediate, large enough to survive the wobble of
	 * pressing a mouse button.
	 */
	const PAN_THRESHOLD_PX = 4;

	let panState: {
		pointerId: number;
		startClientX: number;
		startClientY: number;
		startScrollX: number;
		startScrollY: number;
		/** False while a plain left press might still turn out to be a click. */
		armed: boolean;
	} | null = null;

	function onPointerDown(e: PointerEvent) {
		if (e.pointerType === 'touch') return; // native touch scroll handles panning
		const isMiddle = e.button === 1;
		const isLeft = e.button === 0;

		if (isMiddle) {
			e.preventDefault();
		} else if (isLeft) {
			if (!spaceHeld && isInteractiveTarget(e.target)) return; // never steal dnd/forms/buttons
			// Deliberately no `preventDefault()` here. Suppressing the default on
			// the press also suppresses the text selection it would have started,
			// which made every activity, step and slice name unselectable — a
			// name is a thing people copy into a ticket. A press only becomes a
			// pan once it has moved past PAN_THRESHOLD_PX (below), and the
			// suppression happens there instead, by which point there is a drag
			// worth suppressing.
		} else {
			return;
		}

		if (!viewportEl) return;
		// `preventDefault` above suppresses the default focus along with the
		// selection, and this container needs focus for keyboard panning.
		viewportEl.focus({ preventScroll: true });
		viewportEl.setPointerCapture(e.pointerId);
		// A middle-button or space-held press is unambiguous — there is no
		// selection to protect and no other reading of the gesture — so it pans
		// immediately. A plain left press has to wait and see.
		const armed = isMiddle || spaceHeld;
		isPanning = armed;
		panState = {
			pointerId: e.pointerId,
			startClientX: e.clientX,
			startClientY: e.clientY,
			startScrollX: viewportEl.scrollLeft,
			startScrollY: viewportEl.scrollTop,
			armed
		};
	}

	function onPointerMove(e: PointerEvent) {
		if (!panState || panState.pointerId !== e.pointerId || !viewportEl) return;

		const dx = e.clientX - panState.startClientX;
		const dy = e.clientY - panState.startClientY;

		if (!panState.armed) {
			// Still could be a click or the start of a selection. Only past the
			// threshold is it certainly a drag.
			if (Math.abs(dx) < PAN_THRESHOLD_PX && Math.abs(dy) < PAN_THRESHOLD_PX) return;
			panState.armed = true;
			isPanning = true;
			// Drop whatever selection the press began before the threshold was
			// crossed, so the pan does not leave a stray highlight behind.
			document.getSelection()?.removeAllRanges();
		}

		// Now it is a pan: keep the selection out of it for the rest of the drag.
		e.preventDefault();
		viewportEl.scrollLeft = panState.startScrollX - dx;
		viewportEl.scrollTop = panState.startScrollY - dy;
	}

	function endPan(e: PointerEvent) {
		if (!panState || panState.pointerId !== e.pointerId) return;
		viewportEl?.releasePointerCapture(e.pointerId);
		panState = null;
		isPanning = false;
	}

	// Suppresses the browser's middle-click autoscroll widget.
	function onAuxClick(e: MouseEvent) {
		if (e.button === 1) e.preventDefault();
	}

	// --- Space-held tracking + keyboard zoom shortcuts -----------------------
	$effect(() => {
		function onKeyDown(e: KeyboardEvent) {
			// A modal dialog inerts the rest of the document, so the board must
			// not react to keys typed into it. `isTypingTarget` is not enough:
			// it deliberately excludes buttons, so pressing "1" with a modal's
			// Delete button focused would silently fit() the board underneath.
			//
			// `:modal`, not `[open]`: a dialog opened with `show()` carries the
			// same `open` attribute but leaves the board interactive, so it has
			// no claim on these shortcuts.
			if (document.querySelector('dialog:modal')) return;
			if (isTypingTarget(document.activeElement)) return;

			// Leave the browser's own Ctrl/Cmd+0/-/= page zoom alone. Shift is allowed
			// through because '+' needs it on most layouts.
			if (e.ctrlKey || e.metaKey || e.altKey) return;

			if (e.code === 'Space') {
				// Space activates a focused button; hijacking it for pan-mode here
				// would swallow that activation.
				if (document.activeElement instanceof HTMLButtonElement) return;
				if (!e.repeat) spaceHeld = true;
				e.preventDefault();
				return;
			}
			if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '+' || e.key === '=') {
				camera.zoomIn();
				e.preventDefault();
				return;
			}
			if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.key === '-' || e.key === '_') {
				camera.zoomOut();
				e.preventDefault();
				return;
			}
			if (e.code === 'Digit0' || e.code === 'Numpad0' || e.key === '0') {
				camera.resetZoom();
				e.preventDefault();
				return;
			}
			if (e.code === 'Digit1' || e.code === 'Numpad1' || e.key === '1') {
				camera.fit();
				e.preventDefault();
			}
		}

		function onKeyUp(e: KeyboardEvent) {
			if (e.code === 'Space') spaceHeld = false;
		}

		// A keyup that lands in another window never reaches us, so space would stay
		// stuck down and keep stealing pointerdown from the cards underneath.
		function clearSpace() {
			spaceHeld = false;
		}

		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		window.addEventListener('blur', clearSpace);
		document.addEventListener('visibilitychange', clearSpace);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
			window.removeEventListener('blur', clearSpace);
			document.removeEventListener('visibilitychange', clearSpace);
		};
	});
</script>

<!--
	`region` is normally non-interactive, but this element is the native
	scroll container for keyboard panning (arrows/PageUp/PageDown/Home/End): a
	scroll container must be focusable to receive those keys at all, and
	`role="region"` with an `aria-label` is the correct landmark role for "the
	board canvas", not a stand-in for a button/application role. There is no
	non-tabindex way to make a scrollable div keyboard-focusable, so this
	warning is unavoidable rather than a sign the markup should change.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	bind:this={viewportEl}
	data-testid="board-viewport"
	tabindex="0"
	role="region"
	aria-label="Story map canvas"
	class="relative min-h-0 flex-1 overflow-auto {spaceHeld
		? isPanning
			? 'cursor-grabbing'
			: 'cursor-grab'
		: ''} {isPanning ? 'select-none' : ''}"
	onscroll={onScroll}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={endPan}
	onpointercancel={endPan}
	onauxclick={onAuxClick}
>
	<div
		bind:this={worldEl}
		data-testid="board-world"
		class="min-w-max p-16"
		style="zoom: {camera.zoom}"
	>
		{@render children()}
	</div>
	<!--
		Room to scroll the last row clear of the overlays the board route pins to
		the panel's bottom corners (the minimap and zoom controls, ADR 0010).
		Without it, content under them cannot be reached by pointer however
		visible it looks, and on a board that barely overflows there is nothing
		to scroll it out from under (finding F5).

		Outside the zoomed world on purpose: `zoom` scales padding with it, so a
		reservation made inside would shrink exactly when the overlays — which
		are a fixed size — take up proportionally more of the view.
	-->
	<div aria-hidden="true" class="h-36 shrink-0"></div>
</div>

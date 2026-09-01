<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { tooltip } from '$lib/actions/tooltip';

	// The one modal primitive (ADR 0011). A thin wrapper over the native
	// `<dialog>` element: `showModal()` already gives the top layer, the
	// `::backdrop`, a focus trap, Escape-to-close, inerting of the rest of the
	// document, and focus return to the trigger — so none of that is
	// reimplemented here. This component owns no form markup; each caller
	// renders its own form as the child snippet.
	//
	// `open` is a plain prop, not `$bindable`: the parent's dialog state is the
	// single source of truth and this effect only mirrors it onto the
	// imperative element. Every close path (Escape, the × button, a backdrop
	// click, a programmatic close) funnels through the element's native `close`
	// event into `onClose`, so the two can never drift apart.
	import type { Snippet } from 'svelte';

	let {
		open,
		title,
		testid,
		onClose,
		children
	}: {
		open: boolean;
		title: string;
		/** Applied as `data-testid` on the dialog, for e2e scoping. */
		testid?: string;
		/** Must be idempotent: a programmatic `close()` fires `close` too. */
		onClose: () => void;
		children: Snippet;
	} = $props();

	let dialogEl: HTMLDialogElement | undefined = $state();
	const titleId = $props.id();

	$effect(() => {
		if (!dialogEl) return;
		// The `.open` guards are not defensive padding: `showModal()` on an
		// already-open dialog throws InvalidStateError.
		if (open && !dialogEl.open) {
			dialogEl.showModal();
			// `showModal()` would otherwise focus the close button, which is
			// first in the markup so that a keyboard user reaches it before a
			// dialog's Delete rather than after. Focusing the first field
			// explicitly buys the natural tab order without giving up the
			// sensible starting point.
			dialogEl.querySelector<HTMLElement>('input, textarea, select')?.focus();
		} else if (!open && dialogEl.open) dialogEl.close();
	});

	// Backdrop click. The backdrop's hit area belongs to the <dialog> box
	// itself; all content lives in a child wrapper, so `e.target === dialogEl`
	// means "outside the content". Tracking mousedown as well as click stops a
	// text-selection drag that happens to end over the backdrop from closing
	// the modal.
	let pressedBackdrop = false;

	function onMouseDown(e: MouseEvent) {
		pressedBackdrop = e.target === dialogEl;
	}

	function onClick(e: MouseEvent) {
		if (pressedBackdrop && e.target === dialogEl) onClose();
		pressedBackdrop = false;
	}
</script>

<!-- Escape is the keyboard equivalent of the backdrop click below, and the
     browser provides it natively, so these pointer handlers need no keyboard
     counterpart of their own. -->
<dialog
	bind:this={dialogEl}
	class="panel text-ink relative m-auto w-[min(32rem,calc(100vw-2rem))] p-5 backdrop:bg-ink/40"
	aria-labelledby={titleId}
	data-testid={testid}
	onclose={onClose}
	onmousedown={onMouseDown}
	onclick={onClick}
>
	<!-- First in the markup, so tabbing forward reaches Close before a
	     dialog's Delete button rather than after it. The effect above moves
	     the initial focus to the first field, which is what `showModal()`
	     would otherwise have given to whatever came first here. -->
	<button
		type="button"
		class="btn btn-icon btn-danger-quiet absolute top-4 right-4 rounded"
		aria-label="Close"
		use:tooltip={'Close'}
		onclick={onClose}
	>
		<X class="size-4" />
	</button>
	<h2 id={titleId} class="text-ink pr-8 text-lg font-semibold tracking-tight">{title}</h2>
	<div class="mt-4">
		{@render children()}
	</div>
</dialog>

<script lang="ts">
	import Pencil from '@lucide/svelte/icons/pencil';
	import { tooltip } from '$lib/actions/tooltip';

	// Presentational only: a single Story card. The card is read-only (ADR
	// 0011) — editing and deleting both happen in the story dialog, which the
	// pencil opens. Drag is wired by the parent `story-dnd-zone` wrapper, not
	// here — this component knows nothing about `svelte-dnd-action`.
	interface Props {
		id: string;
		title: string;
		onEdit: () => void;
	}

	let { id, title, onEdit }: Props = $props();
</script>

<div
	class="group border-accent/50 bg-accent-soft text-ink flex cursor-grab items-start justify-between gap-2 rounded-md border px-2.5 py-2 text-sm shadow-xs transition hover:shadow-md active:cursor-grabbing"
	data-testid="story-{id}"
	aria-label={title}
>
	<span class="flex-1 leading-snug break-words">{title}</span>
	<!-- A button, not a whole-card click: `svelte-dnd-action` owns the card
	     body's pointer stream, and there is no click-vs-drag threshold to tell
	     a tap from the start of a drag. Staying a <button> also keeps it in
	     BoardViewport's INTERACTIVE_SELECTOR, so panning never steals it.

	     The hover-reveal is gated on `hover: hover`: a touch device never
	     fires `:hover`, so an ungated `opacity-0` would leave an invisible but
	     still tappable button on a card the user is trying to drag.
	     `.btn-icon` keeps the target at the WCAG 2.2 24x24 minimum. -->
	<button
		type="button"
		class="btn btn-icon btn-quiet rounded border-none bg-transparent group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0"
		aria-label="Edit story {title}"
		use:tooltip={'Edit story'}
		onclick={onEdit}
	>
		<Pencil class="size-3.5" />
	</button>
</div>

<script lang="ts">
	import Pencil from '@lucide/svelte/icons/pencil';
	import FileText from '@lucide/svelte/icons/file-text';
	import Link2 from '@lucide/svelte/icons/link-2';
	import { tooltip } from '$lib/actions/tooltip';

	// Presentational only: a single Story card. The card is read-only (ADR
	// 0011) — editing and deleting both happen in the story dialog, which the
	// pencil opens. Drag is wired by the parent `story-dnd-zone` wrapper, not
	// here — this component knows nothing about `svelte-dnd-action`.
	interface Props {
		id: string;
		title: string;
		onEdit: () => void;
		/** Opens the read-only detail dialog, the only place a description is
		 *  legible (ADR 0018). */
		onView: () => void;
		/**
		 * How many stories must come first (ADR 0019). Only this direction earns a
		 * badge: what a story *blocks* is legible from the other card, and a badge
		 * on both ends of every edge would mark most of a linked board.
		 *
		 * Optional because `DndStoryItem` fixtures predate it; absent means zero.
		 */
		blockedByCount?: number;
	}

	let { id, title, onEdit, onView, blockedByCount = 0 }: Props = $props();

	const blockedLabel = $derived(
		`Blocked by ${blockedByCount} ${blockedByCount === 1 ? 'story' : 'stories'}`
	);
</script>

<div
	class="group border-accent/50 bg-accent-soft text-ink flex cursor-grab items-start justify-between gap-2 rounded-md border px-2.5 py-2 text-sm shadow-xs transition hover:shadow-md active:cursor-grabbing"
	data-testid="story-{id}"
	aria-label={title}
>
	<span class="flex-1 leading-snug break-words">{title}</span>
	{#if blockedByCount > 0}
		<!-- A <span>, not a button: the board is read-only (ADR 0011) and the list
		     is already one click away behind the view trigger, so a third target
		     on a dense grid item buys nothing.

		     The testid deliberately does not start with `story-`. BoardViewport's
		     INTERACTIVE_SELECTOR is '[data-testid^="story-"], button, a', so that
		     prefix would make the pan handler treat this as a card and refuse to
		     pan from it. -->
		<span
			class="border-danger/25 bg-danger/8 text-danger inline-flex shrink-0 items-center gap-0.5 rounded border px-1 py-0.5 text-[0.7rem] font-medium"
			data-testid="deps-badge-{id}"
			aria-label={blockedLabel}
			use:tooltip={blockedLabel}
		>
			<Link2 class="size-3" />{blockedByCount}
		</span>
	{/if}
	<!-- Buttons, not a whole-card click: `svelte-dnd-action` owns the card
	     body's pointer stream, and there is no click-vs-drag threshold to tell
	     a tap from the start of a drag. Staying <button>s also keeps them in
	     BoardViewport's INTERACTIVE_SELECTOR, so panning never steals them.

	     Two triggers, because a description can only be read in the detail
	     dialog (ADR 0018) and editing must stay one click away — the pencil is
	     where it has always been.

	     The hover-reveal is gated on `hover: hover`: a touch device never
	     fires `:hover`, so an ungated `opacity-0` would leave an invisible but
	     still tappable button on a card the user is trying to drag.
	     `.btn-icon` keeps the target at the WCAG 2.2 24x24 minimum. -->
	<div class="flex shrink-0 items-center gap-0.5">
		<button
			type="button"
			class="btn btn-icon btn-quiet rounded border-none bg-transparent group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0"
			aria-label="View story {title}"
			use:tooltip={'View story'}
			onclick={onView}
		>
			<FileText class="size-3.5" />
		</button>
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
</div>

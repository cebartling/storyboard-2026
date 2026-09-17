<script lang="ts">
	import { STORY_STATUS_PRESENTATION } from '$lib/board/story-status';
	import { DEFAULT_STORY_STATUS } from '$lib/domain/story-map';
	import type { DndStoryItem } from './story-dnd-zone.svelte';

	// Presentational only: one cell's stories at the condensed density (ADR
	// 0022). Read-only by construction — a condensed band has no drop zone and
	// no "Add story", exactly as a collapsed one does not (ADR 0020), so this
	// component knows nothing about `svelte-dnd-action`.
	interface Props {
		stories: DndStoryItem[];
		stepId: string;
		sliceId: string;
		/** "Activity / Step, Release 1" — names the deck for a screen reader. */
		cellLabel: string;
		/** Opens the read-only detail dialog (ADR 0018), the only place a
		 *  condensed story's description is legible. */
		onViewStory: (storyId: string) => void;
	}

	let { stories, stepId, sliceId, cellLabel, onViewStory }: Props = $props();

	// How many card edges peek out behind the top one. Three is where the stack
	// stops reading as depth and starts reading as noise, and a deeper stack
	// would not change the count line underneath it anyway.
	const PEEK_DEPTH = 3;

	const countLabel = $derived(`${stories.length} ${stories.length === 1 ? 'story' : 'stories'}`);

	/** Pixel offsets of the card edges behind the top one, nearest edge first. */
	const peekOffsets = $derived(
		Array.from(
			{ length: Math.min(Math.max(stories.length - 1, 0), PEEK_DEPTH - 1) },
			(_, index) => (index + 1) * 4
		)
	);

	// A `$state` boolean rather than `group-hover:` alone, because a touch
	// device never fires `:hover` — the trap `story-card.svelte` guards its
	// hover-revealed buttons against with `[@media(hover:hover)]`. Here the
	// stack itself is a button, so a tap opens the same panel a hover does.
	//
	// The stack's click *opens*, and never toggles. A toggle cannot be reached
	// in the open state anyway — the panel covers the stack — and with a mouse
	// it could only ever fire after `pointerenter` had already opened the
	// panel, so its one effect would be to shut what hovering just opened. On
	// touch the ordering of `pointerleave` against `click` is the UA's to
	// decide, and an open-only click lands the same either way. Closing is
	// `pointerleave`'s job, or `focusout`'s once a tap has focused the button.
	let peeking = $state(false);

	/** Ignores focus moving between the panel's own buttons. */
	function closeOnFocusLeaving(event: FocusEvent & { currentTarget: HTMLElement }) {
		const next = event.relatedTarget;
		if (next instanceof Node && event.currentTarget.contains(next)) return;
		peeking = false;
	}

	function presentationFor(story: DndStoryItem) {
		return STORY_STATUS_PRESENTATION[story.status ?? DEFAULT_STORY_STATUS];
	}
</script>

<!-- The testids deliberately do not start with `story-`. BoardViewport's
     INTERACTIVE_SELECTOR is '[data-testid^="story-"], button, a', so that
     prefix would make the pan handler treat deck chrome as a card and refuse
     to pan from it — the same warning `story-card.svelte` carries for its
     status chip and dependency badge. -->
<div
	class="relative"
	data-testid="condensed-cell-{stepId}-{sliceId}"
	role="group"
	aria-label="{cellLabel}, condensed"
	onpointerenter={() => (peeking = true)}
	onpointerleave={() => (peeking = false)}
	onfocusin={() => (peeking = true)}
	onfocusout={closeOnFocusLeaving}
>
	<!-- The resting stack: the top story's card with the edges of the ones
	     behind it offset below and to the right. Its contents are decorative —
	     every story is reachable in the panel, so repeating the top one here as
	     its own target would double the tab stops for one cell. -->
	{#if stories.length > 0}
		{@const top = stories[0]}
		{@const topPresentation = presentationFor(top)}
		<button
			type="button"
			class="relative block w-full cursor-pointer text-left"
			style="margin-bottom: {peekOffsets.at(-1) ?? 0}px;"
			aria-label="Show the {countLabel} in {cellLabel}"
			aria-expanded={peeking}
			onclick={() => (peeking = true)}
		>
			<!-- The edges wear the top card's tint rather than the cell's own white:
			     a white box with a hairline border, offset a few pixels over a white
			     cell, is invisible, and an invisible stack is just a card.

			     `inset-0`, not `top-0 h-full`: the stack's height comes from the top
			     card, so a percentage height would resolve against an `auto` parent
			     and collapse every edge to nothing. -->
			{#each peekOffsets as offset (offset)}
				<span
					class="absolute inset-0 rounded-md border {topPresentation.card}"
					style="transform: translate({offset}px, {offset}px);"
					aria-hidden="true"
				></span>
			{/each}
			<span
				class="relative flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs {topPresentation.card}"
				aria-hidden="true"
			>
				<span class="text-ink flex-1 truncate">{top.title}</span>
				<span class={topPresentation.chip}>{topPresentation.label}</span>
			</span>
		</button>
	{/if}

	<p class="text-ink-muted px-2 py-1 text-xs" data-testid="condensed-count-{stepId}-{sliceId}">
		{countLabel}
	</p>

	<!-- Fanned out into an overlay rather than in flow: expanding the cell
	     itself would push every row below the pointer down as the viewer scans
	     the board, which is the opposite of what condensing it was for.

	     `opacity-0 pointer-events-none` rather than `hidden`, so the buttons
	     stay in the tab order — reaching one is what opens the panel for a
	     keyboard user.

	     `z-[5]` puts the panel over the neighbouring cells, which are all
	     `z-auto`, and under every sticky part of the grid: the row-label gutter
	     at `z-10`, the step and activity headers at `z-20`, the corner at
	     `z-30`. Matching a header's `z-20` would not tie — the cells are
	     emitted after the header rows, so the later node would win and a deck
	     peeked near the top of the board would paint over the headers. -->
	<div
		class="absolute inset-x-0 top-0 z-[5] flex flex-col gap-0.5 rounded-md border border-line bg-white p-1 shadow-lg transition-opacity {peeking
			? 'opacity-100'
			: 'pointer-events-none opacity-0'} {stories.length === 0 ? 'hidden' : ''}"
	>
		{#each stories as story (story.id)}
			{@const presentation = presentationFor(story)}
			<button
				type="button"
				class="text-ink flex w-full cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-left text-xs {presentation.card}"
				data-testid="deck-story-{story.id}"
				aria-label="View story {story.title}"
				onclick={() => onViewStory(story.id)}
			>
				<span class="flex-1 truncate">{story.title}</span>
				<!-- The chip stays: ADR 0021 rules out colour as the only carrier of
				     a status, and the panel is where a condensed story is read. -->
				<span class={presentation.chip} role="img" aria-label="Status: {presentation.label}">
					{presentation.label}
				</span>
			</button>
		{/each}
	</div>
</div>

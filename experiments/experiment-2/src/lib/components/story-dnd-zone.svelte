<script lang="ts" module>
	// The thin wrapper around `svelte-dnd-action` the plan calls for (step 8):
	// every other component and route deals only in these two shapes, never
	// in the library's own `DndEvent`/`TRIGGERS` types, so swapping the
	// library later (the plan names `@atlaskit/pragmatic-drag-and-drop` as
	// the fallback) stays contained to this one file.
	export interface DndStoryItem {
		id: string;
		title: string;
		description: string | null;
	}

	export interface MoveDetail {
		storyId: string;
		/** Target step id the card was dropped into. */
		stepId: string;
		/** Target slice id the card was dropped into, or null for the unsliced band. */
		sliceId: string | null;
		/** Neighbour ids already in the target scope, for the domain's rank math. */
		beforeId: string | null;
		afterId: string | null;
	}
</script>

<script lang="ts">
	import { dndzone, TRIGGERS, type DndEvent } from 'svelte-dnd-action';
	import StoryCard from './story-card.svelte';

	let {
		items,
		stepId,
		sliceId,
		zoneLabel,
		flipDurationMs = 150,
		onMove,
		onEditStory,
		onDragStateChange
	}: {
		items: DndStoryItem[];
		stepId: string;
		sliceId: string | null;
		/** Names the cell for `svelte-dnd-action`'s keyboard-drag announcements,
		 *  which read it off the zone's `aria-label`. */
		zoneLabel: string;
		flipDurationMs?: number;
		onMove: (detail: MoveDetail) => void;
		/** Passes the whole item up, so the page need not look it back up. */
		onEditStory: (item: DndStoryItem) => void;
		/**
		 * Called with `true` when a drag begins over this zone and `false` when it
		 * ends. The page uses it to suspend live refetching: a refetch mid-drag
		 * replaces the array `svelte-dnd-action` is animating and the card jumps
		 * out from under the pointer (ADR 0014 Stage 1).
		 */
		onDragStateChange?: (dragging: boolean) => void;
	} = $props();

	// Only the transitions are reported. `consider` fires continuously while a
	// card is over the zone, and the page does not need to hear about each one.
	let dragging = false;

	function reportDragging(next: boolean) {
		if (dragging === next) return;
		dragging = next;
		onDragStateChange?.(next);
	}

	// A writable derived: `svelte-dnd-action` needs to own the array during
	// consider/finalize, and the
	// server remains the source of truth — assigning here only overrides
	// until `items` itself changes again (e.g. after `invalidateAll()` reruns
	// `load()` with the server-authoritative order, which then wins).
	let localItems = $derived(items);

	function handleConsider(e: CustomEvent<DndEvent<DndStoryItem>>) {
		reportDragging(true);
		localItems = e.detail.items;
	}

	function handleFinalize(e: CustomEvent<DndEvent<DndStoryItem>>) {
		// Before the trigger check below: every zone the drag touched gets a
		// finalize, and each has to say it is done. Reporting only on
		// DROPPED_INTO_ZONE would leave the origin zone of a cross-zone drag
		// believing a drag was still in progress forever.
		reportDragging(false);
		localItems = e.detail.items;

		// Only the zone the card actually landed in should persist the move —
		// other zones touched during a cross-zone drag fire finalize too, but
		// with a different trigger (e.g. the origin zone sees
		// DROPPED_INTO_ANOTHER as the card leaves it).
		if (e.detail.info.trigger !== TRIGGERS.DROPPED_INTO_ZONE) return;

		const droppedId = e.detail.info.id;
		const index = localItems.findIndex((item) => item.id === droppedId);
		if (index === -1) return;

		onMove({
			storyId: droppedId,
			stepId,
			sliceId,
			beforeId: index > 0 ? localItems[index - 1].id : null,
			afterId: index < localItems.length - 1 ? localItems[index + 1].id : null
		});
	}
</script>

<div
	class="flex min-h-16 flex-col gap-1.5 rounded-lg border border-dashed p-1.5 transition-colors {localItems.length ===
	0
		? 'border-line/70'
		: 'border-transparent'}"
	data-testid="cell-{stepId}-{sliceId ?? 'unsliced'}"
	aria-label={zoneLabel}
	use:dndzone={{ items: localItems, flipDurationMs }}
	onconsider={handleConsider}
	onfinalize={handleFinalize}
>
	{#each localItems as item (item.id)}
		<StoryCard id={item.id} title={item.title} onEdit={() => onEditStory(item)} />
	{/each}
</div>

<script lang="ts" module>
	// The thin wrapper around `svelte-dnd-action` the plan calls for (step 8):
	// every other component and route deals only in these two shapes, never
	// in the library's own `DndEvent`/`TRIGGERS` types, so swapping the
	// library later (the plan names `@atlaskit/pragmatic-drag-and-drop` as
	// the fallback) stays contained to this one file.
	export interface DndStoryItem {
		id: string;
		title: string;
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
		flipDurationMs = 150,
		onMove
	}: {
		items: DndStoryItem[];
		stepId: string;
		sliceId: string | null;
		flipDurationMs?: number;
		onMove: (detail: MoveDetail) => void;
	} = $props();

	// A writable derived: `svelte-dnd-action` needs to own the array during
	// consider/finalize (see the proven pattern in src/routes/spike), and the
	// server remains the source of truth — assigning here only overrides
	// until `items` itself changes again (e.g. after `invalidateAll()` reruns
	// `load()` with the server-authoritative order, which then wins).
	let localItems = $derived(items);

	function handleConsider(e: CustomEvent<DndEvent<DndStoryItem>>) {
		localItems = e.detail.items;
	}

	function handleFinalize(e: CustomEvent<DndEvent<DndStoryItem>>) {
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
	use:dndzone={{ items: localItems, flipDurationMs }}
	onconsider={handleConsider}
	onfinalize={handleFinalize}
>
	{#each localItems as item (item.id)}
		<StoryCard id={item.id} title={item.title} />
	{/each}
</div>

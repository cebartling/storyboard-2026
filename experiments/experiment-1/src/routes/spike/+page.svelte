<script lang="ts">
	// THROWAWAY SPIKE — proves svelte-dnd-action works under Svelte 5 runes mode
	// and that Playwright can drive it. Not part of the real app. Delete before
	// wiring real drag-and-drop (see plan step 8).
	import { dndzone, type DndEvent } from 'svelte-dnd-action';

	type Card = { id: string; label: string };

	let columnA = $state<Card[]>([
		{ id: 'a1', label: 'Card A1' },
		{ id: 'a2', label: 'Card A2' },
		{ id: 'a3', label: 'Card A3' }
	]);

	let columnB = $state<Card[]>([
		{ id: 'b1', label: 'Card B1' },
		{ id: 'b2', label: 'Card B2' }
	]);

	const flipDurationMs = 150;

	function handleConsiderA(e: CustomEvent<DndEvent<Card>>) {
		columnA = e.detail.items;
	}
	function handleFinalizeA(e: CustomEvent<DndEvent<Card>>) {
		columnA = e.detail.items;
	}
	function handleConsiderB(e: CustomEvent<DndEvent<Card>>) {
		columnB = e.detail.items;
	}
	function handleFinalizeB(e: CustomEvent<DndEvent<Card>>) {
		columnB = e.detail.items;
	}
</script>

<h1>DnD spike</h1>

<div class="board">
	<div
		class="column"
		data-testid="column-a"
		use:dndzone={{ items: columnA, flipDurationMs }}
		onconsider={handleConsiderA}
		onfinalize={handleFinalizeA}
	>
		{#each columnA as card (card.id)}
			<div class="card" data-testid="card-{card.id}">{card.label}</div>
		{/each}
	</div>

	<div
		class="column"
		data-testid="column-b"
		use:dndzone={{ items: columnB, flipDurationMs }}
		onconsider={handleConsiderB}
		onfinalize={handleFinalizeB}
	>
		{#each columnB as card (card.id)}
			<div class="card" data-testid="card-{card.id}">{card.label}</div>
		{/each}
	</div>
</div>

<style>
	.board {
		display: flex;
		gap: 2rem;
		padding: 2rem;
	}
	.column {
		width: 200px;
		min-height: 300px;
		padding: 0.5rem;
		background: #eee;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.card {
		padding: 0.75rem;
		background: white;
		border: 1px solid #ccc;
		border-radius: 4px;
		cursor: grab;
	}
</style>

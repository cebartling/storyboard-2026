<script lang="ts">
	// Presentational only: a single Story card. Delete is a real form POST
	// (progressive enhancement); drag is wired by the parent `story-dnd-zone`
	// wrapper, not here — this component knows nothing about
	// `svelte-dnd-action`.
	interface Props {
		id: string;
		title: string;
	}

	let { id, title }: Props = $props();
</script>

<div class="story-card" data-testid="story-{id}">
	<span class="story-card-title">{title}</span>
	<form method="POST" action="?/deleteStory" class="story-card-delete-form">
		<input type="hidden" name="storyId" value={id} />
		<button type="submit" aria-label="Delete story {title}" title="Delete">×</button>
	</form>
</div>

<style>
	.story-card {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.5rem 0.6rem;
		background: white;
		border: 1px solid #ccc;
		border-radius: 4px;
		cursor: grab;
		font-size: 0.85rem;
	}

	.story-card-title {
		flex: 1;
		word-break: break-word;
	}

	.story-card-delete-form {
		margin: 0;
	}

	.story-card-delete-form button {
		border: none;
		background: none;
		cursor: pointer;
		color: #888;
		line-height: 1;
		font-size: 1rem;
	}

	.story-card-delete-form button:hover {
		color: darkred;
	}
</style>

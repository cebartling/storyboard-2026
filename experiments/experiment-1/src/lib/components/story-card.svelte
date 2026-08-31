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

<div
	class="group border-accent/50 bg-accent-soft text-ink flex cursor-grab items-start justify-between gap-2 rounded-md border px-2.5 py-2 text-sm shadow-xs transition hover:shadow-md active:cursor-grabbing"
	data-testid="story-{id}"
>
	<span class="flex-1 leading-snug break-words">{title}</span>
	<form method="POST" action="?/deleteStory" class="m-0">
		<input type="hidden" name="storyId" value={id} />
		<button
			type="submit"
			class="btn-danger-quiet -mt-0.5 rounded p-0.5 text-base leading-none opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
			aria-label="Delete story {title}"
			title="Delete">×</button
		>
	</form>
</div>

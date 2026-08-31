<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import StoryDndZone, { type MoveDetail } from '$lib/components/story-dnd-zone.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Drag persistence isn't a <form> submission (it's triggered by
	// `svelte-dnd-action`'s `finalize` event), so it POSTs the same
	// `?/moveStory` action directly via fetch and then reruns `load()` —
	// see documentation/adr/0008-form-actions-for-mutations.md and the
	// `moveStory` trace in architecture.md. The server's write is always the
	// source of truth for the resulting rank; a failed move just leaves the
	// board as `load()` last returned it once `invalidateAll()` reruns.
	async function handleMove(detail: MoveDetail) {
		const body = new FormData();
		body.set('storyId', detail.storyId);
		body.set('stepId', detail.stepId);
		body.set('sliceId', detail.sliceId ?? '');
		body.set('beforeId', detail.beforeId ?? '');
		body.set('afterId', detail.afterId ?? '');

		await fetch('?/moveStory', { method: 'POST', body });
		await invalidateAll();
	}
</script>

<h1>{data.board.name}</h1>

{#if form?.error}
	<p class="error">{form.error}</p>
{/if}

<form method="POST" action="?/addActivity" class="add-activity-form">
	<label for="new-activity-name">New activity</label>
	<input id="new-activity-name" name="name" type="text" required />
	<button type="submit">Add activity</button>
</form>

<form method="POST" action="?/createSlice" class="add-slice-form">
	<label for="new-slice-name">New slice</label>
	<input id="new-slice-name" name="name" type="text" required />
	<button type="submit">Add slice</button>
</form>

<div
	class="board"
	data-testid="board"
	style="grid-template-columns: max-content repeat({data.board
		.totalColumns}, minmax(220px, 1fr)); grid-template-rows: auto auto repeat({data.board.rows
		.length}, minmax(120px, auto));"
>
	{#each data.board.activityHeaders as activityHeader (activityHeader.activityId)}
		<div
			class="activity-header"
			data-testid="activity-{activityHeader.activityId}"
			style="grid-column: {activityHeader.gridColumnStart} / {activityHeader.gridColumnEnd}; grid-row: 1;"
		>
			<form method="POST" action="?/renameActivity" class="rename-form">
				<input type="hidden" name="activityId" value={activityHeader.activityId} />
				<input type="text" name="name" value={activityHeader.name} aria-label="Rename activity" />
				<button type="submit">Save</button>
			</form>
			<form method="POST" action="?/deleteActivity" class="delete-form">
				<input type="hidden" name="activityId" value={activityHeader.activityId} />
				<button type="submit">Delete activity</button>
			</form>
			<form method="POST" action="?/addStep" class="add-step-form">
				<input type="hidden" name="activityId" value={activityHeader.activityId} />
				<input type="text" name="name" placeholder="New step" required aria-label="New step name" />
				<button type="submit">Add step</button>
			</form>
		</div>
	{/each}

	{#if data.board.activityHeaders.length === 0}
		<p class="empty-hint" style="grid-column: 2; grid-row: 1;">No activities yet.</p>
	{/if}

	{#each data.board.columns as column (column.stepId)}
		<div
			class="step-header"
			data-testid="step-{column.stepId}"
			style="grid-column: {column.gridColumn}; grid-row: 2;"
		>
			<form method="POST" action="?/renameStep" class="rename-form">
				<input type="hidden" name="stepId" value={column.stepId} />
				<input type="text" name="name" value={column.name} aria-label="Rename step" />
				<button type="submit">Save</button>
			</form>
			<form method="POST" action="?/deleteStep" class="delete-form">
				<input type="hidden" name="stepId" value={column.stepId} />
				<button type="submit">Delete step</button>
			</form>
		</div>
	{/each}

	{#each data.board.rows as row (row.sliceId ?? 'unsliced')}
		<div
			class="row-label"
			data-testid="row-label-{row.sliceId ?? 'unsliced'}"
			style="grid-column: 1; grid-row: {row.gridRow};"
		>
			{#if row.sliceId}
				<form method="POST" action="?/renameSlice" class="rename-form">
					<input type="hidden" name="sliceId" value={row.sliceId} />
					<input type="text" name="name" value={row.name} aria-label="Rename slice" />
					<button type="submit">Save</button>
				</form>
				<form method="POST" action="?/deleteSlice" class="delete-form">
					<input type="hidden" name="sliceId" value={row.sliceId} />
					<button type="submit">Delete slice</button>
				</form>
			{:else}
				<span class="unsliced-label">{row.name}</span>
			{/if}
		</div>
	{/each}

	{#each data.board.cells as cell (`${cell.stepId}-${cell.sliceId ?? 'unsliced'}`)}
		<div class="cell" style="grid-column: {cell.gridColumn}; grid-row: {cell.gridRow};">
			<StoryDndZone
				items={cell.stories.map((s) => ({ id: s.id, title: s.title }))}
				stepId={cell.stepId}
				sliceId={cell.sliceId}
				onMove={handleMove}
			/>
			{#if cell.sliceId === null}
				<form method="POST" action="?/addStory" class="add-story-form">
					<input type="hidden" name="stepId" value={cell.stepId} />
					<input
						type="text"
						name="title"
						placeholder="New story"
						required
						aria-label="New story title"
					/>
					<button type="submit">Add story</button>
				</form>
			{/if}
		</div>
	{/each}
</div>

<style>
	.error {
		color: darkred;
	}

	.add-activity-form,
	.add-slice-form {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		margin-right: 1.5rem;
		margin-bottom: 1rem;
	}

	.board {
		display: grid;
		gap: 1px;
		background: #ddd;
		border: 1px solid #ddd;
		overflow-x: auto;
	}

	.activity-header,
	.step-header,
	.row-label,
	.cell {
		background: white;
		padding: 0.5rem;
	}

	.activity-header {
		background: #eef3fb;
		font-weight: 600;
	}

	.step-header {
		background: #f5f5f5;
	}

	.row-label {
		background: #f5f5f5;
		display: flex;
		align-items: center;
		font-weight: 600;
		white-space: nowrap;
	}

	.rename-form,
	.delete-form,
	.add-step-form,
	.add-story-form {
		display: flex;
		gap: 0.3rem;
		margin: 0.15rem 0;
	}

	.rename-form input[type='text'] {
		width: 9rem;
	}

	.empty-hint {
		color: #666;
	}
</style>

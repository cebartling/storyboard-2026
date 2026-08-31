<script lang="ts">
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import StoryDndZone, { type MoveDetail } from '$lib/components/story-dnd-zone.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let dragError = $state<string | null>(null);

	function actionError(data: unknown): string | null {
		if (typeof data !== 'object' || data === null || !('error' in data)) return null;
		return typeof data.error === 'string' ? data.error : null;
	}

	// Drag persistence isn't a <form> submission (it's triggered by
	// `svelte-dnd-action`'s `finalize` event), so it POSTs the same
	// `?/moveStory` action directly via fetch and then reruns `load()` —
	// see documentation/adr/0008-form-actions-for-mutations.md and the
	// `moveStory` trace in architecture.md. The server's write is always the
	// source of truth for the resulting rank; a failed move just leaves the
	// board as `load()` last returned it once `invalidateAll()` reruns.
	async function handleMove(detail: MoveDetail) {
		dragError = null;
		const body = new FormData();
		body.set('storyId', detail.storyId);
		body.set('stepId', detail.stepId);
		body.set('sliceId', detail.sliceId ?? '');
		body.set('beforeId', detail.beforeId ?? '');
		body.set('afterId', detail.afterId ?? '');

		try {
			const response = await fetch('?/moveStory', { method: 'POST', body });
			const result = deserialize(await response.text());
			if (result.type === 'failure') {
				dragError = actionError(result.data) ?? 'Failed to move story.';
			} else if (!response.ok || result.type === 'error') {
				dragError = 'Failed to move story.';
			}
		} catch {
			dragError = 'Unable to save the story move. Check your connection and try again.';
		} finally {
			await invalidateAll();
		}
	}
</script>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<h1>{data.board.name}</h1>
			<p class="text-ink-muted mt-1 text-sm">
				{data.board.columns.length} step{data.board.columns.length === 1 ? '' : 's'} ·
				{data.board.rows.length - 1} slice{data.board.rows.length - 1 === 1 ? '' : 's'}
			</p>
		</div>

		<div class="flex flex-wrap items-end gap-3">
			<form method="POST" action="?/addActivity" class="flex flex-col gap-1.5">
				<label for="new-activity-name" class="field-label">New activity</label>
				<div class="flex gap-2">
					<input
						id="new-activity-name"
						name="name"
						type="text"
						required
						class="input w-44"
						placeholder="e.g. Browse"
					/>
					<button type="submit" class="btn btn-primary">Add activity</button>
				</div>
			</form>

			<form method="POST" action="?/createSlice" class="flex flex-col gap-1.5">
				<label for="new-slice-name" class="field-label">New slice</label>
				<div class="flex gap-2">
					<input
						id="new-slice-name"
						name="name"
						type="text"
						required
						class="input w-44"
						placeholder="e.g. Release 1"
					/>
					<button type="submit" class="btn btn-quiet">Add slice</button>
				</div>
			</form>
		</div>
	</div>

	{#if dragError ?? form?.error}
		<p class="error" role="alert">{dragError ?? form?.error}</p>
	{/if}

	<div class="panel overflow-x-auto p-0">
		<div
			class="bg-line grid min-w-max gap-px"
			data-testid="board"
			style="grid-template-columns: max-content repeat({data.board
				.totalColumns}, minmax(240px, 1fr)); grid-template-rows: auto auto repeat({data.board.rows
				.length}, minmax(140px, auto));"
		>
			<div class="sticky left-0 z-20 bg-slate-50" style="grid-column: 1; grid-row: 1 / 3;"></div>

			{#each data.board.activityHeaders as activityHeader (activityHeader.activityId)}
				<div
					class="bg-brand-soft flex flex-col gap-2 p-3"
					data-testid="activity-{activityHeader.activityId}"
					style="grid-column: {activityHeader.gridColumnStart} / {activityHeader.gridColumnEnd}; grid-row: 1;"
				>
					<div class="flex flex-wrap items-center gap-2">
						<form method="POST" action="?/renameActivity" class="flex gap-1.5">
							<input type="hidden" name="activityId" value={activityHeader.activityId} />
							<input
								type="text"
								name="name"
								value={activityHeader.name}
								aria-label="Rename activity"
								class="input w-40 font-semibold"
							/>
							<button type="submit" class="btn btn-quiet">Save</button>
						</form>
						<form method="POST" action="?/deleteActivity">
							<input type="hidden" name="activityId" value={activityHeader.activityId} />
							<button type="submit" class="btn btn-danger-quiet px-1.5 text-xs"
								>Delete activity</button
							>
						</form>
					</div>
					<form method="POST" action="?/addStep" class="flex gap-1.5">
						<input
							type="text"
							name="name"
							placeholder="New step"
							required
							aria-label="New step name"
							class="input w-40"
						/>
						<input type="hidden" name="activityId" value={activityHeader.activityId} />
						<button type="submit" class="btn btn-quiet">Add step</button>
					</form>
				</div>
			{/each}

			{#if data.board.activityHeaders.length === 0}
				<p class="text-ink-muted bg-white p-6 text-sm" style="grid-column: 2; grid-row: 1;">
					No activities yet.
				</p>
			{/if}

			{#each data.board.columns as column (column.stepId)}
				<div
					class="flex flex-wrap items-center gap-2 bg-slate-50 p-3"
					data-testid="step-{column.stepId}"
					style="grid-column: {column.gridColumn}; grid-row: 2;"
				>
					<form method="POST" action="?/renameStep" class="flex gap-1.5">
						<input type="hidden" name="stepId" value={column.stepId} />
						<input
							type="text"
							name="name"
							value={column.name}
							aria-label="Rename step"
							class="input w-36"
						/>
						<button type="submit" class="btn btn-quiet">Save</button>
					</form>
					<form method="POST" action="?/deleteStep">
						<input type="hidden" name="stepId" value={column.stepId} />
						<button type="submit" class="btn btn-danger-quiet px-1.5 text-xs">Delete step</button>
					</form>
				</div>
			{/each}

			{#each data.board.rows as row (row.sliceId ?? 'unsliced')}
				<div
					class="sticky left-0 z-10 flex flex-col justify-center gap-2 bg-slate-50 p-3"
					data-testid="row-label-{row.sliceId ?? 'unsliced'}"
					style="grid-column: 1; grid-row: {row.gridRow};"
				>
					{#if row.sliceId}
						<form method="POST" action="?/renameSlice" class="flex gap-1.5">
							<input type="hidden" name="sliceId" value={row.sliceId} />
							<input
								type="text"
								name="name"
								value={row.name}
								aria-label="Rename slice"
								class="input w-36 font-semibold"
							/>
							<button type="submit" class="btn btn-quiet">Save</button>
						</form>
						<form method="POST" action="?/deleteSlice">
							<input type="hidden" name="sliceId" value={row.sliceId} />
							<button type="submit" class="btn btn-danger-quiet self-start px-1.5 text-xs"
								>Delete slice</button
							>
						</form>
					{:else}
						<span
							class="text-ink-muted text-xs font-semibold tracking-wide whitespace-nowrap uppercase"
							>{row.name}</span
						>
					{/if}
				</div>
			{/each}

			{#each data.board.cells as cell (`${cell.stepId}-${cell.sliceId ?? 'unsliced'}`)}
				<div
					class="flex flex-col gap-2 bg-white p-1.5"
					style="grid-column: {cell.gridColumn}; grid-row: {cell.gridRow};"
				>
					<StoryDndZone
						items={cell.stories.map((s) => ({ id: s.id, title: s.title }))}
						stepId={cell.stepId}
						sliceId={cell.sliceId}
						onMove={handleMove}
					/>
					{#if cell.sliceId === null}
						<form method="POST" action="?/addStory" class="flex gap-1.5 px-1.5 pb-1">
							<input type="hidden" name="stepId" value={cell.stepId} />
							<input
								type="text"
								name="title"
								placeholder="New story"
								required
								aria-label="New story title"
								class="input"
							/>
							<button type="submit" class="btn btn-quiet">Add story</button>
						</form>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>

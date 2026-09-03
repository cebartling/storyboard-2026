<script lang="ts">
	import { tick } from 'svelte';
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import BoardDialogs, {
		actionError,
		type BoardDialog
	} from '$lib/components/board-dialogs.svelte';
	import BoardMinimap from '$lib/components/board-minimap.svelte';
	import BoardViewport from '$lib/components/board-viewport.svelte';
	import StoryDndZone, {
		type DndStoryItem,
		type MoveDetail
	} from '$lib/components/story-dnd-zone.svelte';
	import ZoomControls from '$lib/components/zoom-controls.svelte';
	import { createCamera } from '$lib/canvas/camera.svelte';
	import { persistCamera } from '$lib/canvas/camera-persistence.svelte';
	import { toMinimapModel } from '$lib/canvas/minimap-model';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import { tooltip } from '$lib/actions/tooltip';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// The board's own error line. Nothing populates SvelteKit's `form` prop
	// any more — every board form is enhanced with `applyAction` suppressed
	// (ADR 0011) — so this is the sole source. It carries the two failures
	// that have nowhere better to go: a drag that the server rejected, and a
	// dialog submission whose result arrived after the user closed it.
	let boardError = $state<string | null>(null);

	// The board itself is read-only (ADR 0011); every mutation happens in the
	// dialog this drives. Rendered as a sibling of `BoardViewport`, never an
	// ancestor of a dnd zone — `svelte-dnd-action` picks its drag-mirror
	// parent with `originDropZone.closest('dialog')`, so a modal wrapping the
	// board would relocate the mirror (see ADR 0010).
	let dialog = $state<BoardDialog | null>(null);

	// The board's banner is cleared when an editor opens, the same way
	// `BoardDialogs` clears its own error on that transition. Only a drag reset
	// it before, so a late failure could sit above a board the user had since
	// edited successfully several times over, contradicting what they could
	// see. Opening an editor is the next deliberate thing they do, and the
	// message has had its moment by then.
	$effect(() => {
		if (dialog) boardError = null;
	});
	const camera = createCamera();
	const minimapModel = $derived(toMinimapModel(data.board));

	// --- Camera persistence (ADR 0010) ---------------------------------------
	// Restore, debounced save, and flush-on-exit live in
	// `src/lib/canvas/camera-persistence.svelte.ts`: canvas infrastructure with
	// three non-obvious ordering rules, not page wiring (finding A11).
	persistCamera(camera, () => data.board.id);

	let boardViewport: ReturnType<typeof BoardViewport> | undefined = $state();

	// Row 1 (activity headers) and row 2 (step headers) are both `sticky
	// top-*` so column context survives vertical scrolling, but their heights
	// are content-dependent (see ADR 0010: track sizes stay `minmax(...)`, so
	// they cannot be known statically). Row 2's sticky offset is measured from
	// row 1's rendered height rather than hard-coded, so it settles directly
	// beneath row 1 instead of overlapping it; both together give the band the
	// content rows have to stay clear of when something is scrolled into view.
	// `bind:this` writes `null` on teardown, and a keyed-each removal leaves
	// that slot behind, so the element type has to admit it — `undefined` alone
	// let a `null` reach `observer.observe()` and crash the effect below.
	let activityHeaderEls: (HTMLDivElement | null | undefined)[] = $state([]);
	let activityHeaderHeight = $state(0);
	let stepHeaderEls: (HTMLDivElement | null | undefined)[] = $state([]);
	let stepHeaderHeight = $state(0);

	/**
	 * Keeps `set` fed with the tallest of `getEls()`. Called once per sticky
	 * row during initialisation, so the `$effect` it creates is a normal
	 * component effect.
	 */
	function trackMaxHeight(
		getEls: () => (HTMLDivElement | null | undefined)[],
		set: (height: number) => void
	) {
		$effect(() => {
			const els = getEls().filter((el): el is HTMLDivElement => el != null);
			if (els.length === 0) {
				set(0);
				return;
			}
			const measure = () => set(Math.max(...els.map((el) => el.offsetHeight)));
			const observer = new ResizeObserver(measure);
			els.forEach((el) => observer.observe(el));
			measure();
			return () => observer.disconnect();
		});
	}

	trackMaxHeight(
		() => activityHeaderEls,
		(h) => (activityHeaderHeight = h)
	);
	trackMaxHeight(
		() => stepHeaderEls,
		(h) => (stepHeaderHeight = h)
	);

	// Published to the grid as a custom property and consumed by `.board-cell`
	// in app.css: the sticky rows float over the content rows, so a card or a
	// button scrolled into view — by `scrollIntoView`, by the browser
	// following keyboard focus, or by a test harness — has to stop below them
	// instead of at the container's edge, where the headers are.
	const stickyHeaderHeight = $derived(activityHeaderHeight + stepHeaderHeight);

	// The add-story dialog tells the user which cell it is adding to; the cell
	// itself only carries ids.
	const stepNames = $derived(
		new Map<string, string>(data.board.columns.map((c) => [c.stepId, c.name]))
	);
	const rowNames = $derived(
		new Map<string | null, string>(data.board.rows.map((r) => [r.sliceId, r.name]))
	);

	function cellLabel(stepId: string, sliceId: string | null): string {
		return `${stepNames.get(stepId) ?? 'step'} · ${rowNames.get(sliceId) ?? 'Unsliced'}`;
	}

	function handleEditStory(item: DndStoryItem) {
		dialog = {
			kind: 'editStory',
			storyId: item.id,
			title: item.title,
			description: item.description
		};
	}

	// Drag persistence isn't a <form> submission (it's triggered by
	// `svelte-dnd-action`'s `finalize` event), so it POSTs the same
	// `?/moveStory` action directly via fetch and then reruns `load()` —
	// see documentation/adr/0008-form-actions-for-mutations.md and the
	// `moveStory` trace in architecture.md. The server's write is always the
	// source of truth for the resulting rank; a failed move just leaves the
	// board as `load()` last returned it once `invalidateAll()` reruns.
	async function handleMove(detail: MoveDetail) {
		boardError = null;
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
				boardError = actionError(result.data) ?? 'Failed to move story.';
			} else if (!response.ok || result.type === 'error') {
				boardError = 'Failed to move story.';
			}
		} catch {
			boardError = 'Unable to save the story move. Check your connection and try again.';
		} finally {
			await invalidateAll();
		}
	}
</script>

<div class="flex h-[calc(100vh-11rem)] min-h-0 flex-col gap-6">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<h1>{data.board.name}</h1>
			<p class="text-ink-muted mt-1 text-sm">
				{data.board.columns.length} step{data.board.columns.length === 1 ? '' : 's'} ·
				{data.board.rows.length - 1} slice{data.board.rows.length - 1 === 1 ? '' : 's'}
			</p>
		</div>

		<div class="flex flex-wrap items-end gap-2">
			<button
				type="button"
				class="btn btn-primary"
				onclick={() => (dialog = { kind: 'addActivity' })}
			>
				Add activity
			</button>
			<button type="button" class="btn btn-quiet" onclick={() => (dialog = { kind: 'addSlice' })}>
				Add slice
			</button>
		</div>
	</div>

	{#if boardError}
		<p class="error" role="alert">{boardError}</p>
	{/if}

	<div class="panel relative flex min-h-0 flex-1 flex-col overflow-hidden">
		<div class="pointer-events-none absolute right-4 bottom-4 z-40">
			<ZoomControls {camera} />
		</div>
		<div class="pointer-events-auto absolute bottom-4 left-4 z-40">
			<BoardMinimap {camera} model={minimapModel} />
		</div>
		<BoardViewport bind:this={boardViewport} {camera}>
			<div
				class="bg-line grid min-w-max gap-px"
				data-testid="board"
				style="grid-template-columns: max-content repeat({data.board
					.totalColumns}, minmax(240px, 1fr)); grid-template-rows: auto auto repeat({data.board.rows
					.length}, minmax(140px, auto)); --board-sticky-header-height: {stickyHeaderHeight}px;"
			>
				<div
					class="sticky top-0 left-0 z-30 bg-surface"
					style="grid-column: 1; grid-row: 1 / 3;"
				></div>

				{#each data.board.activityHeaders as activityHeader, i (activityHeader.activityId)}
					<div
						bind:this={activityHeaderEls[i]}
						class="bg-brand-soft sticky top-0 z-20 flex flex-col gap-2 p-3"
						data-testid="activity-{activityHeader.activityId}"
						style="grid-column: {activityHeader.gridColumnStart} / {activityHeader.gridColumnEnd}; grid-row: 1;"
					>
						<div class="flex flex-wrap items-center gap-2">
							<h2 class="text-ink flex-1 text-sm font-semibold break-words">
								{activityHeader.name}
							</h2>
							<button
								type="button"
								class="btn btn-icon btn-quiet"
								aria-label="Edit activity"
								use:tooltip={'Edit activity'}
								onclick={() =>
									(dialog = {
										kind: 'editActivity',
										activityId: activityHeader.activityId,
										name: activityHeader.name
									})}
							>
								<Pencil class="size-3.5" />
							</button>
						</div>
						<button
							type="button"
							class="btn btn-quiet self-start px-2 text-xs"
							onclick={() =>
								(dialog = {
									kind: 'addStep',
									activityId: activityHeader.activityId,
									activityName: activityHeader.name
								})}
						>
							<Plus class="size-3.5" />
							Add step
						</button>
					</div>
				{/each}

				{#if data.board.activityHeaders.length === 0}
					<p class="text-ink-muted bg-white p-6 text-sm" style="grid-column: 2; grid-row: 1;">
						No activities yet.
					</p>
				{/if}

				{#each data.board.columns as column, i (column.stepId)}
					<div
						bind:this={stepHeaderEls[i]}
						class="sticky z-20 flex flex-wrap items-center gap-2 bg-surface p-3"
						data-testid="step-{column.stepId}"
						style="grid-column: {column.gridColumn}; grid-row: 2; top: {activityHeaderHeight}px;"
					>
						<span class="text-ink flex-1 text-sm font-medium break-words">{column.name}</span>
						<!-- Same pencil as the story card: the header is mostly the step
						     name, and a full-width text button crowded it out. `.btn-icon`
						     holds the WCAG 2.2 24x24 target. -->
						<button
							type="button"
							class="btn btn-icon btn-quiet"
							aria-label="Edit step"
							use:tooltip={'Edit step'}
							onclick={() =>
								(dialog = { kind: 'editStep', stepId: column.stepId, name: column.name })}
						>
							<Pencil class="size-3.5" />
						</button>
					</div>
				{/each}

				{#each data.board.rows as row (row.sliceId ?? 'unsliced')}
					<div
						class="sticky left-0 z-10 flex flex-col justify-center gap-2 bg-surface p-3"
						data-testid="row-label-{row.sliceId ?? 'unsliced'}"
						style="grid-column: 1; grid-row: {row.gridRow};"
					>
						{#if row.sliceId}
							<span class="text-ink text-sm font-semibold break-words">{row.name}</span>
							<button
								type="button"
								class="btn btn-icon btn-quiet self-start"
								aria-label="Edit slice"
								use:tooltip={'Edit slice'}
								onclick={() =>
									(dialog = { kind: 'editSlice', sliceId: row.sliceId!, name: row.name })}
							>
								<Pencil class="size-3.5" />
							</button>
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
						class="board-cell flex flex-col gap-2 bg-white p-1.5"
						style="grid-column: {cell.gridColumn}; grid-row: {cell.gridRow};"
					>
						<!-- Every cell, not just the unsliced band: adding straight
						     into a release slice was impossible with the old inline
						     form, which only existed on the unsliced row.

						     Above the cards rather than below them: the board's
						     corner overlays (minimap, zoom controls) sit over the
						     bottom of the panel, and on a board with no overflow
						     there is no way to scroll a control out from under
						     them. -->
						<button
							type="button"
							class="btn btn-quiet self-start px-2 text-xs"
							data-testid="add-story-{cell.stepId}-{cell.sliceId ?? 'unsliced'}"
							aria-label="Add story to {cellLabel(cell.stepId, cell.sliceId)}"
							onclick={() =>
								(dialog = {
									kind: 'addStory',
									stepId: cell.stepId,
									sliceId: cell.sliceId,
									scopeLabel: cellLabel(cell.stepId, cell.sliceId)
								})}
						>
							<Plus class="size-3.5" />
							Add story
						</button>
						<StoryDndZone
							zoneLabel={cellLabel(cell.stepId, cell.sliceId)}
							items={cell.stories}
							stepId={cell.stepId}
							sliceId={cell.sliceId}
							onMove={handleMove}
							onEditStory={handleEditStory}
						/>
					</div>
				{/each}
			</div>
		</BoardViewport>
	</div>
</div>

<BoardDialogs
	{dialog}
	onClose={async (outcome) => {
		dialog = null;
		// A delete removes the trigger the dialog would have restored focus to,
		// so focus falls to <body>. The viewport is the region the deletion
		// happened in and is already keyboard-focusable, so it is both a
		// truthful place to land and one where arrow keys still scroll the
		// board (finding F3).
		// After the flush, not before: closing a native <dialog> restores focus
		// to whatever opened it, so focusing first would just be overwritten.
		if (outcome?.deleted) {
			await tick();
			boardViewport?.focusViewport();
		}
	}}
	onLateFailure={(message) => (boardError = message)}
/>

<script lang="ts">
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
	import { loadCameraState, saveCameraState } from '$lib/canvas/camera-storage';
	import { toMinimapModel } from '$lib/canvas/minimap-model';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let dragError = $state<string | null>(null);

	// The board itself is read-only (ADR 0011); every mutation happens in the
	// dialog this drives. Rendered as a sibling of `BoardViewport`, never an
	// ancestor of a dnd zone — `svelte-dnd-action` picks its drag-mirror
	// parent with `originDropZone.closest('dialog')`, so a modal wrapping the
	// board would relocate the mirror (see ADR 0010).
	let dialog = $state<BoardDialog | null>(null);
	const camera = createCamera();
	const minimapModel = $derived(toMinimapModel(data.board));

	// --- Camera persistence (ADR 0010) ---------------------------------------
	//
	// Reads/writes go through `localStorage` only inside `$effect`, which never
	// runs during SSR, so there is no server/client mismatch to guard against.
	// `hydratedMapId` gates both effects below: the hydrate effect runs once
	// per map id (once the board's natural size is known, so `fit()` has real
	// numbers to work with), and the save effect stays silent until hydration
	// for the *current* map has completed, so it never clobbers a saved state
	// with the pre-restore zoom/scroll of 1/0/0.
	let hydratedMapId = $state<string | null>(null);

	/** `localStorage` can throw merely on access in some locked-down browsers. */
	function tryGetLocalStorage(): Storage | null {
		try {
			return localStorage;
		} catch {
			return null;
		}
	}

	$effect(() => {
		const mapId = data.board.id;
		// Both sizes are reported by independent ResizeObservers in
		// BoardViewport and can settle a tick apart; waiting for both avoids
		// computing `fit()` against a viewport that has not been measured yet
		// (which would divide by ~0 and land on the minimum zoom step).
		const sizeReady =
			camera.worldWidth > 0 &&
			camera.worldHeight > 0 &&
			camera.viewWidth > 0 &&
			camera.viewHeight > 0;
		if (!sizeReady || hydratedMapId === mapId) return;

		const storage = tryGetLocalStorage();
		const saved = storage ? loadCameraState(storage, mapId) : null;
		if (saved) {
			// Apply zoom first; the scroll extents the world element reports
			// only reflect the new `zoom` after the browser reflows it, so the
			// matching scroll is applied a frame later (also re-clamped there,
			// in case the board has shrunk since this was saved).
			camera.restoreZoom(saved.zoom);
			requestAnimationFrame(() => camera.panTo(saved.scrollX, saved.scrollY));
		} else {
			camera.fit();
		}
		hydratedMapId = mapId;
	});

	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const mapId = data.board.id;
		const state = { zoom: camera.zoom, scrollX: camera.scrollX, scrollY: camera.scrollY };
		if (hydratedMapId !== mapId) return;

		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			const storage = tryGetLocalStorage();
			if (storage) saveCameraState(storage, mapId, state);
		}, 250);
		return () => clearTimeout(saveTimer);
	});

	// Row 1 (activity headers) and row 2 (step headers) are both `sticky
	// top-*` so column context survives vertical scrolling, but their heights
	// are content-dependent (see ADR 0010: track sizes stay `minmax(...)`, so
	// they cannot be known statically). Row 2's sticky offset is measured from
	// row 1's rendered height rather than hard-coded, so it settles directly
	// beneath row 1 instead of overlapping it; both together give the band the
	// content rows have to stay clear of when something is scrolled into view.
	let activityHeaderEls: (HTMLDivElement | undefined)[] = $state([]);
	let activityHeaderHeight = $state(0);
	let stepHeaderEls: (HTMLDivElement | undefined)[] = $state([]);
	let stepHeaderHeight = $state(0);

	/**
	 * Keeps `set` fed with the tallest of `getEls()`. Called once per sticky
	 * row during initialisation, so the `$effect` it creates is a normal
	 * component effect.
	 */
	function trackMaxHeight(
		getEls: () => (HTMLDivElement | undefined)[],
		set: (height: number) => void
	) {
		$effect(() => {
			const els = getEls().filter((el): el is HTMLDivElement => el !== undefined);
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

	{#if dragError ?? form?.error}
		<p class="error" role="alert">{dragError ?? form?.error}</p>
	{/if}

	<div class="panel relative flex min-h-0 flex-1 flex-col overflow-hidden">
		<div class="pointer-events-none absolute right-4 bottom-4 z-40">
			<ZoomControls {camera} />
		</div>
		<div class="pointer-events-auto absolute bottom-4 left-4 z-40">
			<BoardMinimap {camera} model={minimapModel} />
		</div>
		<BoardViewport {camera}>
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
								class="btn btn-quiet px-1.5 text-xs"
								onclick={() =>
									(dialog = {
										kind: 'editActivity',
										activityId: activityHeader.activityId,
										name: activityHeader.name
									})}
							>
								Edit activity
							</button>
						</div>
						<button
							type="button"
							class="btn btn-quiet self-start px-1.5 text-xs"
							onclick={() =>
								(dialog = {
									kind: 'addStep',
									activityId: activityHeader.activityId,
									activityName: activityHeader.name
								})}
						>
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
						<button
							type="button"
							class="btn btn-quiet px-1.5 text-xs"
							onclick={() =>
								(dialog = { kind: 'editStep', stepId: column.stepId, name: column.name })}
						>
							Edit step
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
								class="btn btn-quiet self-start px-1.5 text-xs"
								onclick={() =>
									(dialog = { kind: 'editSlice', sliceId: row.sliceId!, name: row.name })}
							>
								Edit slice
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
							class="btn btn-quiet self-start px-1.5 text-xs"
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
							+ Add story
						</button>
						<StoryDndZone
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

<BoardDialogs {dialog} onClose={() => (dialog = null)} />

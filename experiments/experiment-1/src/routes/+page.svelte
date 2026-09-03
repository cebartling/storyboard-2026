<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Modal from '$lib/components/modal.svelte';
	import { tooltip } from '$lib/actions/tooltip';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Deleting a map takes its whole board with it and cannot be undone, so it
	// asks first — and the dialog names the map, since a confirmation that does
	// not say what it is about is not really a confirmation (ADR 0011: the
	// dialog *is* the confirmation step).
	let pendingDelete: { id: string; name: string } | null = $state(null);
	let deleting = $state(false);

	const confirmDelete: SubmitFunction = () => {
		deleting = true;
		return async ({ update }) => {
			await update({ reset: false });
			await invalidateAll();
			deleting = false;
			// Closed after the refetch, so the list behind it is already correct.
			pendingDelete = null;
		};
	};
</script>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-6">
	<div>
		<h1>Story maps</h1>
		<p class="text-ink-muted mt-1 text-sm">
			Each map is a board of activities, steps, and release slices.
		</p>
	</div>

	{#if form?.error}
		<p class="error">{form.error}</p>
	{/if}

	{#if data.maps.length === 0}
		<div class="panel text-ink-muted border-dashed px-6 py-10 text-center text-sm">
			No story maps yet. Create your first one below.
		</div>
	{:else}
		<ul class="panel divide-line divide-y overflow-hidden">
			{#each data.maps as map (map.id)}
				<li>
					<div class="hover:bg-brand-soft group flex items-center gap-2 pr-3 transition">
						<a
							href={resolve('/maps/[mapId]', { mapId: map.id })}
							class="flex flex-1 items-center justify-between gap-4 px-5 py-3.5"
						>
							<span class="text-ink group-hover:text-brand text-sm font-medium">{map.name}</span>
							<span class="text-ink-muted group-hover:text-brand text-sm" aria-hidden="true">→</span
							>
						</a>
						<button
							type="button"
							class="btn btn-icon btn-danger-quiet"
							aria-label="Delete {map.name}"
							use:tooltip={'Delete map'}
							onclick={() => (pendingDelete = { id: map.id, name: map.name })}
						>
							<Trash2 class="size-3.5" />
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	<form method="POST" action="?/createMap" class="panel flex flex-col gap-2 p-5">
		<label for="name" class="field-label">New map name</label>
		<div class="flex gap-2">
			<input
				id="name"
				name="name"
				type="text"
				required
				placeholder="e.g. Checkout redesign"
				class="input"
			/>
			<button type="submit" class="btn btn-primary">Create map</button>
		</div>
	</form>
</div>

<Modal
	open={pendingDelete !== null}
	title="Delete map"
	testid="delete-map-dialog"
	onClose={() => (pendingDelete = null)}
>
	{#if pendingDelete}
		<form
			method="POST"
			action="?/deleteMap"
			use:enhance={confirmDelete}
			class="flex flex-col gap-4"
		>
			<input type="hidden" name="mapId" value={pendingDelete.id} />
			<p class="text-ink text-sm">
				Delete <strong>{pendingDelete.name}</strong> and everything on its board? This cannot be undone.
			</p>
			<div class="flex justify-end gap-2">
				<button type="button" class="btn btn-quiet" onclick={() => (pendingDelete = null)}>
					Cancel
				</button>
				<button type="submit" class="btn btn-danger" disabled={deleting}>Delete map</button>
			</div>
		</form>
	{/if}
</Modal>

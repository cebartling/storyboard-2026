<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { useMapSync } from '$lib/collab/map-sync-lifecycle.svelte';
	import { actionError } from '$lib/components/board-dialogs.svelte';
	import type { ClientId, GlossaryEntryId } from '$lib/domain/ids';
	import { filterEntries } from '$lib/glossary/glossary-list';
	import { tooltip } from '$lib/actions/tooltip';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// ---------------------------------------------------------------------
	// Live collaboration (ADR 0014), as on the board: a glossary write from
	// either page reaches viewers of both, because both publish to one hub.
	// ---------------------------------------------------------------------

	const clientId = crypto.randomUUID() as ClientId;
	const mapSync = useMapSync({
		mapId: () => data.mapId,
		version: () => data.version,
		clientId,
		refetch: invalidateAll
	});
	const sync = $derived(mapSync.current);
	$effect(() => {
		sync?.observe(data.version);
	});

	// ---------------------------------------------------------------------
	// Filter
	// ---------------------------------------------------------------------

	let query = $state('');
	const visible = $derived(filterEntries(data.entries, query));

	// ---------------------------------------------------------------------
	// Forms
	// ---------------------------------------------------------------------

	// Bound rather than seeded with `value=`: a refetch from someone else's
	// change re-renders the page, and an attribute would put the stored text
	// back over what this person is typing.
	let addTerm = $state('');
	let addDefinition = $state('');
	let addError = $state<string | null>(null);

	/**
	 * The one entry being edited, with the version its form was opened at.
	 * Snapshotted at open, like a board dialog (ADR 0014 §3), so a concurrent
	 * change to the map turns this Save into a 409 rather than a silent overwrite.
	 * `openedTerm` names the entry if it is deleted mid-edit: `term` is bound to
	 * the field, so by then it holds whatever was typed.
	 */
	let editing = $state<{
		id: GlossaryEntryId;
		term: string;
		definition: string;
		openedTerm: string;
		openedAtVersion: number;
	} | null>(null);
	let editError = $state<string | null>(null);

	// Somebody else deleted the entry under an open editor. Saving could only
	// fail, so say why instead of letting the person find out by trying.
	const editingGone = $derived(editing !== null && !data.entries.some((e) => e.id === editing?.id));

	let deleteError = $state<string | null>(null);
	let submitting = $state(false);

	/**
	 * Focuses `id` once the DOM has caught up. The control that was clicked has
	 * just left the DOM, so focus would otherwise fall to <body>; the filter is
	 * the fallback for a target that has gone too (deleted, or filtered out).
	 */
	async function focusAfterRender(id: string) {
		await tick();
		(document.getElementById(id) ?? document.getElementById('glossary-filter'))?.focus();
	}

	function startEditing(entry: { id: GlossaryEntryId; term: string; definition: string }) {
		editing = { ...entry, openedTerm: entry.term, openedAtVersion: data.version };
		editError = null;
		void focusAfterRender('glossary-edit-term');
	}

	function stopEditing() {
		const id = editing?.id;
		editing = null;
		if (id) void focusAfterRender(`glossary-edit-${id}`);
	}

	/**
	 * One enhance handler for all three forms; they differ only in where the
	 * outcome lands. Returning a callback suppresses `applyAction`, so this page
	 * owns its errors, and `invalidateAll()` replaces the navigation it would
	 * have done — the same shape as `board-dialogs.svelte`'s `submit`.
	 */
	function submitWith(handlers: {
		onSuccess: () => void;
		onFailure: (message: string) => void;
		onConflict?: () => void;
	}): SubmitFunction {
		return ({ formData }) => {
			submitting = true;
			formData.set('clientId', clientId);
			const submittedVersion = Number(formData.get('version'));
			return async ({ result }) => {
				if (result.type === 'failure') {
					if (result.status === 409) {
						// Show what the other person did, then re-snapshot so the next
						// Save is a knowing overwrite. What was typed is left alone.
						await invalidateAll();
						await tick();
						handlers.onConflict?.();
					}
					submitting = false;
					handlers.onFailure(actionError(result.data) ?? 'Something went wrong. Please try again.');
					return;
				}
				if (result.type === 'error') {
					submitting = false;
					handlers.onFailure('Something went wrong. Please try again.');
					return;
				}
				await invalidateAll();
				// This tab's own write is not someone else's change. An editor opened
				// at the version this write was made against has seen everything but
				// the write itself, which produced exactly the next version (see
				// `run-and-publish.ts`), so it moves with it instead of 409ing on Save.
				if (editing?.openedAtVersion === submittedVersion) {
					editing.openedAtVersion = submittedVersion + 1;
				}
				submitting = false;
				handlers.onSuccess();
			};
		};
	}

	const submitAdd = submitWith({
		onSuccess: () => {
			addTerm = '';
			addDefinition = '';
			addError = null;
		},
		onFailure: (message) => (addError = message)
	});

	const submitEdit = submitWith({
		onSuccess: () => {
			stopEditing();
			editError = null;
		},
		onFailure: (message) => (editError = message),
		onConflict: () => {
			if (editing) editing.openedAtVersion = data.version;
		}
	});

	const submitDelete = submitWith({
		onSuccess: () => {
			deleteError = null;
			void focusAfterRender('glossary-filter');
		},
		onFailure: (message) => (deleteError = message)
	});
</script>

<svelte:head><title>Glossary · {data.mapName} · Storyboard 2026</title></svelte:head>

<div
	class="mx-auto flex w-full max-w-3xl flex-col gap-6"
	data-testid="glossary"
	data-collab-state={sync?.state ?? 'connecting'}
>
	<div>
		<a
			href={resolve('/maps/[mapId]', { mapId: data.mapId })}
			class="text-ink-muted hover:text-brand inline-flex items-center gap-1 text-sm"
			data-testid="back-to-board"
		>
			<ArrowLeft class="size-3.5" />
			{data.mapName}
		</a>
		<h1 class="mt-2">Glossary</h1>
		<p class="text-ink-muted mt-1 text-sm">
			{data.entries.length} term{data.entries.length === 1 ? '' : 's'}
		</p>
	</div>

	<form
		method="POST"
		action="?/addGlossaryEntry"
		use:enhance={submitAdd}
		class="panel flex flex-col gap-3 p-5"
	>
		<input type="hidden" name="version" value={data.version} />
		<div class="flex flex-col gap-1.5">
			<label for="glossary-add-term" class="field-label">New term</label>
			<input
				id="glossary-add-term"
				name="term"
				type="text"
				required
				class="input"
				placeholder="e.g. SKU"
				bind:value={addTerm}
			/>
		</div>
		<div class="flex flex-col gap-1.5">
			<label for="glossary-add-definition" class="field-label">Definition</label>
			<textarea
				id="glossary-add-definition"
				name="definition"
				required
				rows="2"
				class="input"
				bind:value={addDefinition}></textarea>
		</div>
		{#if addError}
			<p class="error" role="alert">{addError}</p>
		{/if}
		<button type="submit" class="btn btn-primary self-start" disabled={submitting}>
			Add term
		</button>
	</form>

	<div class="flex flex-col gap-1.5">
		<label for="glossary-filter" class="field-label">Filter</label>
		<input
			id="glossary-filter"
			type="search"
			class="input"
			placeholder="Search terms and definitions"
			data-testid="glossary-filter"
			bind:value={query}
		/>
	</div>

	{#if deleteError}
		<p class="error" role="alert">{deleteError}</p>
	{/if}

	{#if data.entries.length === 0}
		<div class="panel text-ink-muted border-dashed px-6 py-10 text-center text-sm">
			No terms yet. Add the first one above.
		</div>
	{:else if visible.length === 0}
		<div
			class="panel text-ink-muted border-dashed px-6 py-10 text-center text-sm"
			data-testid="glossary-no-match"
		>
			No terms match “{query.trim()}”.
		</div>
	{:else}
		<ul class="panel divide-line divide-y overflow-hidden" data-testid="glossary-entries">
			{#each visible as entry (entry.id)}
				<li class="px-5 py-3.5" data-testid="glossary-entry-{entry.id}">
					{#if editing?.id === entry.id}
						<form
							method="POST"
							action="?/editGlossaryEntry"
							use:enhance={submitEdit}
							class="flex flex-col gap-3"
						>
							<input type="hidden" name="version" value={editing.openedAtVersion} />
							<input type="hidden" name="entryId" value={entry.id} />
							<div class="flex flex-col gap-1.5">
								<label for="glossary-edit-term" class="field-label">Term</label>
								<input
									id="glossary-edit-term"
									name="term"
									type="text"
									required
									class="input"
									bind:value={editing.term}
								/>
							</div>
							<div class="flex flex-col gap-1.5">
								<label for="glossary-edit-definition" class="field-label">Definition</label>
								<textarea
									id="glossary-edit-definition"
									name="definition"
									required
									rows="3"
									class="input"
									bind:value={editing.definition}></textarea>
							</div>
							{#if editError}
								<p class="error" role="alert">{editError}</p>
							{/if}
							<div class="flex gap-2">
								<button type="submit" class="btn btn-primary" disabled={submitting}>Save</button>
								<button type="button" class="btn btn-quiet" onclick={stopEditing}> Cancel </button>
							</div>
						</form>
					{:else}
						<div class="flex items-start justify-between gap-3">
							<dl class="min-w-0 flex-1">
								<dt class="text-ink text-sm font-medium break-words" data-testid="glossary-term">
									{entry.term}
								</dt>
								<dd
									class="text-ink-muted mt-0.5 text-sm break-words whitespace-pre-line"
									data-testid="glossary-definition"
								>
									{entry.definition}
								</dd>
							</dl>
							<div class="flex shrink-0 gap-1">
								<!-- Disabled mid-submit, like Save and Delete: a Save still in
								     flight would otherwise land on whichever editor this opened,
								     closing it or re-snapshotting its version. -->
								<button
									type="button"
									id="glossary-edit-{entry.id}"
									class="btn btn-icon btn-quiet rounded"
									aria-label="Edit {entry.term}"
									use:tooltip={'Edit'}
									disabled={submitting}
									onclick={() => startEditing(entry)}
								>
									<Pencil class="size-4" />
								</button>
								<form method="POST" action="?/deleteGlossaryEntry" use:enhance={submitDelete}>
									<input type="hidden" name="version" value={data.version} />
									<input type="hidden" name="entryId" value={entry.id} />
									<button
										type="submit"
										class="btn btn-icon btn-danger-quiet rounded"
										aria-label="Delete {entry.term}"
										use:tooltip={'Delete'}
										disabled={submitting}
									>
										<Trash2 class="size-4" />
									</button>
								</form>
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if editing && editingGone}
		<p class="error" role="alert">
			“{editing.openedTerm}” was deleted by someone else while you were editing it.
			<button type="button" class="underline" onclick={stopEditing}>Dismiss</button>
		</p>
	{/if}
</div>

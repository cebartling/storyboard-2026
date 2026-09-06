<script lang="ts" module>
	/**
	 * Which board editor is open, and the data it needs to prefill. One
	 * discriminated union rather than a boolean-and-id per editor: only one
	 * modal can be open at a time, so the payload travels with the kind and
	 * there is no way for "which editor" and "which entity" to disagree.
	 */
	export type BoardDialog =
		| { kind: 'addActivity' }
		| { kind: 'editActivity'; activityId: string; name: string }
		| { kind: 'addStep'; activityId: string; activityName: string }
		| { kind: 'editStep'; stepId: string; name: string }
		| { kind: 'addSlice' }
		| { kind: 'editSlice'; sliceId: string; name: string }
		| { kind: 'addStory'; stepId: string; sliceId: string | null; scopeLabel: string }
		| { kind: 'editStory'; storyId: string; title: string; description: string | null }
		/**
		 * The read-only story detail view (ADR 0018). Carries only the id, unlike
		 * every `edit*` kind: an editor snapshots its subject so it can tell that
		 * the ground moved underneath it (ADR 0014), but a read-only view has no
		 * pending input to lose. It reads the story live off the board through the
		 * `story` prop instead, so a collaborator's edit simply re-renders.
		 */
		| { kind: 'viewStory'; storyId: string }
		| { kind: 'shareMap'; mapName: string };

	/** Reads the `{ error }` payload `run-action.ts` puts in every `fail()`. */
	export function actionError(data: unknown): string | null {
		if (typeof data !== 'object' || data === null || !('error' in data)) return null;
		return typeof data.error === 'string' ? data.error : null;
	}

	const TITLES: Record<BoardDialog['kind'], string> = {
		addActivity: 'Add activity',
		editActivity: 'Edit activity',
		addStep: 'Add step',
		editStep: 'Edit step',
		addSlice: 'Add slice',
		editSlice: 'Edit slice',
		addStory: 'Add story',
		editStory: 'Edit story',
		viewStory: 'Story',
		shareMap: 'Share map'
	};
</script>

<script lang="ts">
	// Every create/update/delete on the board (ADR 0011). The board itself is
	// read-only; it renders triggers that set `dialog`, and this component
	// renders the matching form.
	//
	// These forms post the same named actions the inline forms used to
	// (ADR 0008) — only the submission path changed: `use:enhance` instead of
	// a full-page navigation, because navigating away would tear down the
	// dialog the user is standing in.
	import { tick, untrack } from 'svelte';
	import type { SubjectStatus } from '$lib/board/dialog-subject';
	import { renderMarkdown } from '$lib/markdown/render-markdown';
	import { filterCandidates, type Candidate } from '$lib/board/dependency-candidates';
	import { tooltip } from '$lib/actions/tooltip';
	import type { BoardViewModel } from '$lib/board/board-view-model';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';

	type BoardDependency = BoardViewModel['dependencies'][number];
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Modal from './modal.svelte';

	let {
		dialog,
		boardVersion,
		clientId,
		subject,
		story = null,
		dependencies = [],
		candidates = [],
		onClose,
		onLateFailure,
		onReplaceSubject,
		onOpenDialog
	}: {
		dialog: BoardDialog | null;
		/** The board's current aggregate version, as `load()` last returned it. */
		boardVersion: number;
		/**
		 * This tab, sent with every mutation so the hub can skip notifying us about
		 * our own change — we refetch as part of the submission itself.
		 */
		clientId: string;
		/**
		 * Whether what this dialog is editing still looks the way it did when the
		 * dialog opened. Computed by the page from the live board, because live
		 * refetching means the ground can move under an open editor (ADR 0014).
		 */
		subject?: SubjectStatus | null;
		/**
		 * The story `viewStory` is showing, as the board currently has it. Passed
		 * in rather than snapshotted into the dialog so the rendered description
		 * follows a collaborator's edit instead of going stale; `null` once the
		 * story is gone.
		 */
		story?: { title: string; description: string | null } | null;
		/** Every edge on the board, both endpoints resolved (ADR 0019). */
		dependencies?: BoardDependency[];
		/** Stories this one could legally be linked to. */
		candidates?: Candidate[];
		/** `deleted` when the submission removed the thing the dialog was
		 *  editing, so the caller can put focus somewhere that still exists —
		 *  the trigger that opened the dialog is gone by then. */
		onClose: (outcome?: { deleted: boolean }) => void;
		/**
		 * A failure that arrived after the dialog was already closed. There is
		 * nowhere in here to render it, so the board shows it instead.
		 */
		onLateFailure: (message: string) => void;
		/** Adopt the other editor's version, discarding what is in the form. */
		onReplaceSubject?: (dialog: BoardDialog) => void;
		/** Swap to another dialog in place — the detail view's route to the
		 *  editor for the story it is already showing. */
		onOpenDialog?: (dialog: BoardDialog) => void;
	} = $props();

	const storyMarkdown = $derived(renderMarkdown(story?.description ?? null));

	// The two directions, sorted by title: edges carry no rank (ADR 0019), so an
	// order has to be chosen somewhere and the reader's is the one that matters.
	const viewedStoryId = $derived(dialog?.kind === 'viewStory' ? dialog.storyId : null);
	const blockedBy = $derived(
		dependencies
			.filter((d) => d.blockedId === viewedStoryId)
			.sort((a, b) => a.blockerTitle.localeCompare(b.blockerTitle))
	);
	const blocks = $derived(
		dependencies
			.filter((d) => d.blockerId === viewedStoryId)
			.sort((a, b) => a.blockedTitle.localeCompare(b.blockedTitle))
	);

	/**
	 * The dependency section, so focus has somewhere real to land after a remove:
	 * the button that was clicked is gone from the DOM by then, and a modal with
	 * focus on <body> is a keyboard dead end.
	 */
	let dependencySection = $state<HTMLElement | null>(null);

	/** The picker is collapsed until asked for — see the comment at its markup. */
	let pickerOpen = $state(false);
	let candidateQuery = $state('');
	let chosenCandidate = $state<string | null>(null);
	const CANDIDATE_LIMIT = 50;
	const shownCandidates = $derived(filterCandidates(candidates, candidateQuery, CANDIDATE_LIMIT));

	/**
	 * Whether the chosen candidate is still on screen.
	 *
	 * Narrowing the query past a chosen story unmounts its radio, but Svelte's
	 * `bind:group` teardown only drops the input from the group — it leaves the
	 * bound value set. Without this the button stays enabled and posts a form
	 * with no `otherId`, which comes back as a 400 naming a form field.
	 */
	const chosenIsShown = $derived(shownCandidates.shown.some((c) => c.id === chosenCandidate));

	$effect(() => {
		// Reading it into a local is what subscribes this effect: reset the picker
		// whenever the dialog turns to a different story, or it would open
		// pre-filled with the last story's search.
		const showing = viewedStoryId;
		if (showing === null) return;
		untrack(() => {
			pickerOpen = false;
			candidateQuery = '';
			chosenCandidate = null;
		});
	});

	const subjectDeleted = $derived(subject?.status === 'deleted');
	const subjectChanged = $derived(subject?.status === 'changed');

	let error = $state<string | null>(null);
	let submitting = $state(false);

	/**
	 * The version this editor was opened at — snapshotted, deliberately not read
	 * live (ADR 0014 §3).
	 *
	 * Sending the *current* version at submit time would defeat the whole
	 * mechanism: a dialog opened before someone else's edit would silently adopt
	 * their version and overwrite them. Live refetching (ADR 0014 §5) makes that
	 * routine rather than theoretical, so the snapshot has to be taken here, at
	 * open time, and held until the dialog closes.
	 */
	let openedAtVersion = $state(0);
	/**
	 * Which dialog `openedAtVersion` was captured for. A plain `let`, not state:
	 * nothing renders it, it only decides whether the snapshot is still the right
	 * one. Comparing the subject — rather than relying on the effect's dependency
	 * set — is what makes "snapshot at open time" hold no matter how the parent
	 * happens to pass its props.
	 */
	let snapshotFor: BoardDialog | null = null;

	$effect(() => {
		const opening = dialog;
		if (!opening) {
			snapshotFor = null;
			return;
		}
		if (opening !== snapshotFor) {
			snapshotFor = opening;
			openedAtVersion = untrack(() => boardVersion);
		}
	});

	// A failure keeps the dialog open with its message; opening a different
	// editor must not inherit it. Only the open transition needs clearing —
	// while `dialog` is null there is nothing rendered to show a stale error.
	$effect(() => {
		if (dialog) error = null;
	});

	// Returning a callback suppresses `enhance`'s defaults wholesale, which is
	// the point: the default `applyAction` would push the failure into the
	// page's `form` prop and the same message would render twice — once here,
	// once in the board's own error banner. This dialog owns its errors.
	//
	// `invalidateAll()` is what replaces the removed navigation: with no page
	// load, nothing else reruns `load()`. It is the same refresh the drag path
	// already uses, for the reason ADR 0008 gives (this page has exactly one
	// load function, so there is nothing narrower to invalidate).
	const submit: SubmitFunction = ({ formElement, formData }) => {
		error = null;
		submitting = true;
		// Set here rather than as a hidden input in each of the twelve forms: it
		// is a constant for the life of the page, so there is nothing to snapshot
		// and nothing a form reset could revert (unlike `version`).
		formData.set('clientId', clientId);
		// Captured at submit time: the user can close the dialog while the
		// request is in flight, and a message shown in a closed dialog is a
		// message nobody reads.
		const submittedFor = dialog;
		// The form's own action, so this stays true if a delete moves to a
		// different dialog kind later. Every delete action is named `delete*`.
		const isDelete = (formElement.getAttribute('action') ?? '').startsWith('?/delete');

		function report(message: string) {
			submitting = false;
			if (dialog === submittedFor) error = message;
			else onLateFailure(message);
		}

		return async ({ result }) => {
			// `submitting` disables every button in the dialog, and it is the
			// only double-submit guard here — so it is cleared per path, never
			// up front. Clearing it before the `invalidateAll()` below would
			// re-enable Save and Delete for a whole round trip while the dialog
			// is still open, which is long enough to click twice.
			if (result.type === 'failure') {
				if (result.status === 409) {
					// A stale editor (ADR 0014 §3). Refresh the board so the user is
					// looking at what the other person actually did, and re-snapshot
					// the version so their next Save is a knowing overwrite rather
					// than another rejection. What they typed is deliberately left
					// alone — it is the one thing that cannot be recovered.
					await invalidateAll();
					// `boardVersion` is a prop fed from `load()`; let the refetch's
					// new value reach it before re-snapshotting, or we would capture
					// the version we already know is stale.
					await tick();
					openedAtVersion = boardVersion;
				}
				report(actionError(result.data) ?? 'Something went wrong. Please try again.');
				return;
			}
			if (result.type === 'error') {
				report('Something went wrong. Please try again.');
				return;
			}
			// Everything else is `success` — or `redirect`, which falls through
			// here deliberately: suppressing `applyAction` means nothing would
			// follow the redirect, so it would be discarded silently. None of
			// the eleven board actions redirects (only `?/createMap` on `/`
			// does, and it is not enhanced), so there is no case to handle yet.
			// An action that starts redirecting needs an explicit branch here.
			//
			await invalidateAll();

			// Adding stories is the one repetitive loop on this board — a
			// mapping session enters a column of them at a sitting — and the
			// inline form this replaced let you type, press Enter, and keep
			// typing. So this one dialog stays open and resets instead of
			// closing; Escape and the close button are still the way out.
			// Every other editor is a one-off edit, and closing is the right
			// end to it.
			// The detail view writes now (ADR 0019) and must not close on success —
			// removing a dependency would take the view the reader is standing in
			// with it. Re-snapshotting matters more here than for `addStory`,
			// because two removes in a row is an ordinary thing to do.
			if (submittedFor?.kind === 'viewStory') {
				await tick();
				openedAtVersion = boardVersion;
				pickerOpen = false;
				candidateQuery = '';
				chosenCandidate = null;
				submitting = false;
				// The control that was clicked has just been removed from the DOM,
				// so focus would fall to <body> inside an inerted page.
				dependencySection?.focus();
				return;
			}

			if (submittedFor?.kind === 'addStory') {
				formElement.reset();
				// The version this dialog holds was spent on the add that just
				// succeeded, so re-snapshot it before the next one. Every other
				// dialog closes here and gets a fresh snapshot on its next open;
				// this is the only one that lives long enough to submit twice, and
				// without this the second add is refused as a conflict with nobody.
				// `tick()` for the same reason the 409 branch needs it — let the
				// refetch's new value reach the `boardVersion` prop first.
				await tick();
				openedAtVersion = boardVersion;
				submitting = false;
				formElement.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
				return;
			}

			// Closing after the refetch, so focus returns to a trigger that is
			// already sitting on up-to-date content — except after a delete,
			// where that trigger no longer exists and the caller has to place
			// focus instead.
			onClose({ deleted: isDelete });
			submitting = false;
		};
	};
</script>

{#snippet removeForm(edge: BoardDependency, otherTitle: string)}
	<form method="POST" action="?/removeDependency" use:enhance={submit} class="shrink-0">
		<input type="hidden" name="version" value={openedAtVersion} />
		<input type="hidden" name="blockerId" value={edge.blockerId} />
		<input type="hidden" name="blockedId" value={edge.blockedId} />
		<button
			type="submit"
			class="btn btn-icon btn-danger-quiet rounded"
			aria-label="Remove dependency on {otherTitle}"
			use:tooltip={'Remove dependency'}
			disabled={submitting || subjectDeleted}
		>
			<X class="size-3.5" />
		</button>
	</form>
{/snippet}

<Modal
	open={dialog !== null}
	title={dialog ? TITLES[dialog.kind] : ''}
	testid="board-dialog"
	{onClose}
>
	{#if error}
		<p class="error mb-3" role="alert">{error}</p>
	{/if}

	<!-- The ground moved under this editor while it was open (ADR 0014 Stage 1).
	     A notice rather than an error: nothing the user did failed.

	     Skipped for `viewStory`, which is read-only: it has nothing open to save,
	     so "there is nothing left to save" would be answering a question the
	     reader never asked. That branch says the story is gone in its own words. -->
	{#if subjectDeleted && dialog?.kind !== 'viewStory'}
		<p class="notice mb-3" role="status" data-testid="subject-deleted">
			Someone else deleted this while you were editing. Close this dialog — there is nothing left to
			save.
		</p>
	{:else if subjectChanged && subject?.status === 'changed'}
		<div
			class="notice mb-3 flex flex-wrap items-center gap-3"
			role="status"
			data-testid="subject-changed"
		>
			<span class="flex-1">Someone else changed this while you were editing.</span>
			<button
				type="button"
				class="btn btn-quiet"
				onclick={() => onReplaceSubject?.(subject.current)}
			>
				Use their version
			</button>
		</div>
	{/if}

	{#if dialog?.kind === 'addActivity'}
		<form method="POST" action="?/addActivity" use:enhance={submit} class="flex flex-col gap-3">
			<input type="hidden" name="version" value={openedAtVersion} />
			<div class="flex flex-col gap-1.5">
				<label for="dialog-activity-name" class="field-label">New activity</label>
				<input
					id="dialog-activity-name"
					name="name"
					type="text"
					required
					class="input"
					placeholder="e.g. Browse"
				/>
			</div>
			<button
				type="submit"
				class="btn btn-primary self-start"
				disabled={submitting || subjectDeleted}
			>
				Add activity
			</button>
		</form>
	{:else if dialog?.kind === 'editActivity'}
		<form method="POST" action="?/renameActivity" use:enhance={submit} class="flex flex-col gap-3">
			<input type="hidden" name="version" value={openedAtVersion} />
			<input type="hidden" name="activityId" value={dialog.activityId} />
			<div class="flex flex-col gap-1.5">
				<label for="dialog-activity-rename" class="field-label">Rename activity</label>
				<input
					id="dialog-activity-rename"
					name="name"
					type="text"
					required
					value={dialog.name}
					class="input"
				/>
			</div>
			<button
				type="submit"
				class="btn btn-primary self-start"
				disabled={submitting || subjectDeleted}
				>{subjectChanged ? 'Save mine anyway' : 'Save'}</button
			>
		</form>
		<form
			method="POST"
			action="?/deleteActivity"
			use:enhance={submit}
			class="border-line mt-5 border-t pt-4"
		>
			<input type="hidden" name="version" value={openedAtVersion} />
			<input type="hidden" name="activityId" value={dialog.activityId} />
			<p class="text-ink-muted mb-2 text-sm">
				Deleting an activity also deletes its steps and stories.
			</p>
			<button type="submit" class="btn btn-danger" disabled={submitting || subjectDeleted}
				>Delete activity</button
			>
		</form>
	{:else if dialog?.kind === 'addStep'}
		<form method="POST" action="?/addStep" use:enhance={submit} class="flex flex-col gap-3">
			<input type="hidden" name="version" value={openedAtVersion} />
			<input type="hidden" name="activityId" value={dialog.activityId} />
			<div class="flex flex-col gap-1.5">
				<label for="dialog-step-name" class="field-label">New step name</label>
				<input
					id="dialog-step-name"
					name="name"
					type="text"
					required
					class="input"
					placeholder="e.g. Find a product"
				/>
			</div>
			<p class="text-ink-muted text-sm">Added to <strong>{dialog.activityName}</strong>.</p>
			<button
				type="submit"
				class="btn btn-primary self-start"
				disabled={submitting || subjectDeleted}
			>
				Add step
			</button>
		</form>
	{:else if dialog?.kind === 'editStep'}
		<form method="POST" action="?/renameStep" use:enhance={submit} class="flex flex-col gap-3">
			<input type="hidden" name="version" value={openedAtVersion} />
			<input type="hidden" name="stepId" value={dialog.stepId} />
			<div class="flex flex-col gap-1.5">
				<label for="dialog-step-rename" class="field-label">Rename step</label>
				<input
					id="dialog-step-rename"
					name="name"
					type="text"
					required
					value={dialog.name}
					class="input"
				/>
			</div>
			<button
				type="submit"
				class="btn btn-primary self-start"
				disabled={submitting || subjectDeleted}
				>{subjectChanged ? 'Save mine anyway' : 'Save'}</button
			>
		</form>
		<form
			method="POST"
			action="?/deleteStep"
			use:enhance={submit}
			class="border-line mt-5 border-t pt-4"
		>
			<input type="hidden" name="version" value={openedAtVersion} />
			<input type="hidden" name="stepId" value={dialog.stepId} />
			<p class="text-ink-muted mb-2 text-sm">Deleting a step also deletes its stories.</p>
			<button type="submit" class="btn btn-danger" disabled={submitting || subjectDeleted}
				>Delete step</button
			>
		</form>
	{:else if dialog?.kind === 'addSlice'}
		<form method="POST" action="?/createSlice" use:enhance={submit} class="flex flex-col gap-3">
			<input type="hidden" name="version" value={openedAtVersion} />
			<div class="flex flex-col gap-1.5">
				<label for="dialog-slice-name" class="field-label">New slice</label>
				<input
					id="dialog-slice-name"
					name="name"
					type="text"
					required
					class="input"
					placeholder="e.g. Release 1"
				/>
			</div>
			<button
				type="submit"
				class="btn btn-primary self-start"
				disabled={submitting || subjectDeleted}
			>
				Add slice
			</button>
		</form>
	{:else if dialog?.kind === 'editSlice'}
		<form method="POST" action="?/renameSlice" use:enhance={submit} class="flex flex-col gap-3">
			<input type="hidden" name="version" value={openedAtVersion} />
			<input type="hidden" name="sliceId" value={dialog.sliceId} />
			<div class="flex flex-col gap-1.5">
				<label for="dialog-slice-rename" class="field-label">Rename slice</label>
				<input
					id="dialog-slice-rename"
					name="name"
					type="text"
					required
					value={dialog.name}
					class="input"
				/>
			</div>
			<button
				type="submit"
				class="btn btn-primary self-start"
				disabled={submitting || subjectDeleted}
				>{subjectChanged ? 'Save mine anyway' : 'Save'}</button
			>
		</form>
		<form
			method="POST"
			action="?/deleteSlice"
			use:enhance={submit}
			class="border-line mt-5 border-t pt-4"
		>
			<input type="hidden" name="version" value={openedAtVersion} />
			<input type="hidden" name="sliceId" value={dialog.sliceId} />
			<p class="text-ink-muted mb-2 text-sm">
				Stories in this slice move back to the unsliced band.
			</p>
			<button type="submit" class="btn btn-danger" disabled={submitting || subjectDeleted}
				>Delete slice</button
			>
		</form>
	{:else if dialog?.kind === 'addStory'}
		<form method="POST" action="?/addStory" use:enhance={submit} class="flex flex-col gap-3">
			<input type="hidden" name="version" value={openedAtVersion} />
			<input type="hidden" name="stepId" value={dialog.stepId} />
			<input type="hidden" name="sliceId" value={dialog.sliceId ?? ''} />
			<div class="flex flex-col gap-1.5">
				<label for="dialog-story-title" class="field-label">New story title</label>
				<input
					id="dialog-story-title"
					name="title"
					type="text"
					required
					class="input"
					placeholder="e.g. Search by keyword"
				/>
			</div>
			<p class="text-ink-muted text-sm">Added to <strong>{dialog.scopeLabel}</strong>.</p>
			<button
				type="submit"
				class="btn btn-primary self-start"
				disabled={submitting || subjectDeleted}
			>
				Add story
			</button>
		</form>
	{:else if dialog?.kind === 'editStory'}
		<form method="POST" action="?/editStory" use:enhance={submit} class="flex flex-col gap-3">
			<input type="hidden" name="version" value={openedAtVersion} />
			<input type="hidden" name="storyId" value={dialog.storyId} />
			<div class="flex flex-col gap-1.5">
				<label for="dialog-story-edit-title" class="field-label">Story title</label>
				<input
					id="dialog-story-edit-title"
					name="title"
					type="text"
					required
					value={dialog.title}
					class="input"
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<label for="dialog-story-description" class="field-label">Description</label>
				<textarea
					id="dialog-story-description"
					name="description"
					rows="4"
					class="input resize-y"
					placeholder="Optional detail, acceptance notes, open questions…"
					value={dialog.description ?? ''}></textarea>
			</div>
			<button
				type="submit"
				class="btn btn-primary self-start"
				disabled={submitting || subjectDeleted}
				>{subjectChanged ? 'Save mine anyway' : 'Save'}</button
			>
		</form>
		<form
			method="POST"
			action="?/deleteStory"
			use:enhance={submit}
			class="border-line mt-5 border-t pt-4"
		>
			<input type="hidden" name="version" value={openedAtVersion} />
			<input type="hidden" name="storyId" value={dialog.storyId} />
			<button type="submit" class="btn btn-danger" disabled={submitting || subjectDeleted}
				>Delete story</button
			>
		</form>
	{:else if dialog?.kind === 'viewStory'}
		<!-- The read half of ADR 0018, and the only place a description is
		     legible. No form and no version input: this changes nothing, so it
		     has no claim on the aggregate.

		     `{@html}` is used here and nowhere else in this app. Everything it
		     renders has been through `renderMarkdown`, which parses with `marked`
		     and then sanitises with DOMPurify against an explicit allowlist. That
		     is the whole of the defence — there is no CSP behind it — and the
		     description was written by whichever editor last touched the story,
		     not by the person reading it (ADR 0015). -->
		{#if story === null}
			<p class="text-ink-muted text-sm">This story no longer exists.</p>
		{:else}
			<p class="text-ink text-base font-medium">{story.title}</p>
			{#if storyMarkdown === ''}
				<p class="text-ink-muted mt-3 text-sm italic">
					No description yet. Use Edit to add one — Markdown is rendered here.
				</p>
			{:else}
				<div class="prose-note mt-3" data-testid="story-description">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html storyMarkdown}
				</div>
			{/if}
			<!-- Dependencies (ADR 0019). This is what stopped `viewStory` being
			     form-free: it now writes, so its forms carry the version and the
			     client id like every other editor, and the submit handler keeps it
			     open instead of closing on success. -->
			<div
				class="border-line mt-5 border-t pt-4 focus:outline-none"
				bind:this={dependencySection}
				tabindex="-1"
			>
				{#if blockedBy.length > 0}
					<p class="field-label">Blocked by</p>
					<ul class="mt-1.5 flex flex-col gap-1" data-testid="blocked-by-list">
						{#each blockedBy as edge (edge.blockerId)}
							<li class="flex items-center justify-between gap-2 text-sm">
								<span class="break-words">{edge.blockerTitle}</span>
								{@render removeForm(edge, edge.blockerTitle)}
							</li>
						{/each}
					</ul>
				{/if}

				{#if blocks.length > 0}
					<p class="field-label {blockedBy.length > 0 ? 'mt-3' : ''}">Blocks</p>
					<ul class="mt-1.5 flex flex-col gap-1" data-testid="blocks-list">
						{#each blocks as edge (edge.blockedId)}
							<li class="flex items-center justify-between gap-2 text-sm">
								<span class="break-words">{edge.blockedTitle}</span>
								{@render removeForm(edge, edge.blockedTitle)}
							</li>
						{/each}
					</ul>
				{/if}

				{#if blockedBy.length === 0 && blocks.length === 0}
					<p class="text-ink-muted text-sm italic">No dependencies.</p>
				{/if}

				<!-- Collapsed until asked for, and not only to save space: `Modal`
				     focuses the first non-hidden input when it opens, so a picker
				     rendered up front would take focus off the description the
				     reader came here for. -->
				{#if pickerOpen}
					<form
						method="POST"
						action="?/addDependency"
						use:enhance={submit}
						class="border-line mt-4 flex flex-col gap-3 border-t pt-4"
					>
						<input type="hidden" name="version" value={openedAtVersion} />
						<input type="hidden" name="storyId" value={dialog.storyId} />

						<fieldset class="flex flex-col gap-1.5">
							<legend class="field-label">Direction</legend>
							<label class="flex items-center gap-2 text-sm">
								<input type="radio" name="direction" value="blocks" checked />
								This story blocks
							</label>
							<label class="flex items-center gap-2 text-sm">
								<input type="radio" name="direction" value="blockedBy" />
								This story is blocked by
							</label>
						</fieldset>

						<div class="flex flex-col gap-1.5">
							<label for="dialog-dependency-filter" class="field-label">Find a story</label>
							<input
								id="dialog-dependency-filter"
								type="search"
								class="input"
								placeholder="Type to narrow the list…"
								bind:value={candidateQuery}
							/>
						</div>

						{#if shownCandidates.total === 0}
							<p class="text-ink-muted text-sm italic">No stories match.</p>
						{:else}
							<div
								class="border-line max-h-52 overflow-y-auto rounded-md border"
								role="radiogroup"
								aria-label="Candidate stories"
							>
								{#each shownCandidates.shown as candidate (candidate.id)}
									<label
										class="hover:bg-surface flex cursor-pointer items-start gap-2 px-2 py-1.5 text-sm"
									>
										<input
											type="radio"
											name="otherId"
											value={candidate.id}
											class="mt-1"
											bind:group={chosenCandidate}
										/>
										<span class="flex-1">
											<span class="break-words">{candidate.title}</span>
											<span class="text-ink-muted block text-xs">
												{candidate.stepName} · {candidate.sliceName}
											</span>
										</span>
									</label>
								{/each}
							</div>
							<!-- A capped list that just stops reads as "there is nothing
							     else", so it says how much it is not showing. -->
							<p class="text-ink-muted text-xs" data-testid="candidate-count">
								Showing {shownCandidates.shown.length} of {shownCandidates.total}
							</p>
						{/if}

						<button
							type="submit"
							class="btn btn-primary self-start"
							disabled={submitting || subjectDeleted || !chosenIsShown}>Add</button
						>
					</form>
				{:else}
					<button
						type="button"
						class="btn btn-quiet mt-4"
						disabled={candidates.length === 0}
						onclick={() => (pickerOpen = true)}
					>
						<Plus class="size-3.5" />
						Add dependency
					</button>
				{/if}
			</div>

			<div class="border-line mt-5 border-t pt-4">
				<button
					type="button"
					class="btn btn-quiet"
					onclick={() =>
						onOpenDialog?.({
							kind: 'editStory',
							storyId: dialog.storyId,
							title: story.title,
							description: story.description
						})}>Edit story</button
				>
			</div>
		{/if}
	{:else if dialog?.kind === 'shareMap'}
		<!-- No version input: sharing changes who may reach the map, not the
		     board, so it neither reads nor advances the aggregate (ADR 0015). -->
		<form method="POST" action="?/shareMap" use:enhance={submit} class="flex flex-col gap-3">
			<p class="text-ink-muted text-sm">
				People you add can edit <strong>{dialog.mapName}</strong> but cannot delete or share it.
			</p>
			<div class="flex flex-col gap-1">
				<label class="field-label" for="share-email">Email address</label>
				<input
					id="share-email"
					name="email"
					type="email"
					class="input"
					placeholder="them@example.com"
					required
				/>
			</div>
			<button
				type="submit"
				class="btn btn-primary self-start"
				disabled={submitting || subjectDeleted}>Share</button
			>
		</form>
	{/if}
</Modal>

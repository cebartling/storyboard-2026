import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { tick } from 'svelte';
import BoardDialogs, { type BoardDialog, actionError } from './board-dialogs.svelte';

// These tests assert what each `kind` renders — the action it posts, the
// hidden ids it carries, and that fields prefill. They deliberately never
// submit: `use:enhance` would issue a real POST against the test page.
//
// The submit policy is therefore covered in `page.svelte.e2e.ts` instead, not
// here: "adds a story into a slice band…" drives the success paths, and "a
// failed dialog submission…" drives the failure path (the dialog stays open,
// owns its message, and does not echo it into the board's banner). The
// late-failure route through `onLateFailure` — a result arriving after the
// user closed the dialog — is covered by "a failure arriving after the dialog
// closed…", which holds the response open with `page.route` to keep the race
// from depending on machine speed.
async function open(dialog: BoardDialog) {
	render(BoardDialogs, { dialog, onClose: () => {}, onLateFailure: () => {} });
	await tick();
	return page.getByTestId('board-dialog').element() as HTMLDialogElement;
}

function form(dialogEl: HTMLDialogElement, action: string): HTMLFormElement {
	const el = dialogEl.querySelector(`form[action="${action}"]`);
	if (!el) throw new Error(`no form posting ${action}`);
	return el as HTMLFormElement;
}

function hidden(formEl: HTMLFormElement, name: string): string | undefined {
	return (formEl.querySelector(`input[name="${name}"]`) as HTMLInputElement | null)?.value;
}

describe('BoardDialogs', () => {
	it('renders nothing open when there is no dialog', async () => {
		const dialogEl = await open(null as unknown as BoardDialog);

		expect(dialogEl.open).toBe(false);
	});

	it('addActivity posts ?/addActivity', async () => {
		const dialogEl = await open({ kind: 'addActivity' });

		expect(form(dialogEl, '?/addActivity')).toBeTruthy();
		await expect.element(page.getByRole('textbox', { name: 'New activity' })).toBeVisible();
	});

	it('editActivity prefills the name and offers rename and delete', async () => {
		const dialogEl = await open({ kind: 'editActivity', activityId: 'a-1', name: 'Browse' });

		const rename = form(dialogEl, '?/renameActivity');
		expect(hidden(rename, 'activityId')).toBe('a-1');
		expect((rename.querySelector('input[name="name"]') as HTMLInputElement).value).toBe('Browse');
		expect(hidden(form(dialogEl, '?/deleteActivity'), 'activityId')).toBe('a-1');
	});

	it('addStep carries the activity id and names the activity', async () => {
		const dialogEl = await open({ kind: 'addStep', activityId: 'a-2', activityName: 'Browse' });

		expect(hidden(form(dialogEl, '?/addStep'), 'activityId')).toBe('a-2');
		await expect.element(page.getByTestId('board-dialog')).toHaveTextContent('Browse');
	});

	it('editStep prefills the name and offers rename and delete', async () => {
		const dialogEl = await open({ kind: 'editStep', stepId: 's-1', name: 'Find a product' });

		const rename = form(dialogEl, '?/renameStep');
		expect(hidden(rename, 'stepId')).toBe('s-1');
		expect((rename.querySelector('input[name="name"]') as HTMLInputElement).value).toBe(
			'Find a product'
		);
		expect(hidden(form(dialogEl, '?/deleteStep'), 'stepId')).toBe('s-1');
	});

	it('addSlice posts ?/createSlice', async () => {
		const dialogEl = await open({ kind: 'addSlice' });

		expect(form(dialogEl, '?/createSlice')).toBeTruthy();
	});

	it('editSlice prefills the name and offers rename and delete', async () => {
		const dialogEl = await open({ kind: 'editSlice', sliceId: 'sl-1', name: 'Release 1' });

		expect(hidden(form(dialogEl, '?/renameSlice'), 'sliceId')).toBe('sl-1');
		expect(hidden(form(dialogEl, '?/deleteSlice'), 'sliceId')).toBe('sl-1');
	});

	it('addStory carries the target cell, sending an empty sliceId for unsliced', async () => {
		const dialogEl = await open({
			kind: 'addStory',
			stepId: 's-9',
			sliceId: null,
			scopeLabel: 'Find a product · Unsliced'
		});

		const add = form(dialogEl, '?/addStory');
		expect(hidden(add, 'stepId')).toBe('s-9');
		// The server maps '' back to null; see `addStory` in +page.server.ts.
		expect(hidden(add, 'sliceId')).toBe('');
	});

	it('addStory carries a real sliceId when the target cell is in a slice band', async () => {
		const dialogEl = await open({
			kind: 'addStory',
			stepId: 's-9',
			sliceId: 'sl-3',
			scopeLabel: 'Find a product · Release 1'
		});

		expect(hidden(form(dialogEl, '?/addStory'), 'sliceId')).toBe('sl-3');
	});

	it('editStory prefills title and description and offers delete', async () => {
		const dialogEl = await open({
			kind: 'editStory',
			storyId: 'st-1',
			title: 'Search by keyword',
			description: 'Matches product name only.'
		});

		const edit = form(dialogEl, '?/editStory');
		expect(hidden(edit, 'storyId')).toBe('st-1');
		expect((edit.querySelector('input[name="title"]') as HTMLInputElement).value).toBe(
			'Search by keyword'
		);
		expect((edit.querySelector('textarea[name="description"]') as HTMLTextAreaElement).value).toBe(
			'Matches product name only.'
		);
		expect(hidden(form(dialogEl, '?/deleteStory'), 'storyId')).toBe('st-1');
	});

	it('editStory renders an empty description field for a story that has none', async () => {
		const dialogEl = await open({
			kind: 'editStory',
			storyId: 'st-2',
			title: 'Filter by category',
			description: null
		});

		const textarea = form(dialogEl, '?/editStory').querySelector(
			'textarea[name="description"]'
		) as HTMLTextAreaElement;
		expect(textarea.value).toBe('');
	});
});

describe('actionError', () => {
	it('reads the message out of a run-action failure payload', () => {
		expect(actionError({ error: 'Story title is required.' })).toBe('Story title is required.');
	});

	it('returns null for anything that is not such a payload', () => {
		expect(actionError(null)).toBeNull();
		expect(actionError({ other: 1 })).toBeNull();
		expect(actionError({ error: 42 })).toBeNull();
	});
});

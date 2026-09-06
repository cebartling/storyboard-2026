import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { tick } from 'svelte';
import BoardDialogs, { type BoardDialog, actionError } from './board-dialogs.svelte';
import type { SubjectStatus } from '$lib/board/dialog-subject';
import type { StoryId } from '$lib/domain/ids';
import type { BoardViewModel } from '$lib/board/board-view-model';
import type { Candidate } from '$lib/board/dependency-candidates';

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
async function open(
	dialog: BoardDialog,
	boardVersion = 3,
	extra: Partial<{
		story: { title: string; description: string | null } | null;
		subject: SubjectStatus | null;
		dependencies: BoardViewModel['dependencies'];
		candidates: Candidate[];
		onOpenDialog: (next: BoardDialog) => void;
	}> = {}
) {
	const result = render(BoardDialogs, {
		dialog,
		boardVersion,
		clientId: 'test-tab',
		onClose: () => {},
		onLateFailure: () => {},
		...extra
	});
	await tick();
	return Object.assign(page.getByTestId('board-dialog').element() as HTMLDialogElement, {
		rerender: result.rerender
	});
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

	// ADR 0014 §3. Every mutation carries the version its editor was opened at,
	// so a stale editor is refused rather than silently overwriting whoever got
	// there first.
	describe('the version each form carries', () => {
		const everyKind: BoardDialog[] = [
			{ kind: 'addActivity' },
			{ kind: 'editActivity', activityId: 'a-1', name: 'Browse' },
			{ kind: 'addStep', activityId: 'a-1', activityName: 'Browse' },
			{ kind: 'editStep', stepId: 's-1', name: 'Search' },
			{ kind: 'addSlice' },
			{ kind: 'editSlice', sliceId: 'sl-1', name: 'Release 1' },
			{ kind: 'addStory', stepId: 's-1', sliceId: null, scopeLabel: 'Search' },
			{ kind: 'editStory', storyId: 'st-1', title: 'Keyword search', description: null },
			// It renders forms now (ADR 0019) — a remove per edge, and the picker —
			// so it is held to the same rule as every other editor. Needs a story
			// and an edge, or it renders nothing to check.
			{ kind: 'viewStory', storyId: 'st-1' }
		];

		it.each(everyKind.map((dialog) => [dialog.kind, dialog] as const))(
			'%s sends the board version with every form it renders',
			async (_kind, dialog) => {
				const dialogEl = await open(dialog, 3, {
					story: { title: 'Keyword search', description: null },
					dependencies: [
						{
							blockerId: 'st-1' as StoryId,
							blockerTitle: 'Keyword search',
							blockedId: 'st-2' as StoryId,
							blockedTitle: 'Filter by price'
						}
					]
				});

				const forms = [...dialogEl.querySelectorAll('form')] as HTMLFormElement[];
				expect(forms.length).toBeGreaterThan(0);
				for (const formEl of forms) {
					expect(hidden(formEl, 'version')).toBe('3');
				}
			}
		);

		it('keeps the version it was opened at when the board moves on underneath it', async () => {
			// This is the whole point. Reading the live version at submit time
			// would mean a dialog opened before someone else's edit quietly adopts
			// their version and overwrites them — the exact bug the round-trip
			// exists to close, made *more* likely by live refetching.
			const subject: BoardDialog = { kind: 'editStep', stepId: 's-1', name: 'Search' };
			const dialogEl = await open(subject, 3);
			expect(hidden(form(dialogEl, '?/renameStep'), 'version')).toBe('3');

			// The same dialog object, a newer board: what a remote change looks
			// like to a dialog the user still has open.
			await dialogEl.rerender({ dialog: subject, boardVersion: 4 });
			await tick();

			expect(hidden(form(dialogEl, '?/renameStep'), 'version')).toBe('3');
		});
	});

	// `viewStory` is the read half of ADR 0018: the only place a description is
	// legible. It posts nothing, so unlike every other kind these tests are
	// about what it renders rather than which action it carries.
	describe('viewStory', () => {
		it('renders the description as markdown, not as source text', async () => {
			const dialogEl = await open({ kind: 'viewStory', storyId: 's-1' }, 3, {
				story: { title: 'Search by keyword', description: 'Needs **fuzzy** matching' }
			});

			const body = dialogEl.querySelector('.prose-note');

			expect(body?.querySelector('strong')?.textContent).toBe('fuzzy');
			expect(body?.textContent).not.toContain('**');
		});

		it('renders a list as list items', async () => {
			const dialogEl = await open({ kind: 'viewStory', storyId: 's-2' }, 3, {
				story: { title: 'Search', description: '- by name\n- by SKU' }
			});

			expect(dialogEl.querySelectorAll('.prose-note li')).toHaveLength(2);
		});

		it('shows the story title', async () => {
			const dialogEl = await open({ kind: 'viewStory', storyId: 's-3' }, 3, {
				story: { title: 'Search by keyword', description: 'x' }
			});

			expect(dialogEl.textContent).toContain('Search by keyword');
		});

		// A description is optional in the domain, so the empty case is normal
		// rather than degenerate and gets a sentence instead of a blank panel.
		it('says so when there is no description', async () => {
			const dialogEl = await open({ kind: 'viewStory', storyId: 's-4' }, 3, {
				story: { title: 'Search', description: null }
			});

			expect(dialogEl.querySelector('.prose-note')).toBeNull();
			expect(dialogEl.textContent).toMatch(/no description/i);
		});

		// The load-bearing assertion. There is no CSP behind this `{@html}`, and
		// the description was written by a different account (ADR 0015).
		it('strips script and inline handlers out of a hostile description', async () => {
			const dialogEl = await open({ kind: 'viewStory', storyId: 's-5' }, 3, {
				story: {
					title: 'Search',
					description:
						'<script>globalThis.pwned = true;</script><img src=x onerror="globalThis.pwned = true">'
				}
			});

			expect(dialogEl.querySelector('script, iframe')).toBeNull();
			expect(dialogEl.innerHTML).not.toMatch(/onerror/i);
			expect((globalThis as Record<string, unknown>).pwned).toBeUndefined();
		});

		// Read and edit are one click apart, in both directions: the dialog is
		// the only surface that knows which story is being looked at.
		it('offers an edit trigger that swaps to the story editor', async () => {
			let opened: BoardDialog | null = null;
			await open({ kind: 'viewStory', storyId: 's-6' }, 3, {
				story: { title: 'Search', description: 'x' },
				onOpenDialog: (next) => (opened = next)
			});

			await page.getByRole('button', { name: 'Edit story' }).click();

			expect(opened).toEqual({
				kind: 'editStory',
				storyId: 's-6',
				title: 'Search',
				description: 'x'
			});
		});

		// It used to carry no form at all (ADR 0018). Dependencies changed that
		// (ADR 0019), but only for them: the story's own fields are still read
		// here and edited elsewhere.
		it('has no form until it has a dependency to remove', async () => {
			const dialogEl = await open({ kind: 'viewStory', storyId: 's-7' }, 3, {
				story: { title: 'Search', description: 'x' }
			});

			expect(dialogEl.querySelector('form')).toBeNull();
		});

		// The ADR 0014 banner says "there is nothing left to save", which is an
		// answer to a question a read-only view never asks. It gets one message
		// about the disappearance, in its own words, not two.
		it('reports a deleted story once, without the editing banner', async () => {
			const dialogEl = await open({ kind: 'viewStory', storyId: 's-8' }, 3, {
				story: null,
				subject: { status: 'deleted' }
			});

			expect(dialogEl.querySelector('[data-testid="subject-deleted"]')).toBeNull();
			expect(dialogEl.textContent).toContain('This story no longer exists.');
		});

		// The same status on an editor still gets the banner: this narrowed the
		// notice for one kind, it did not remove it.
		it('still shows the editing banner when an editor is open', async () => {
			const dialogEl = await open(
				{ kind: 'editStory', storyId: 's-9', title: 'Search', description: null },
				3,
				{ subject: { status: 'deleted' } }
			);

			expect(dialogEl.querySelector('[data-testid="subject-deleted"]')).not.toBeNull();
		});
	});

	// Dependencies live in the detail view (ADR 0019).
	describe('viewStory dependencies', () => {
		const edge = {
			blockerId: 'st-1' as StoryId,
			blockerTitle: 'Create a product',
			blockedId: 'st-2' as StoryId,
			blockedTitle: 'Search by keyword'
		};
		const story = { title: 'Create a product', description: null };
		const candidates: Candidate[] = [
			{
				id: 'st-3' as StoryId,
				title: 'Filter by price',
				stepName: 'Filter',
				sliceName: 'Unsliced'
			},
			{ id: 'st-4' as StoryId, title: 'Sort results', stepName: 'Filter', sliceName: 'Unsliced' }
		];

		it('lists what this story blocks, and what blocks it, separately', async () => {
			const dialogEl = await open({ kind: 'viewStory', storyId: 'st-1' }, 3, {
				story,
				dependencies: [
					edge,
					{
						blockerId: 'st-9' as StoryId,
						blockerTitle: 'Sign in',
						blockedId: 'st-1' as StoryId,
						blockedTitle: 'Create a product'
					}
				]
			});

			expect(dialogEl.querySelector('[data-testid="blocks-list"]')?.textContent).toContain(
				'Search by keyword'
			);
			expect(dialogEl.querySelector('[data-testid="blocked-by-list"]')?.textContent).toContain(
				'Sign in'
			);
		});

		it('says so when there are none', async () => {
			const dialogEl = await open({ kind: 'viewStory', storyId: 'st-1' }, 3, { story });

			expect(dialogEl.textContent).toContain('No dependencies');
		});

		it('carries the oriented pair on the remove form', async () => {
			const dialogEl = await open({ kind: 'viewStory', storyId: 'st-1' }, 3, {
				story,
				dependencies: [edge]
			});

			const removeForm = form(dialogEl, '?/removeDependency');
			expect(hidden(removeForm, 'blockerId')).toBe('st-1');
			expect(hidden(removeForm, 'blockedId')).toBe('st-2');
		});

		// Collapsed on open so `Modal`'s focus-the-first-field effect has nothing
		// to take focus onto — the reader opened this to read the description.
		it('keeps the picker collapsed until it is asked for', async () => {
			const dialogEl = await open({ kind: 'viewStory', storyId: 'st-1' }, 3, {
				story,
				candidates
			});

			expect(dialogEl.querySelector('input[type="search"]')).toBeNull();

			await page.getByRole('button', { name: 'Add dependency' }).click();

			await expect.element(page.getByRole('searchbox')).toBeVisible();
		});

		it('narrows the candidates as the query changes, and says how many it hides', async () => {
			const dialogEl = await open({ kind: 'viewStory', storyId: 'st-1' }, 3, {
				story,
				candidates
			});
			await page.getByRole('button', { name: 'Add dependency' }).click();

			await page.getByRole('searchbox').fill('Sort');

			const group = dialogEl.querySelector('[role="radiogroup"]')!;
			expect(group.querySelectorAll('input[type="radio"]')).toHaveLength(1);
			expect(dialogEl.querySelector('[data-testid="candidate-count"]')?.textContent).toContain(
				'1 of 1'
			);
		});

		// Choosing a story and then narrowing past it: the radio unmounts, but
		// Svelte's bind:group teardown only removes the input from the group — it
		// never clears the bound value. Left alone, Add stays enabled and posts a
		// form with no `otherId`, which the server answers with a raw field name.
		it('will not submit a candidate the query has hidden', async () => {
			const dialogEl = await open({ kind: 'viewStory', storyId: 'st-1' }, 3, {
				story,
				candidates
			});
			await page.getByRole('button', { name: 'Add dependency' }).click();
			await page.getByRole('radio', { name: /Sort results/ }).click();

			// 'price' matches the other candidate's title only — both fixtures share
			// the step name 'Filter', so filtering on that hides neither.
			await page.getByRole('searchbox').fill('price');

			const add = dialogEl.querySelector<HTMLButtonElement>(
				'form[action="?/addDependency"] button[type="submit"]'
			)!;
			expect(dialogEl.querySelector('input[name="otherId"]:checked')).toBeNull();
			expect(add.disabled).toBe(true);
		});

		it('will not submit until a candidate is chosen', async () => {
			const dialogEl = await open({ kind: 'viewStory', storyId: 'st-1' }, 3, {
				story,
				candidates
			});
			await page.getByRole('button', { name: 'Add dependency' }).click();

			const add = dialogEl.querySelector<HTMLButtonElement>(
				'form[action="?/addDependency"] button[type="submit"]'
			)!;
			expect(add.disabled).toBe(true);

			await page.getByRole('radio', { name: /Sort results/ }).click();

			expect(add.disabled).toBe(false);
		});

		it('offers no picker when every other story is already linked', async () => {
			const dialogEl = await open({ kind: 'viewStory', storyId: 'st-1' }, 3, {
				story,
				candidates: []
			});

			const trigger = dialogEl.querySelector<HTMLButtonElement>('button:not([type="submit"])');
			expect(
				[...dialogEl.querySelectorAll('button')].find((b) =>
					b.textContent?.includes('Add dependency')
				)?.disabled
			).toBe(true);
			expect(trigger).not.toBeNull();
		});
	});
});

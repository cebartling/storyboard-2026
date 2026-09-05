import { describe, expect, it } from 'vitest';
import {
	addActivity,
	addSlice,
	addStep,
	addStory,
	createStoryMap,
	deleteStory,
	editStory
} from '$lib/domain/story-map';
import type { ActivityId, SliceId, StepId, StoryId } from '$lib/domain/ids';
import type { BoardDialog } from '$lib/components/board-dialogs.svelte';
import { buildBoardViewModel } from './board-view-model';
import { subjectStatus } from './dialog-subject';

function board() {
	let map = createStoryMap('Retail');
	const activity = addActivity(map, 'Browse');
	map = activity.map;
	const step = addStep(map, activity.activity.id, 'Search');
	map = step.map;
	const slice = addSlice(map, 'Release 1');
	map = slice.map;
	const story = addStory(map, step.step.id, 'Keyword search', { description: 'By name' });
	map = story.map;

	return {
		view: buildBoardViewModel(map),
		map,
		activityId: activity.activity.id as ActivityId,
		stepId: step.step.id as StepId,
		sliceId: slice.slice.id as SliceId,
		storyId: story.story.id as StoryId
	};
}

describe('subjectStatus', () => {
	describe('when nothing has moved', () => {
		it.each<[string, (c: ReturnType<typeof board>) => BoardDialog]>([
			['addActivity', () => ({ kind: 'addActivity' })],
			['addSlice', () => ({ kind: 'addSlice' })],
			['shareMap', () => ({ kind: 'shareMap', mapName: 'Retail' })],
			['editActivity', (c) => ({ kind: 'editActivity', activityId: c.activityId, name: 'Browse' })],
			['editStep', (c) => ({ kind: 'editStep', stepId: c.stepId, name: 'Search' })],
			['editSlice', (c) => ({ kind: 'editSlice', sliceId: c.sliceId, name: 'Release 1' })],
			[
				'editStory',
				(c) => ({
					kind: 'editStory',
					storyId: c.storyId,
					title: 'Keyword search',
					description: 'By name'
				})
			],
			['viewStory', (c) => ({ kind: 'viewStory', storyId: c.storyId })]
		])('%s is current', (_kind, build) => {
			const c = board();
			expect(subjectStatus(build(c), c.view).status).toBe('current');
		});
	});

	describe('when someone else changed the subject', () => {
		it('reports an activity rename, with the name it now has', () => {
			const c = board();
			const dialog: BoardDialog = {
				kind: 'editActivity',
				activityId: c.activityId,
				name: 'Browse'
			};
			const renamed = buildBoardViewModel({
				...c.map,
				activities: c.map.activities.map((a) => ({ ...a, name: 'Discover' }))
			});

			const status = subjectStatus(dialog, renamed);

			expect(status).toEqual({
				status: 'changed',
				current: { kind: 'editActivity', activityId: c.activityId, name: 'Discover' }
			});
		});

		it('reports a story edit, carrying both fields as they now are', () => {
			const c = board();
			const dialog: BoardDialog = {
				kind: 'editStory',
				storyId: c.storyId,
				title: 'Keyword search',
				description: 'By name'
			};
			const edited = buildBoardViewModel({
				...c.map,
				stories: c.map.stories.map((s) => ({ ...s, title: 'Search by SKU', description: null }))
			});

			expect(subjectStatus(dialog, edited)).toEqual({
				status: 'changed',
				current: {
					kind: 'editStory',
					storyId: c.storyId,
					title: 'Search by SKU',
					description: null
				}
			});
		});

		it('does not report a story that only moved cell', () => {
			// A move changes which cell holds the card, not the card. Warning about
			// it would train people to ignore the warning.
			const c = board();
			const dialog: BoardDialog = {
				kind: 'editStory',
				storyId: c.storyId,
				title: 'Keyword search',
				description: 'By name'
			};
			const moved = buildBoardViewModel({
				...c.map,
				stories: c.map.stories.map((s) => ({ ...s, sliceId: c.sliceId }))
			});

			expect(subjectStatus(dialog, moved).status).toBe('current');
		});
	});

	describe('when someone else deleted the subject', () => {
		const gone = () => {
			const c = board();
			return {
				c,
				empty: buildBoardViewModel({
					...c.map,
					activities: [],
					slices: [],
					stories: []
				})
			};
		};

		it.each<[string, (c: ReturnType<typeof board>) => BoardDialog]>([
			['editActivity', (c) => ({ kind: 'editActivity', activityId: c.activityId, name: 'Browse' })],
			['editStep', (c) => ({ kind: 'editStep', stepId: c.stepId, name: 'Search' })],
			['editSlice', (c) => ({ kind: 'editSlice', sliceId: c.sliceId, name: 'Release 1' })],
			[
				'editStory',
				(c) => ({
					kind: 'editStory',
					storyId: c.storyId,
					title: 'Keyword search',
					description: null
				})
			],
			// Not a subject of its own, but its parent is gone: adding a step to a
			// deleted activity fails confusingly.
			['addStep', (c) => ({ kind: 'addStep', activityId: c.activityId, activityName: 'Browse' })],
			[
				'addStory',
				(c) => ({ kind: 'addStory', stepId: c.stepId, sliceId: null, scopeLabel: 'Search' })
			]
		])('%s is deleted', (_kind, build) => {
			const { c, empty } = gone();
			expect(subjectStatus(build(c), empty).status).toBe('deleted');
		});

		it('reports addStory as deleted when its slice band is gone', () => {
			const c = board();
			const dialog: BoardDialog = {
				kind: 'addStory',
				stepId: c.stepId,
				sliceId: c.sliceId,
				scopeLabel: 'Search · Release 1'
			};
			const withoutSlice = buildBoardViewModel({ ...c.map, slices: [] });

			expect(subjectStatus(dialog, withoutSlice).status).toBe('deleted');
		});
	});

	// The read-only detail view (ADR 0018) is the one kind that can never be
	// `changed`. It holds no pending input, so there is nothing for a
	// collaborator's edit to overwrite — the board is its source of truth and it
	// simply re-renders. Only the story disappearing is worth reporting.
	describe('viewStory', () => {
		it('stays current when someone else edits the story it is showing', () => {
			const c = board();
			const edited = buildBoardViewModel(
				editStory(c.map, c.storyId, { title: 'Search by SKU', description: 'By name or SKU' })
			);

			expect(subjectStatus({ kind: 'viewStory', storyId: c.storyId }, edited).status).toBe(
				'current'
			);
		});

		it('is deleted once the story is gone', () => {
			const c = board();
			const without = buildBoardViewModel(deleteStory(c.map, c.storyId));

			expect(subjectStatus({ kind: 'viewStory', storyId: c.storyId }, without).status).toBe(
				'deleted'
			);
		});
	});
});

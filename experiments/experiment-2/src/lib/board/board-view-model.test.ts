import { describe, expect, it } from 'vitest';
import { buildBoardViewModel } from './board-view-model';
import { addActivity, addSlice, addStep, addStory, createStoryMap } from '$lib/domain/story-map';
import type { StoryMap } from '$lib/domain/story-map';

/**
 * `buildBoardViewModel` is pure grid arithmetic over the aggregate, so it is
 * unit-testable without a database — which is why it lives in its own module
 * rather than inside `+page.server.ts` (importing that would boot `deps` and
 * open SQLite).
 */

/** Builds a map with the given activities, each carrying the named steps. */
function mapWith(shape: { activity: string; steps: string[] }[]): StoryMap {
	let map = createStoryMap('Test map');
	for (const { activity, steps } of shape) {
		const added = addActivity(map, activity);
		map = added.map;
		for (const name of steps) {
			map = addStep(map, added.activity.id, name).map;
		}
	}
	return map;
}

describe('buildBoardViewModel', () => {
	it('carries the aggregate version, so the client can send it back with a mutation', () => {
		// Dropping `version` here is what made cross-user editing silently
		// last-write-wins: with no version on the client, every request loaded and
		// saved within itself and the compare-and-set window was one request
		// rather than one editing session (ADR 0014 §3).
		const map = { ...mapWith([{ activity: 'Browse', steps: ['Search'] }]), version: 7 };

		expect(buildBoardViewModel(map).version).toBe(7);
	});

	it('reserves exactly one grid track per content column', () => {
		const map = mapWith([
			{ activity: 'Find groceries', steps: ['Search', 'Browse'] },
			{ activity: 'Check out', steps: ['Pay'] }
		]);

		const board = buildBoardViewModel(map);

		// The template is `max-content repeat(totalColumns, ...)`: the gutter is
		// the max-content track, so totalColumns must be exactly the number of
		// step columns. Anything larger renders a permanently empty column.
		expect(board.totalColumns).toBe(board.columns.length);
	});

	it('still reserves a column for an activity that has no steps yet', () => {
		const map = mapWith([
			{ activity: 'Find groceries', steps: ['Search'] },
			{ activity: 'Empty so far', steps: [] }
		]);

		const board = buildBoardViewModel(map);

		// One step column plus one reserved column for the step-less activity.
		expect(board.totalColumns).toBe(2);
		expect(board.columns).toHaveLength(1);
	});

	it('numbers columns from 2 so column 1 stays the row-label gutter', () => {
		const map = mapWith([{ activity: 'Find groceries', steps: ['Search', 'Browse'] }]);

		const board = buildBoardViewModel(map);

		expect(board.columns.map((c) => c.gridColumn)).toEqual([2, 3]);
		expect(board.activityHeaders[0]).toMatchObject({ gridColumnStart: 2, gridColumnEnd: 4 });
	});

	it('places each slice in its own row band with the unsliced band last', () => {
		let map = mapWith([{ activity: 'Find groceries', steps: ['Search'] }]);
		map = addSlice(map, 'Release 1').map;
		map = addSlice(map, 'Release 2').map;

		const board = buildBoardViewModel(map);

		expect(board.rows.map((r) => r.gridRow)).toEqual([3, 4, 5]);
		expect(board.rows.at(-1)).toMatchObject({ sliceId: null, name: 'Unsliced' });
	});

	it('files each story into the cell for its step and slice', () => {
		let map = mapWith([{ activity: 'Find groceries', steps: ['Search'] }]);
		const slice = addSlice(map, 'Release 1');
		map = slice.map;
		const stepId = map.activities[0].steps[0].id;
		map = addStory(map, stepId, 'Keyword search', { sliceId: slice.slice.id }).map;
		map = addStory(map, stepId, 'Aisle filters').map;

		const board = buildBoardViewModel(map);

		const sliced = board.cells.find((c) => c.stepId === stepId && c.sliceId === slice.slice.id);
		const unsliced = board.cells.find((c) => c.stepId === stepId && c.sliceId === null);
		expect(sliced?.stories.map((s) => s.title)).toEqual(['Keyword search']);
		expect(unsliced?.stories.map((s) => s.title)).toEqual(['Aisle filters']);
	});
});

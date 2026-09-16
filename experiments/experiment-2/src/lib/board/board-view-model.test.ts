import { describe, expect, it } from 'vitest';
import { buildBoardViewModel } from './board-view-model';
import {
	addActivity,
	addDependency,
	addSlice,
	addStep,
	addStory,
	createStoryMap
} from '$lib/domain/story-map';
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

describe('dependencies', () => {
	/** One step carrying three stories, A blocks B and C blocks B. */
	function linkedMap() {
		let map = createStoryMap('Retail');
		const activity = addActivity(map, 'Browse');
		map = activity.map;
		const step = addStep(map, activity.activity.id, 'Search');
		map = step.map;
		const a = addStory(map, step.step.id, 'A');
		map = a.map;
		const b = addStory(map, step.step.id, 'B');
		map = b.map;
		const c = addStory(map, step.step.id, 'C');
		map = c.map;
		map = addDependency(map, a.story.id, b.story.id);
		map = addDependency(map, c.story.id, b.story.id);
		return { map, stepId: step.step.id, a: a.story.id, b: b.story.id, c: c.story.id };
	}

	function storyIn(board: ReturnType<typeof buildBoardViewModel>, title: string) {
		return board.cells.flatMap((cell) => cell.stories).find((s) => s.title === title)!;
	}

	it('counts both directions on the right story', () => {
		const board = buildBoardViewModel(linkedMap().map);

		expect(storyIn(board, 'B')).toMatchObject({ blockedByCount: 2, blocksCount: 0 });
		expect(storyIn(board, 'A')).toMatchObject({ blockedByCount: 0, blocksCount: 1 });
	});

	it('gives an unlinked story zero in both directions', () => {
		let map = createStoryMap('Retail');
		const activity = addActivity(map, 'Browse');
		map = activity.map;
		const step = addStep(map, activity.activity.id, 'Search');
		map = step.map;
		map = addStory(map, step.step.id, 'Alone').map;

		const board = buildBoardViewModel(map);

		expect(storyIn(board, 'Alone')).toMatchObject({ blockedByCount: 0, blocksCount: 0 });
		expect(board.dependencies).toEqual([]);
	});

	it('resolves both endpoints to titles', () => {
		const { map, a, b } = linkedMap();

		const board = buildBoardViewModel(map);

		expect(board.dependencies).toContainEqual({
			blockerId: a,
			blockerTitle: 'A',
			blockedId: b,
			blockedTitle: 'B'
		});
	});

	// The domain's cascades mean this cannot happen through the app, but a
	// fixture that spreads a partial map reaches it — `dialog-subject.test.ts`
	// builds a board from `{ ...map, stories: [] }`. Dropping the row beats
	// rendering "undefined blocks undefined".
	it('drops an edge whose endpoints are not on the board', () => {
		const { map } = linkedMap();

		const board = buildBoardViewModel({ ...map, stories: [] });

		expect(board.dependencies).toEqual([]);
	});

	it('carries each story’s status onto its cell', () => {
		// The card's tint comes from here, and a cell that dropped the field
		// would paint every story in the default rather than fail.
		let map = createStoryMap('Retail');
		const activity = addActivity(map, 'Browse');
		map = activity.map;
		const step = addStep(map, activity.activity.id, 'Search');
		map = step.map;
		map = addStory(map, step.step.id, 'Started', { status: 'in-progress' }).map;
		map = addStory(map, step.step.id, 'Untouched').map;

		const board = buildBoardViewModel(map);

		expect(storyIn(board, 'Started').status).toBe('in-progress');
		expect(storyIn(board, 'Untouched').status).toBe('todo');
	});
});

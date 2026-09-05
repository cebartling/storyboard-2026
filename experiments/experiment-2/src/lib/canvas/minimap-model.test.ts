import { describe, expect, it } from 'vitest';
import { toMinimapModel } from './minimap-model';
import { buildBoardViewModel } from '$lib/board/board-view-model';
import { addActivity, addSlice, addStep, addStory, createStoryMap } from '$lib/domain/story-map';
import type { StoryMap } from '$lib/domain/story-map';

/**
 * `toMinimapModel` reads a structural subset of `BoardViewModel`, so building
 * a real one via the domain layer (same style as `board-view-model.test.ts`)
 * exercises it against the shapes the route actually produces, without this
 * module importing the route.
 */
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

describe('toMinimapModel', () => {
	it('carries the board column count through unchanged', () => {
		const map = mapWith([{ activity: 'Find groceries', steps: ['Search', 'Browse'] }]);
		const board = buildBoardViewModel(map);

		const minimap = toMinimapModel(board);

		expect(minimap.columns).toBe(board.totalColumns);
	});

	it('renders one row per board row, in the same order, with the unsliced band last', () => {
		let map = mapWith([{ activity: 'Find groceries', steps: ['Search'] }]);
		map = addSlice(map, 'Release 1').map;
		const board = buildBoardViewModel(map);

		const minimap = toMinimapModel(board);

		expect(minimap.rows.map((r) => r.name)).toEqual(['Release 1', 'Unsliced']);
		expect(minimap.rows.at(-1)).toMatchObject({ sliceId: null, name: 'Unsliced' });
	});

	it('re-indexes grid-column/grid-row coordinates to 0-based col/row', () => {
		let map = mapWith([{ activity: 'Find groceries', steps: ['Search', 'Browse'] }]);
		map = addSlice(map, 'Release 1').map;
		const board = buildBoardViewModel(map);

		const minimap = toMinimapModel(board);

		// Two columns (grid columns 2, 3) and two rows (Release 1, Unsliced) ->
		// four cells at 0-based (col, row) pairs, none referencing the gutter
		// column or header rows.
		expect(minimap.cells).toHaveLength(4);
		const coords = minimap.cells.map((c) => `${c.col},${c.row}`).sort();
		expect(coords).toEqual(['0,0', '0,1', '1,0', '1,1']);
	});

	it('counts stories per cell', () => {
		let map = mapWith([{ activity: 'Find groceries', steps: ['Search'] }]);
		const stepId = map.activities[0].steps[0].id;
		map = addStory(map, stepId, 'Keyword search').map;
		map = addStory(map, stepId, 'Aisle filters').map;
		const board = buildBoardViewModel(map);

		const minimap = toMinimapModel(board);

		const cell = minimap.cells.find((c) => c.col === 0 && c.row === 0);
		expect(cell?.storyCount).toBe(2);
	});

	it('produces an empty cell list for a board with no columns or rows', () => {
		const map = createStoryMap('Empty map');
		const board = buildBoardViewModel(map);

		const minimap = toMinimapModel(board);

		expect(minimap.cells).toEqual([]);
		expect(minimap.rows.map((r) => r.name)).toEqual(['Unsliced']);
	});
});

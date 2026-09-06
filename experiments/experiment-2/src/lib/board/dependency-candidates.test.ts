import { describe, expect, it } from 'vitest';
import {
	addActivity,
	addDependency,
	addSlice,
	addStep,
	addStory,
	createStoryMap
} from '$lib/domain/story-map';
import { buildBoardViewModel } from './board-view-model';
import { candidateStories, filterCandidates } from './dependency-candidates';

/** Two steps under one activity, one release slice, four stories spread over them. */
function board() {
	let map = createStoryMap('Retail');
	const activity = addActivity(map, 'Browse');
	map = activity.map;
	const search = addStep(map, activity.activity.id, 'Search');
	map = search.map;
	const filter = addStep(map, activity.activity.id, 'Filter and sort');
	map = filter.map;
	const slice = addSlice(map, 'Release 1');
	map = slice.map;

	const keyword = addStory(map, search.step.id, 'Search by keyword', { sliceId: slice.slice.id });
	map = keyword.map;
	const price = addStory(map, filter.step.id, 'Filter by price');
	map = price.map;
	const sort = addStory(map, filter.step.id, 'Sort results');
	map = sort.map;
	const sku = addStory(map, search.step.id, 'Search by SKU');
	map = sku.map;

	return {
		map,
		ids: {
			keyword: keyword.story.id,
			price: price.story.id,
			sort: sort.story.id,
			sku: sku.story.id
		}
	};
}

describe('candidateStories', () => {
	it('offers every other story on the board', () => {
		const { map, ids } = board();

		const candidates = candidateStories(buildBoardViewModel(map), ids.keyword);

		expect(candidates.map((c) => c.title).sort()).toEqual([
			'Filter by price',
			'Search by SKU',
			'Sort results'
		]);
	});

	it('never offers the story itself', () => {
		const { map, ids } = board();

		const candidates = candidateStories(buildBoardViewModel(map), ids.keyword);

		expect(candidates.some((c) => c.id === ids.keyword)).toBe(false);
	});

	// Both directions, though only one of them would be a duplicate — the other
	// would be a cycle. Neither is a row worth offering.
	it('excludes stories already linked, whichever way round', () => {
		const { map, ids } = board();
		const linked = addDependency(addDependency(map, ids.keyword, ids.price), ids.sort, ids.keyword);

		const candidates = candidateStories(buildBoardViewModel(linked), ids.keyword);

		expect(candidates.map((c) => c.title)).toEqual(['Search by SKU']);
	});

	// Two stories can share a title on a large map, so a row has to say where it
	// sits or the picker is a guess.
	it('says which step and slice each candidate sits in', () => {
		const { map, ids } = board();

		const candidates = candidateStories(buildBoardViewModel(map), ids.price);

		expect(candidates.find((c) => c.title === 'Search by keyword')).toMatchObject({
			stepName: 'Search',
			sliceName: 'Release 1'
		});
		expect(candidates.find((c) => c.title === 'Sort results')).toMatchObject({
			stepName: 'Filter and sort',
			sliceName: 'Unsliced'
		});
	});
});

describe('filterCandidates', () => {
	function all() {
		const { map, ids } = board();
		return candidateStories(buildBoardViewModel(map), ids.price);
	}

	it('returns everything for an empty query', () => {
		const candidates = all();

		expect(filterCandidates(candidates, '   ', 50).shown).toHaveLength(candidates.length);
	});

	it('matches part of a title, ignoring case', () => {
		expect(
			filterCandidates(all(), 'SEARCH BY', 50)
				.shown.map((c) => c.title)
				.sort()
		).toEqual(['Search by SKU', 'Search by keyword']);
	});

	// The step name is worth matching too: "everything in Filter and sort" is a
	// question people ask, and the title alone cannot answer it.
	it('matches the step name as well as the title', () => {
		expect(filterCandidates(all(), 'filter and', 50).shown.map((c) => c.title)).toEqual([
			'Sort results'
		]);
	});

	it('caps the list but reports the untruncated total', () => {
		const result = filterCandidates(all(), '', 1);

		expect(result.shown).toHaveLength(1);
		expect(result.total).toBe(3);
	});
});

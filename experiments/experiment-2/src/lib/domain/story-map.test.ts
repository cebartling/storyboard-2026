import { describe, expect, it } from 'vitest';
import { ConflictError, InvariantError } from './errors';
import type { StoryId } from './ids';
import {
	addAcceptanceCriterion,
	addActivity,
	addDependency,
	addSlice,
	addStep,
	addStory,
	createStoryMap,
	deleteActivity,
	deleteSlice,
	deleteStep,
	deleteStory,
	editAcceptanceCriterion,
	editStory,
	findActivity,
	findStory,
	inRankOrder,
	isStoryStatus,
	moveAcceptanceCriterion,
	moveActivity,
	moveSlice,
	moveStep,
	moveStory,
	renameActivity,
	renameSlice,
	removeAcceptanceCriterion,
	removeDependency,
	renameStep,
	STORY_STATUSES,
	type StoryMap
} from './story-map';

function sortByRank<T extends { rank: string }>(items: T[]): T[] {
	return [...items].sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
}

/** Builds a map with one activity, one step, and (optionally) stories on it. */
function mapWithOneStep() {
	let map = createStoryMap('Test map');
	const a = addActivity(map, 'Activity 1');
	map = a.map;
	const s = addStep(map, a.activity.id, 'Step 1');
	map = s.map;
	return { map, activityId: a.activity.id, stepId: s.step.id };
}

describe('createStoryMap', () => {
	it('starts empty', () => {
		const map = createStoryMap('New map');
		expect(map.name).toBe('New map');
		expect(map.activities).toEqual([]);
		expect(map.slices).toEqual([]);
		expect(map.stories).toEqual([]);
		expect(map.dependencies).toEqual([]);
	});
});

describe('addActivity / addStep / addSlice / addStory', () => {
	it('appends activities to the end of the backbone in rank order', () => {
		let map = createStoryMap('m');
		const a1 = addActivity(map, 'First');
		map = a1.map;
		const a2 = addActivity(map, 'Second');
		map = a2.map;
		const a3 = addActivity(map, 'Third');
		map = a3.map;

		expect(sortByRank(map.activities).map((a) => a.name)).toEqual(['First', 'Second', 'Third']);
	});

	it('scopes step rank to its activity, independent of other activities', () => {
		let map = createStoryMap('m');
		const a1 = addActivity(map, 'A1');
		map = a1.map;
		const a2 = addActivity(map, 'A2');
		map = a2.map;

		map = addStep(map, a1.activity.id, 'A1-Step1').map;
		map = addStep(map, a2.activity.id, 'A2-Step1').map;
		map = addStep(map, a1.activity.id, 'A1-Step2').map;

		const activity1 = map.activities.find((a) => a.id === a1.activity.id)!;
		expect(sortByRank(activity1.steps).map((s) => s.name)).toEqual(['A1-Step1', 'A1-Step2']);
	});

	it('rejects addStep for an unknown activity', () => {
		const map = createStoryMap('m');
		expect(() => addStep(map, 'nope' as never, 'Step')).toThrow(/Activity not found/);
	});

	it('adds a story to the unsliced band by default', () => {
		const { map, stepId } = mapWithOneStep();
		const { story } = addStory(map, stepId, 'A story');
		expect(story.sliceId).toBeNull();
		expect(story.stepId).toBe(stepId);
	});

	it('adds a story in the default status', () => {
		const { map, stepId } = mapWithOneStep();
		const { story } = addStory(map, stepId, 'A story');
		expect(story.status).toBe('todo');
	});

	it('adds a story in an explicit status', () => {
		const { map, stepId } = mapWithOneStep();
		const { story } = addStory(map, stepId, 'A story', { status: 'in-review' });
		expect(story.status).toBe('in-review');
	});

	it('rejects addStory for an unknown step', () => {
		const map = createStoryMap('m');
		expect(() => addStory(map, 'nope' as never, 'Story')).toThrow(/Step not found/);
	});

	it('rejects addStory with a sliceId from a different map', () => {
		const { map, stepId } = mapWithOneStep();
		const otherMap = addSlice(createStoryMap('other'), 'Release 1');
		expect(() => addStory(map, stepId, 'Story', { sliceId: otherMap.slice.id })).toThrow(
			/does not belong to map/
		);
	});

	it('scopes story rank to (stepId, sliceId): unsliced and sliced bands rank independently', () => {
		const initial = mapWithOneStep();
		let map = initial.map;
		const { stepId } = initial;
		const sliceResult = addSlice(map, 'Release 1');
		map = sliceResult.map;
		const sliceId = sliceResult.slice.id;

		map = addStory(map, stepId, 'Unsliced A').map;
		map = addStory(map, stepId, 'Unsliced B').map;
		map = addStory(map, stepId, 'Sliced A', { sliceId }).map;

		const unsliced = sortByRank(map.stories.filter((s) => s.sliceId === null));
		const sliced = sortByRank(map.stories.filter((s) => s.sliceId === sliceId));
		expect(unsliced.map((s) => s.title)).toEqual(['Unsliced A', 'Unsliced B']);
		expect(sliced.map((s) => s.title)).toEqual(['Sliced A']);
	});
});

describe('rename / edit', () => {
	it('renames an activity, step, and slice', () => {
		const initial = mapWithOneStep();
		let map = initial.map;
		const { activityId, stepId } = initial;
		const slice = addSlice(map, 'Old slice name');
		map = slice.map;

		map = renameActivity(map, activityId, 'Renamed activity');
		map = renameStep(map, stepId, 'Renamed step');
		map = renameSlice(map, slice.slice.id, 'Renamed slice');

		expect(map.activities[0].name).toBe('Renamed activity');
		expect(map.activities[0].steps[0].name).toBe('Renamed step');
		expect(map.slices[0].name).toBe('Renamed slice');
	});

	it('edits a story title and description', () => {
		const { map, stepId } = mapWithOneStep();
		const { map: map2, story } = addStory(map, stepId, 'Original', { description: null });
		const map3 = editStory(map2, story.id, { title: 'Updated', description: 'now has one' });
		const updated = findStory(map3, story.id);
		expect(updated.title).toBe('Updated');
		expect(updated.description).toBe('now has one');
	});

	it('edits a story status', () => {
		const { map, stepId } = mapWithOneStep();
		const { map: map2, story } = addStory(map, stepId, 'Original');
		const map3 = editStory(map2, story.id, { status: 'done' });
		expect(findStory(map3, story.id).status).toBe('done');
	});

	// The regression the `?? s.status` form exists to prevent: the edit dialog
	// posts every field, but the detail dialog and any future caller need not,
	// and an omitted status must not reset a story to `todo`.
	it('leaves status alone when an edit does not mention it', () => {
		const { map, stepId } = mapWithOneStep();
		const { map: map2, story } = addStory(map, stepId, 'Original', { status: 'in-progress' });
		const map3 = editStory(map2, story.id, { title: 'Updated' });
		const updated = findStory(map3, story.id);
		expect(updated.title).toBe('Updated');
		expect(updated.status).toBe('in-progress');
	});
});

describe('isStoryStatus', () => {
	it('accepts every declared status and rejects anything else', () => {
		for (const status of STORY_STATUSES) expect(isStoryStatus(status)).toBe(true);
		expect(isStoryStatus('In progress')).toBe(false);
		expect(isStoryStatus('')).toBe(false);
		expect(isStoryStatus(undefined)).toBe(false);
	});
});

describe('delete', () => {
	it('deleting an activity cascades to its steps and their stories', () => {
		const initial = mapWithOneStep();
		let map = initial.map;
		const { activityId, stepId } = initial;
		const storyResult = addStory(map, stepId, 'Doomed story');
		map = storyResult.map;
		const storyId = storyResult.story.id;

		const map2 = deleteActivity(map, activityId);

		expect(map2.activities.find((a) => a.id === activityId)).toBeUndefined();
		expect(map2.stories.find((s) => s.id === storyId)).toBeUndefined();
	});

	it('deleting a step cascades to its stories only', () => {
		const initial = mapWithOneStep();
		let map = initial.map;
		const { activityId, stepId } = initial;
		const otherStep = addStep(map, activityId, 'Other step');
		map = otherStep.map;

		const doomed = addStory(map, stepId, 'Doomed');
		map = doomed.map;
		const survivor = addStory(map, otherStep.step.id, 'Survivor');
		map = survivor.map;

		const map2 = deleteStep(map, stepId);

		expect(map2.stories.find((s) => s.id === doomed.story.id)).toBeUndefined();
		expect(map2.stories.find((s) => s.id === survivor.story.id)).toBeDefined();
	});

	it('deleting a slice un-slices its stories rather than deleting them', () => {
		const initial = mapWithOneStep();
		let map = initial.map;
		const { stepId } = initial;
		const sliceResult = addSlice(map, 'Release 1');
		map = sliceResult.map;
		const sliceId = sliceResult.slice.id;

		const s1 = addStory(map, stepId, 'S1', { sliceId });
		map = s1.map;
		const s2 = addStory(map, stepId, 'S2', { sliceId });
		map = s2.map;

		const map2 = deleteSlice(map, sliceId);

		expect(map2.slices.find((s) => s.id === sliceId)).toBeUndefined();
		const story1 = findStory(map2, s1.story.id);
		const story2 = findStory(map2, s2.story.id);
		expect(story1.sliceId).toBeNull();
		expect(story2.sliceId).toBeNull();
		// still exist and keep their (stepId, null) ranks unique / ordered
		expect(story1.rank < story2.rank).toBe(true);
	});

	it('deleting a slice re-ranks un-sliced stories to not collide with the existing unsliced band', () => {
		const initial = mapWithOneStep();
		let map = initial.map;
		const { stepId } = initial;
		map = addStory(map, stepId, 'Already unsliced').map;

		const sliceResult = addSlice(map, 'Release 1');
		map = sliceResult.map;
		const sliced = addStory(map, stepId, 'Was sliced', { sliceId: sliceResult.slice.id });
		map = sliced.map;

		const map2 = deleteSlice(map, sliceResult.slice.id);
		const unslicedRanks = map2.stories
			.filter((s) => s.stepId === stepId && s.sliceId === null)
			.map((s) => s.rank);
		expect(new Set(unslicedRanks).size).toBe(unslicedRanks.length);
	});

	it('deleting a story removes only that story', () => {
		const { map, stepId } = mapWithOneStep();
		const s1 = addStory(map, stepId, 'Keep');
		const combined = addStory(s1.map, stepId, 'Remove');
		const map2 = deleteStory(combined.map, combined.story.id);
		expect(map2.stories.map((s) => s.title)).toEqual(['Keep']);
	});

	it('rejects deleting an unknown activity/step/slice/story', () => {
		const map = createStoryMap('m');
		expect(() => deleteActivity(map, 'nope' as never)).toThrow(/Activity not found/);
		expect(() => deleteStep(map, 'nope' as never)).toThrow(/Step not found/);
		expect(() => deleteSlice(map, 'nope' as never)).toThrow(/Slice not found/);
		expect(() => deleteStory(map, 'nope' as never)).toThrow(/Story not found/);
	});
});

describe('moveStory', () => {
	it('moves a story between steps in the same activity', () => {
		const initial = mapWithOneStep();
		let map = initial.map;
		const { activityId, stepId } = initial;
		const step2 = addStep(map, activityId, 'Step 2');
		map = step2.map;
		const storyResult = addStory(map, stepId, 'Movable');
		map = storyResult.map;

		map = moveStory(map, storyResult.story.id, step2.step.id, null, null, null);

		const moved = findStory(map, storyResult.story.id);
		expect(moved.stepId).toBe(step2.step.id);
	});

	// A drop's neighbours describe a gap. If they do not actually bracket a gap,
	// the client's view of the scope is stale — someone else has inserted since
	// it loaded — and `generateKeyBetween` will hand back a rank a sibling
	// already holds, because appended ranks are consecutive by construction.
	it('rejects a drop whose neighbours are stale rather than deriving a duplicate rank', () => {
		const initial = mapWithOneStep();
		let map = initial.map;
		const { stepId } = initial;
		const a = addStory(map, stepId, 'A');
		map = a.map;
		const b = addStory(map, stepId, 'B');
		map = b.map;
		const step2 = addStep(map, initial.activityId, 'Step 2');
		map = step2.map;
		const x = addStory(map, step2.step.id, 'X');
		map = x.map;

		// The client saw only A, so it asks to drop after A with nothing beyond.
		// B is beyond, and B's rank is exactly what "after A, before nothing"
		// derives.
		expect(() => moveStory(map, x.story.id, stepId, null, a.story.id, null)).toThrow(ConflictError);
	});

	it('rejects a drop between two non-adjacent neighbours', () => {
		const initial = mapWithOneStep();
		let map = initial.map;
		const { stepId } = initial;
		const a = addStory(map, stepId, 'A');
		map = a.map;
		const b = addStory(map, stepId, 'B');
		map = b.map;
		const c = addStory(map, stepId, 'C');
		map = c.map;
		const step2 = addStep(map, initial.activityId, 'Step 2');
		map = step2.map;
		const x = addStory(map, step2.step.id, 'X');
		map = x.map;

		// B sits between A and C, so this gap does not exist.
		expect(() => moveStory(map, x.story.id, stepId, null, a.story.id, c.story.id)).toThrow(
			ConflictError
		);
		// The story that was actually there is untouched.
		expect(findStory(map, b.story.id).rank).toBe(b.story.rank);
	});

	it('reorders a story within the same (step, slice) scope, matching the a0/a1/a2 worked example', () => {
		const initial = mapWithOneStep();
		let map = initial.map;
		const { stepId } = initial;
		const s1 = addStory(map, stepId, 'Search by keyword');
		map = s1.map;
		const s2 = addStory(map, stepId, 'Filter by category');
		map = s2.map;
		const s3 = addStory(map, stepId, 'Sort by price');
		map = s3.map;

		map = moveStory(map, s3.story.id, stepId, null, s1.story.id, s2.story.id);

		const unsliced = sortByRank(
			map.stories.filter((s) => s.stepId === stepId && s.sliceId === null)
		);
		expect(unsliced.map((s) => s.title)).toEqual([
			'Search by keyword',
			'Sort by price',
			'Filter by category'
		]);
	});

	it('moving a story across a slice line reassigns sliceId and re-ranks it into the target scope', () => {
		const initial = mapWithOneStep();
		let map = initial.map;
		const { stepId } = initial;
		const sliceResult = addSlice(map, 'Release 1');
		map = sliceResult.map;
		const sliceId = sliceResult.slice.id;

		const dragged = addStory(map, stepId, 'Sort by price');
		map = dragged.map;
		const addToCart = addStory(map, stepId, 'Add to cart', { sliceId });
		map = addToCart.map;
		const checkout = addStory(map, stepId, 'Checkout', { sliceId });
		map = checkout.map;

		map = moveStory(map, dragged.story.id, stepId, sliceId, addToCart.story.id, checkout.story.id);

		const moved = findStory(map, dragged.story.id);
		expect(moved.sliceId).toBe(sliceId);

		const releaseBand = sortByRank(map.stories.filter((s) => s.sliceId === sliceId));
		expect(releaseBand.map((s) => s.title)).toEqual(['Add to cart', 'Sort by price', 'Checkout']);

		const unslicedBand = map.stories.filter((s) => s.sliceId === null);
		expect(unslicedBand).toHaveLength(0);
	});

	it('rejects moving a story to an unknown step', () => {
		const { map, stepId } = mapWithOneStep();
		const story = addStory(map, stepId, 'A story');
		expect(() => moveStory(story.map, story.story.id, 'nope' as never, null, null, null)).toThrow(
			/Step not found/
		);
	});

	it('rejects moving a story to a slice belonging to a different map', () => {
		const { map, stepId } = mapWithOneStep();
		const story = addStory(map, stepId, 'A story');
		const otherSlice = addSlice(createStoryMap('other'), 'Foreign slice');
		expect(() =>
			moveStory(story.map, story.story.id, stepId, otherSlice.slice.id, null, null)
		).toThrow(/does not belong to map/);
	});

	it('rejects a beforeId/afterId that is not a member of the target scope', () => {
		const { map, stepId } = mapWithOneStep();
		const story = addStory(map, stepId, 'A story');
		expect(() =>
			moveStory(story.map, story.story.id, stepId, null, 'not-a-real-id' as never, null)
		).toThrow(/is not a member of the target scope/);
	});
});

describe('name validation', () => {
	// The only rule about names lived in the app layer, and again in the route,
	// while the domain accepted anything — so the seed builder and any future
	// caller that reaches the domain directly (applying an AiAssistant
	// suggestion, say) could persist a blank. CLAUDE.md and use-cases.ts both
	// said invariants live here; now they do.
	it('rejects empty and whitespace-only names on every creating function', () => {
		const initial = mapWithOneStep();
		const { map, activityId, stepId } = initial;

		expect(() => createStoryMap('   ')).toThrow(InvariantError);
		expect(() => addActivity(map, '')).toThrow(InvariantError);
		expect(() => addStep(map, activityId, '  ')).toThrow(InvariantError);
		expect(() => addSlice(map, '\t')).toThrow(InvariantError);
		expect(() => addStory(map, stepId, '')).toThrow(InvariantError);
	});

	it('rejects blanking a name through rename or edit', () => {
		const initial = mapWithOneStep();
		let map = initial.map;
		const slice = addSlice(map, 'Release 1');
		map = slice.map;
		const story = addStory(map, initial.stepId, 'Keyword search');
		map = story.map;

		expect(() => renameActivity(map, initial.activityId, ' ')).toThrow(InvariantError);
		expect(() => renameStep(map, initial.stepId, '')).toThrow(InvariantError);
		expect(() => renameSlice(map, slice.slice.id, '')).toThrow(InvariantError);
		// `''` is not nullish, so `changes.title ?? s.title` let it through.
		expect(() => editStory(map, story.story.id, { title: '' })).toThrow(InvariantError);
	});

	it('stores names trimmed, so padding cannot make two names look different', () => {
		const initial = mapWithOneStep();
		const added = addActivity(initial.map, '  Browse  ');

		expect(added.activity.name).toBe('Browse');
	});

	// A description is genuinely optional, unlike every name above.
	it('leaves an empty description alone', () => {
		const initial = mapWithOneStep();
		let map = initial.map;
		const story = addStory(map, initial.stepId, 'Keyword search', { description: 'text' });
		map = story.map;

		map = editStory(map, story.story.id, { description: '' });

		expect(findStory(map, story.story.id).description).toBe('');
	});
});

describe('moveActivity / moveStep / moveSlice', () => {
	function mapWithBackbone() {
		let map = createStoryMap('Test map');
		const a1 = addActivity(map, 'Browse');
		map = a1.map;
		const a2 = addActivity(map, 'Checkout');
		map = a2.map;
		const a3 = addActivity(map, 'Support');
		map = a3.map;
		return { map, a1: a1.activity, a2: a2.activity, a3: a3.activity };
	}

	it('reorders an activity within the map', () => {
		const { map, a1, a2, a3 } = mapWithBackbone();

		// Move Support between Browse and Checkout.
		const moved = moveActivity(map, a3.id, a1.id, a2.id);

		expect(sortByRank(moved.activities).map((a) => a.name)).toEqual([
			'Browse',
			'Support',
			'Checkout'
		]);
	});

	it('rejects an activity drop whose neighbours are stale', () => {
		const { map, a1, a3 } = mapWithBackbone();

		// Checkout sits after Browse, so "after Browse, before nothing" is not
		// a real gap — the same staleness moveStory rejects.
		expect(() => moveActivity(map, a3.id, a1.id, null)).toThrow(ConflictError);
	});

	it('reorders a step within its activity', () => {
		const backbone = mapWithBackbone();
		let map = backbone.map;
		const s1 = addStep(map, backbone.a1.id, 'Search');
		map = s1.map;
		const s2 = addStep(map, backbone.a1.id, 'Filter');
		map = s2.map;
		const s3 = addStep(map, backbone.a1.id, 'Compare');
		map = s3.map;

		map = moveStep(map, s3.step.id, backbone.a1.id, s1.step.id, s2.step.id);

		const steps = sortByRank(findActivity(map, backbone.a1.id).steps);
		expect(steps.map((s) => s.name)).toEqual(['Search', 'Compare', 'Filter']);
	});

	// domain-model.md documents this move and nothing implemented it. The
	// stories hanging off the step have to come with it: they reference it by
	// `stepId`, so they move by staying put, and that is worth pinning.
	it('moves a step to a different activity, carrying its stories', () => {
		const backbone = mapWithBackbone();
		let map = backbone.map;
		const step = addStep(map, backbone.a1.id, 'Search');
		map = step.map;
		const story = addStory(map, step.step.id, 'Keyword search');
		map = story.map;

		map = moveStep(map, step.step.id, backbone.a2.id, null, null);

		expect(findActivity(map, backbone.a1.id).steps).toHaveLength(0);
		const moved = findActivity(map, backbone.a2.id).steps;
		expect(moved.map((s) => s.name)).toEqual(['Search']);
		expect(moved[0].activityId).toBe(backbone.a2.id);
		expect(findStory(map, story.story.id).stepId).toBe(step.step.id);
	});

	it('reorders a slice within the map', () => {
		const backbone = mapWithBackbone();
		let map = backbone.map;
		const r1 = addSlice(map, 'Release 1');
		map = r1.map;
		const r2 = addSlice(map, 'Release 2');
		map = r2.map;
		const r3 = addSlice(map, 'Release 3');
		map = r3.map;

		map = moveSlice(map, r3.slice.id, r1.slice.id, r2.slice.id);

		expect(sortByRank(map.slices).map((s) => s.name)).toEqual([
			'Release 1',
			'Release 3',
			'Release 2'
		]);
	});
});

describe('invariant enforcement smoke test', () => {
	it('every story rank is unique within its (stepId, sliceId) scope after a sequence of operations', () => {
		let map = createStoryMap('m');
		const a = addActivity(map, 'A');
		map = a.map;
		const s = addStep(map, a.activity.id, 'S');
		map = s.map;
		const slice = addSlice(map, 'Release');
		map = slice.map;

		for (let i = 0; i < 5; i++) {
			map = addStory(map, s.step.id, `Story ${i}`).map;
		}
		for (let i = 0; i < 3; i++) {
			map = addStory(map, s.step.id, `Sliced ${i}`, { sliceId: slice.slice.id }).map;
		}

		// Appending always mints a fresh key, so a test that only adds proves
		// nothing about uniqueness — it passed while `moveStory` was deriving
		// duplicate ranks (finding D1). These are the operations that can
		// actually collide: reordering within a scope, and moving between
		// scopes, each with a one-sided neighbour.
		const unsliced = () =>
			sortByRank(map.stories.filter((x) => x.stepId === s.step.id && x.sliceId === null));
		const sliced = () =>
			sortByRank(map.stories.filter((x) => x.stepId === s.step.id && x.sliceId === slice.slice.id));

		// To the head of its own scope, then the tail, then into the slice.
		map = moveStory(map, unsliced()[4].id, s.step.id, null, null, unsliced()[0].id);
		map = moveStory(map, unsliced()[0].id, s.step.id, null, unsliced().at(-1)!.id, null);
		map = moveStory(map, unsliced()[0].id, s.step.id, slice.slice.id, null, sliced()[0].id);
		// And back out of it, into the middle of the unsliced band.
		map = moveStory(map, sliced().at(-1)!.id, s.step.id, null, unsliced()[1].id, unsliced()[2].id);

		const byScope = new Map<string, Set<string>>();
		for (const story of map.stories) {
			const key = `${story.stepId}:${story.sliceId}`;
			const seen = byScope.get(key) ?? new Set<string>();
			expect(seen.has(story.rank)).toBe(false);
			seen.add(story.rank);
			byScope.set(key, seen);
		}
	});
});

describe('inRankOrder', () => {
	// The read-path guarantee `ORDER BY rank` used to make. Under SQLite this was
	// free; a document store hands arrays back as written, and a move changes a
	// rank rather than a position — so without this the board renders in creation
	// order and every drag appears to do nothing.
	//
	// Tested per collection deliberately: the repository contract had one case
	// asserting activity order, and deleting the sort for steps or stories left it
	// green. Stories are the case that actually breaks the board.
	function outOfOrderMap(): StoryMap {
		const created = createStoryMap('Retail');
		const browse = addActivity(created, 'Browse');
		const buy = addActivity(browse.map, 'Buy');
		// Move 'Buy' in front of 'Browse': its rank now sorts first while it stays
		// second in the array, which is exactly the state a drag leaves behind.
		const reordered = moveActivity(buy.map, buy.activity.id, null, browse.activity.id);

		const search = addStep(reordered, browse.activity.id, 'Search');
		const filter = addStep(search.map, browse.activity.id, 'Filter');
		const steps = moveStep(filter.map, filter.step.id, browse.activity.id, null, search.step.id);

		const r1 = addSlice(steps, 'Release 1');
		const r2 = addSlice(r1.map, 'Release 2');
		const slices = moveSlice(r2.map, r2.slice.id, null, r1.slice.id);

		const first = addStory(slices, search.step.id, 'Sort by price');
		const second = addStory(first.map, search.step.id, 'Filter by size');
		return moveStory(second.map, second.story.id, search.step.id, null, null, first.story.id);
	}

	const names = (map: StoryMap) => ({
		activities: map.activities.map((a) => a.name),
		steps: map.activities.flatMap((a) => a.steps.map((s) => s.name)),
		slices: map.slices.map((s) => s.name),
		stories: map.stories.map((s) => s.title)
	});

	it('sorts every collection by rank, not by the order things were created', () => {
		const map = outOfOrderMap();
		// Precondition: the fixture really is out of order, or the assertions below
		// would pass against a function that does nothing.
		expect(names(map)).toEqual({
			activities: ['Browse', 'Buy'],
			steps: ['Search', 'Filter'],
			slices: ['Release 1', 'Release 2'],
			stories: ['Sort by price', 'Filter by size']
		});

		expect(names(inRankOrder(map))).toEqual({
			activities: ['Buy', 'Browse'],
			steps: ['Filter', 'Search'],
			slices: ['Release 2', 'Release 1'],
			stories: ['Filter by size', 'Sort by price']
		});
	});

	it('does not mutate the map it is given', () => {
		// Every other function in this module returns a new map and leaves its
		// input alone; a sort that reached back into the caller's arrays would be
		// the one exception, and an easy one to write by accident.
		const map = outOfOrderMap();
		const before = names(map);

		inRankOrder(map);

		expect(names(map)).toEqual(before);
	});
});

describe('dependencies', () => {
	/** A step carrying `count` stories, named A, B, C… so edges read as prose. */
	function mapWithStories(count: number) {
		const base = mapWithOneStep();
		let map = base.map;
		const ids: StoryId[] = [];
		for (let i = 0; i < count; i++) {
			const added = addStory(map, base.stepId, String.fromCharCode(65 + i));
			map = added.map;
			ids.push(added.story.id);
		}
		return { map, ids, stepId: base.stepId, activityId: base.activityId };
	}

	describe('addDependency', () => {
		it('records the edge in the direction it was given', () => {
			const { map, ids } = mapWithStories(2);

			const updated = addDependency(map, ids[0], ids[1]);

			expect(updated.dependencies).toEqual([{ blockerId: ids[0], blockedId: ids[1] }]);
		});

		it('does not mutate the map it is given', () => {
			const { map, ids } = mapWithStories(2);

			addDependency(map, ids[0], ids[1]);

			expect(map.dependencies).toEqual([]);
		});

		it('lets one story block several, and several block one', () => {
			const { map, ids } = mapWithStories(3);

			const fanOut = addDependency(addDependency(map, ids[0], ids[1]), ids[0], ids[2]);
			const fanIn = addDependency(addDependency(map, ids[0], ids[2]), ids[1], ids[2]);

			expect(fanOut.dependencies).toHaveLength(2);
			expect(fanIn.dependencies).toHaveLength(2);
		});

		// A -> B -> D and A -> C -> D. Nothing here is a cycle: D is reachable
		// from A twice over, which is a diamond, not a loop.
		it('accepts a diamond', () => {
			const { map, ids } = mapWithStories(4);
			const [a, b, c, d] = ids;

			let updated = addDependency(map, a, b);
			updated = addDependency(updated, a, c);
			updated = addDependency(updated, b, d);
			updated = addDependency(updated, c, d);

			expect(updated.dependencies).toHaveLength(4);
		});

		// A -> B -> C already exists and A -> C adds nothing, but redundant is not
		// the same as illegal. This is the case a *reversed* reachability walk
		// rejects — it would ask "does A already reach C?" and find that it does.
		it('accepts a transitive shortcut over an existing path', () => {
			const { map, ids } = mapWithStories(3);
			const [a, b, c] = ids;

			const updated = addDependency(addDependency(addDependency(map, a, b), b, c), a, c);

			expect(updated.dependencies).toHaveLength(3);
		});

		it('rejects an unknown blocker, and an unknown blocked story', () => {
			const { map, ids } = mapWithStories(1);

			expect(() => addDependency(map, 'nope' as never, ids[0])).toThrow(InvariantError);
			expect(() => addDependency(map, ids[0], 'nope' as never)).toThrow(/Story not found/);
		});

		it('rejects a story blocking itself', () => {
			const { map, ids } = mapWithStories(1);

			expect(() => addDependency(map, ids[0], ids[0])).toThrow(/cannot block itself/);
		});

		it('rejects the same edge twice', () => {
			const { map, ids } = mapWithStories(2);
			const once = addDependency(map, ids[0], ids[1]);

			expect(() => addDependency(once, ids[0], ids[1])).toThrow(/already blocks/);
		});

		// The reverse of an existing edge is not a duplicate — it is the shortest
		// possible loop, and it must be refused as one. Reported as a cycle rather
		// than as a duplicate, because "A already blocks B" would be a confusing
		// answer to someone asking for B to block A.
		it('rejects the reverse of an existing edge as a cycle', () => {
			const { map, ids } = mapWithStories(2);
			const forward = addDependency(map, ids[0], ids[1]);

			expect(() => addDependency(forward, ids[1], ids[0])).toThrow(/cycle/);
			expect(() => addDependency(forward, ids[1], ids[0])).not.toThrow(/already blocks/);
		});

		// Asserted as an exact string, not a loose regex: the chain is easy to get
		// subtly wrong — an off-by-one here repeats the last story and omits the
		// edge being refused — and a regex listing the three titles in order
		// passes on exactly that mistake.
		it('rejects a longer cycle and names the loop it would close', () => {
			const { map, ids } = mapWithStories(3);
			const [a, b, c] = ids;
			const chain = addDependency(addDependency(map, a, b), b, c);

			expect(() => addDependency(chain, c, a)).toThrow(
				'"C" cannot block "A": that would create a cycle ("C" blocks "A" blocks "B" blocks "C")'
			);
		});

		it('names the two-story loop the same way', () => {
			const { map, ids } = mapWithStories(2);
			const forward = addDependency(map, ids[0], ids[1]);

			expect(() => addDependency(forward, ids[1], ids[0])).toThrow(
				'"B" cannot block "A": that would create a cycle ("B" blocks "A" blocks "B")'
			);
		});

		it('links stories in different steps and different slices', () => {
			const base = mapWithOneStep();
			let map = base.map;
			const otherStep = addStep(map, base.activityId, 'Step 2');
			map = otherStep.map;
			const slice = addSlice(map, 'Release 1');
			map = slice.map;
			const here = addStory(map, base.stepId, 'Here');
			map = here.map;
			const there = addStory(map, otherStep.step.id, 'There', { sliceId: slice.slice.id });
			map = there.map;

			const updated = addDependency(map, here.story.id, there.story.id);

			expect(updated.dependencies).toHaveLength(1);
		});
	});

	describe('removeDependency', () => {
		it('removes exactly the edge named', () => {
			const { map, ids } = mapWithStories(3);
			const both = addDependency(addDependency(map, ids[0], ids[1]), ids[0], ids[2]);

			const updated = removeDependency(both, ids[0], ids[1]);

			expect(updated.dependencies).toEqual([{ blockerId: ids[0], blockedId: ids[2] }]);
		});

		it('does not remove the edge with the same pair the other way round', () => {
			const { map, ids } = mapWithStories(2);
			const forward = addDependency(map, ids[0], ids[1]);

			expect(() => removeDependency(forward, ids[1], ids[0])).toThrow(/No dependency/);
			expect(forward.dependencies).toHaveLength(1);
		});

		it('rejects removing an edge that is not there', () => {
			const { map, ids } = mapWithStories(2);

			expect(() => removeDependency(map, ids[0], ids[1])).toThrow(InvariantError);
		});
	});

	describe('cascades', () => {
		it('drops edges in both directions when a story is deleted', () => {
			const { map, ids } = mapWithStories(3);
			const [a, b, c] = ids;
			// b is both blocked by a and blocking c, so deleting it must take an
			// incoming and an outgoing edge with it — and leave a -> c alone.
			let linked = addDependency(map, a, b);
			linked = addDependency(linked, b, c);
			linked = addDependency(linked, a, c);

			const updated = deleteStory(linked, b);

			expect(updated.dependencies).toEqual([{ blockerId: a, blockedId: c }]);
		});

		it('drops edges for every story in a deleted step', () => {
			const base = mapWithOneStep();
			let map = base.map;
			const other = addStep(map, base.activityId, 'Step 2');
			map = other.map;
			const doomed = addStory(map, base.stepId, 'Doomed');
			map = doomed.map;
			const survivor = addStory(map, other.step.id, 'Survivor');
			map = survivor.map;
			map = addDependency(map, doomed.story.id, survivor.story.id);

			const updated = deleteStep(map, base.stepId);

			expect(updated.dependencies).toEqual([]);
		});

		it('drops edges for every story under a deleted activity', () => {
			const base = mapWithOneStep();
			let map = base.map;
			const otherActivity = addActivity(map, 'Activity 2');
			map = otherActivity.map;
			const otherStep = addStep(map, otherActivity.activity.id, 'Step 2');
			map = otherStep.map;
			const doomed = addStory(map, base.stepId, 'Doomed');
			map = doomed.map;
			const survivor = addStory(map, otherStep.step.id, 'Survivor');
			map = survivor.map;
			map = addDependency(map, survivor.story.id, doomed.story.id);

			const updated = deleteActivity(map, base.activityId);

			expect(updated.dependencies).toEqual([]);
		});

		// The two cases the word "delete" makes people expect a cascade for, and
		// neither has one: `deleteSlice` un-slices its stories rather than
		// deleting them, and a move changes a story's step or slice, never its
		// identity. An edge names two story ids and nothing else.
		it('keeps every edge when a slice is deleted', () => {
			const base = mapWithOneStep();
			let map = base.map;
			const slice = addSlice(map, 'Release 1');
			map = slice.map;
			const a = addStory(map, base.stepId, 'A', { sliceId: slice.slice.id });
			map = a.map;
			const b = addStory(map, base.stepId, 'B', { sliceId: slice.slice.id });
			map = b.map;
			map = addDependency(map, a.story.id, b.story.id);

			const updated = deleteSlice(map, slice.slice.id);

			expect(updated.dependencies).toHaveLength(1);
			expect(updated.stories).toHaveLength(2);
		});

		it('keeps every edge when a story moves', () => {
			const { map, ids, stepId } = mapWithStories(2);
			const linked = addDependency(map, ids[0], ids[1]);

			const updated = moveStory(linked, ids[1], stepId, null, ids[0], null);

			expect(updated.dependencies).toHaveLength(1);
		});
	});
});

describe('acceptance criteria', () => {
	/** A map with one story, ready for criteria to be hung off it. */
	function mapWithOneStory(title = 'Search by keyword') {
		const base = mapWithOneStep();
		const story = addStory(base.map, base.stepId, title);
		return {
			map: story.map,
			storyId: story.story.id,
			stepId: base.stepId,
			activityId: base.activityId
		};
	}

	function criteriaOf(map: StoryMap, storyId: StoryId) {
		return findStory(map, storyId).criteria;
	}

	describe('addAcceptanceCriterion', () => {
		it('appends a criterion to the end of its story, unsatisfied', () => {
			const { map, storyId } = mapWithOneStory();

			const first = addAcceptanceCriterion(map, storyId, 'Results appear within 2 seconds');
			const second = addAcceptanceCriterion(first.map, storyId, 'An empty search is rejected');

			expect(criteriaOf(second.map, storyId).map((c) => c.text)).toEqual([
				'Results appear within 2 seconds',
				'An empty search is rejected'
			]);
			expect(criteriaOf(second.map, storyId).every((c) => !c.satisfied)).toBe(true);
		});

		it('appends in rank order, not merely in array order', () => {
			const { map, storyId } = mapWithOneStory();
			const first = addAcceptanceCriterion(map, storyId, 'One');
			const second = addAcceptanceCriterion(first.map, storyId, 'Two');

			const ranks = criteriaOf(second.map, storyId).map((c) => c.rank);

			expect(ranks[0] < ranks[1]).toBe(true);
		});

		it('trims the text it stores', () => {
			const { map, storyId } = mapWithOneStory();

			const added = addAcceptanceCriterion(map, storyId, '  Results are paginated  ');

			expect(added.criterion.text).toBe('Results are paginated');
		});

		it('refuses a criterion that is only whitespace', () => {
			const { map, storyId } = mapWithOneStory();

			expect(() => addAcceptanceCriterion(map, storyId, '   ')).toThrow(InvariantError);
		});

		it('refuses a story that is not in this map', () => {
			const { map } = mapWithOneStory();

			expect(() => addAcceptanceCriterion(map, 'nope' as StoryId, 'Anything')).toThrow(
				InvariantError
			);
		});

		it('does not mutate the map it is given', () => {
			const { map, storyId } = mapWithOneStory();

			addAcceptanceCriterion(map, storyId, 'Results appear within 2 seconds');

			expect(criteriaOf(map, storyId)).toEqual([]);
		});
	});

	describe('editAcceptanceCriterion', () => {
		it('edits the text without touching satisfied', () => {
			const { map, storyId } = mapWithOneStory();
			const added = addAcceptanceCriterion(map, storyId, 'Old wording');
			const satisfied = editAcceptanceCriterion(added.map, storyId, added.criterion.id, {
				satisfied: true
			});

			const updated = editAcceptanceCriterion(satisfied, storyId, added.criterion.id, {
				text: 'New wording'
			});

			expect(criteriaOf(updated, storyId)[0].text).toBe('New wording');
			expect(criteriaOf(updated, storyId)[0].satisfied).toBe(true);
		});

		it('marks a criterion satisfied without touching its text', () => {
			const { map, storyId } = mapWithOneStory();
			const added = addAcceptanceCriterion(map, storyId, 'Results are paginated');

			const updated = editAcceptanceCriterion(added.map, storyId, added.criterion.id, {
				satisfied: true
			});

			expect(criteriaOf(updated, storyId)[0]).toMatchObject({
				text: 'Results are paginated',
				satisfied: true
			});
		});

		// The one case an `??`-shaped assignment survives every other test here:
		// `changes.satisfied ?? c.satisfied` reads `false` as "not given" only if
		// the field is ever widened past boolean, and this is what would catch it.
		it('marks a satisfied criterion unsatisfied again', () => {
			const { map, storyId } = mapWithOneStory();
			const added = addAcceptanceCriterion(map, storyId, 'Results are paginated');
			const satisfied = editAcceptanceCriterion(added.map, storyId, added.criterion.id, {
				satisfied: true
			});

			const updated = editAcceptanceCriterion(satisfied, storyId, added.criterion.id, {
				satisfied: false
			});

			expect(criteriaOf(updated, storyId)[0].satisfied).toBe(false);
		});

		it('refuses blank replacement text', () => {
			const { map, storyId } = mapWithOneStory();
			const added = addAcceptanceCriterion(map, storyId, 'Results are paginated');

			expect(() =>
				editAcceptanceCriterion(added.map, storyId, added.criterion.id, { text: '  ' })
			).toThrow(InvariantError);
		});

		// The ticket's invariant: a criterion belongs to one story, so an id from
		// another one is rejected rather than found by a map-wide scan.
		it('refuses a criterion id that belongs to a different story', () => {
			const { map, storyId, stepId } = mapWithOneStory();
			const other = addStory(map, stepId, 'Sort by price');
			const added = addAcceptanceCriterion(other.map, other.story.id, 'Sorted descending');

			expect(() =>
				editAcceptanceCriterion(added.map, storyId, added.criterion.id, { satisfied: true })
			).toThrow(InvariantError);
		});
	});

	describe('removeAcceptanceCriterion', () => {
		it('removes one and leaves its siblings alone', () => {
			const { map, storyId } = mapWithOneStory();
			const first = addAcceptanceCriterion(map, storyId, 'One');
			const second = addAcceptanceCriterion(first.map, storyId, 'Two');
			const beforeRanks = criteriaOf(second.map, storyId).map((c) => c.rank);

			const updated = removeAcceptanceCriterion(second.map, storyId, first.criterion.id);

			expect(criteriaOf(updated, storyId).map((c) => c.text)).toEqual(['Two']);
			expect(criteriaOf(updated, storyId)[0].rank).toBe(beforeRanks[1]);
		});

		it('refuses a criterion that is not there', () => {
			const { map, storyId } = mapWithOneStory();
			const added = addAcceptanceCriterion(map, storyId, 'One');
			const removed = removeAcceptanceCriterion(added.map, storyId, added.criterion.id);

			expect(() => removeAcceptanceCriterion(removed, storyId, added.criterion.id)).toThrow(
				InvariantError
			);
		});
	});

	describe('moveAcceptanceCriterion', () => {
		it('reorders a criterion within its story', () => {
			const { map, storyId } = mapWithOneStory();
			const first = addAcceptanceCriterion(map, storyId, 'One');
			const second = addAcceptanceCriterion(first.map, storyId, 'Two');
			const third = addAcceptanceCriterion(second.map, storyId, 'Three');

			const moved = moveAcceptanceCriterion(
				third.map,
				storyId,
				third.criterion.id,
				null,
				first.criterion.id
			);

			expect(sortByRank(criteriaOf(moved, storyId)).map((c) => c.text)).toEqual([
				'Three',
				'One',
				'Two'
			]);
		});

		it('refuses a neighbour that belongs to another story', () => {
			const { map, storyId, stepId } = mapWithOneStory();
			const mine = addAcceptanceCriterion(map, storyId, 'Mine');
			const other = addStory(mine.map, stepId, 'Sort by price');
			const theirs = addAcceptanceCriterion(other.map, other.story.id, 'Theirs');

			expect(() =>
				moveAcceptanceCriterion(theirs.map, storyId, mine.criterion.id, theirs.criterion.id, null)
			).toThrow(InvariantError);
		});
	});

	describe('cascades', () => {
		it('deletes a story’s criteria with the story', () => {
			const { map, storyId } = mapWithOneStory();
			const added = addAcceptanceCriterion(map, storyId, 'One');

			const updated = deleteStory(added.map, storyId);

			expect(updated.stories).toEqual([]);
		});

		it('deletes them with the step, and with the activity', () => {
			const { map, storyId, stepId, activityId } = mapWithOneStory();
			const added = addAcceptanceCriterion(map, storyId, 'One');

			expect(deleteStep(added.map, stepId).stories).toEqual([]);
			expect(deleteActivity(added.map, activityId).stories).toEqual([]);
		});

		// The mirror of `keeps every edge when a slice is deleted`: a slice delete
		// un-slices its stories rather than removing them, so their criteria must
		// still be there afterwards.
		it('keeps them when a slice is deleted', () => {
			const base = mapWithOneStep();
			const slice = addSlice(base.map, 'Release 1');
			const story = addStory(slice.map, base.stepId, 'Sliced', { sliceId: slice.slice.id });
			const added = addAcceptanceCriterion(story.map, story.story.id, 'One');

			const updated = deleteSlice(added.map, slice.slice.id);

			expect(criteriaOf(updated, story.story.id).map((c) => c.text)).toEqual(['One']);
		});

		it('keeps them when a story moves', () => {
			const { map, storyId, stepId } = mapWithOneStory();
			const added = addAcceptanceCriterion(map, storyId, 'One');

			const updated = moveStory(added.map, storyId, stepId, null, null, null);

			expect(criteriaOf(updated, storyId).map((c) => c.text)).toEqual(['One']);
		});
	});

	describe('the done gate', () => {
		// Three, with one met, so the unmet count (2) and the met count (1) differ:
		// the message names how many are *outstanding*, which is the opposite of
		// the dialog's "N of M met" tally. Two-of-which-one-is-met reads the same
		// either way round and would pin nothing.
		it('refuses done while a criterion is unmet, naming how many are outstanding', () => {
			const { map, storyId } = mapWithOneStory();
			const first = addAcceptanceCriterion(map, storyId, 'One');
			const second = addAcceptanceCriterion(first.map, storyId, 'Two');
			const third = addAcceptanceCriterion(second.map, storyId, 'Three');
			const partly = editAcceptanceCriterion(third.map, storyId, first.criterion.id, {
				satisfied: true
			});

			expect(() => editStory(partly, storyId, { status: 'done' })).toThrow(
				/2 of 3 acceptance criteria are unmet/
			);
		});

		it('allows done once every criterion is satisfied', () => {
			const { map, storyId } = mapWithOneStory();
			const added = addAcceptanceCriterion(map, storyId, 'One');
			const satisfied = editAcceptanceCriterion(added.map, storyId, added.criterion.id, {
				satisfied: true
			});

			const updated = editStory(satisfied, storyId, { status: 'done' });

			expect(findStory(updated, storyId).status).toBe('done');
		});

		it('leaves a story with no criteria freely settable', () => {
			const { map, storyId } = mapWithOneStory();

			const updated = editStory(map, storyId, { status: 'done' });

			expect(findStory(updated, storyId).status).toBe('done');
		});

		it('does not gate the other four statuses', () => {
			const { map, storyId } = mapWithOneStory();
			const added = addAcceptanceCriterion(map, storyId, 'One');

			for (const status of STORY_STATUSES.filter((s) => s !== 'done')) {
				expect(findStory(editStory(added.map, storyId, { status }), storyId).status).toBe(status);
			}
		});

		it('drops a done story to in review when a criterion is unticked', () => {
			const { map, storyId } = mapWithOneStory();
			const added = addAcceptanceCriterion(map, storyId, 'One');
			const satisfied = editAcceptanceCriterion(added.map, storyId, added.criterion.id, {
				satisfied: true
			});
			const done = editStory(satisfied, storyId, { status: 'done' });

			const updated = editAcceptanceCriterion(done, storyId, added.criterion.id, {
				satisfied: false
			});

			expect(findStory(updated, storyId).status).toBe('in-review');
		});

		it('drops a done story to in review when a criterion is added', () => {
			const { map, storyId } = mapWithOneStory();
			const done = editStory(map, storyId, { status: 'done' });

			const updated = addAcceptanceCriterion(done, storyId, 'Something nobody checked');

			expect(findStory(updated.map, storyId).status).toBe('in-review');
		});

		// Exactly two triggers, per ADR 0024: a tick undone, or a criterion added.
		// Rewording one cannot grow the unmet set, so it must not move the status —
		// and `done` beside an unmet criterion is a state the read path accepts, so
		// this is reachable rather than hypothetical.
		it('leaves a done story alone when a criterion is only reworded', () => {
			const { map, storyId } = mapWithOneStory();
			const first = addAcceptanceCriterion(map, storyId, 'One');
			const second = addAcceptanceCriterion(first.map, storyId, 'Two');
			// Written directly, the way a stored document holds it: `editStory`
			// would refuse this combination, which is the point.
			const done: StoryMap = {
				...second.map,
				stories: second.map.stories.map((s) =>
					s.id === storyId ? { ...s, status: 'done' as const } : s
				)
			};

			const updated = editAcceptanceCriterion(done, storyId, first.criterion.id, {
				text: 'One, reworded'
			});

			expect(findStory(updated, storyId).status).toBe('done');
			expect(criteriaOf(updated, storyId)[0].text).toBe('One, reworded');
		});

		// No auto-promotion: satisfying the last criterion is not the same act as
		// declaring the story finished, and only a person does the second one.
		it('does not promote a story to done when its last criterion is satisfied', () => {
			const { map, storyId } = mapWithOneStory();
			const added = addAcceptanceCriterion(map, storyId, 'One');
			const started = editStory(added.map, storyId, { status: 'in-progress' });

			const updated = editAcceptanceCriterion(started, storyId, added.criterion.id, {
				satisfied: true
			});

			expect(findStory(updated, storyId).status).toBe('in-progress');
		});

		it('leaves a removal from a done-blocked story unpromoted', () => {
			const { map, storyId } = mapWithOneStory();
			const added = addAcceptanceCriterion(map, storyId, 'One');

			const updated = removeAcceptanceCriterion(added.map, storyId, added.criterion.id);

			expect(findStory(updated, storyId).status).toBe('todo');
		});
	});

	describe('inRankOrder', () => {
		it('sorts a story’s criteria inside it', () => {
			const { map, storyId } = mapWithOneStory();
			const first = addAcceptanceCriterion(map, storyId, 'One');
			const second = addAcceptanceCriterion(first.map, storyId, 'Two');
			const third = addAcceptanceCriterion(second.map, storyId, 'Three');
			const moved = moveAcceptanceCriterion(
				third.map,
				storyId,
				third.criterion.id,
				null,
				first.criterion.id
			);
			// Written back out of rank order, the way a document store hands it back.
			const shuffled: StoryMap = {
				...moved,
				stories: moved.stories.map((s) => ({ ...s, criteria: [...s.criteria].reverse() }))
			};

			const sorted = inRankOrder(shuffled);

			expect(criteriaOf(sorted, storyId).map((c) => c.text)).toEqual(['Three', 'One', 'Two']);
		});
	});
});

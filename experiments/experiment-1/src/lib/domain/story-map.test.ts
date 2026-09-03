import { describe, expect, it } from 'vitest';
import { ConflictError } from './errors';
import {
	addActivity,
	addSlice,
	addStep,
	addStory,
	createStoryMap,
	deleteActivity,
	deleteSlice,
	deleteStep,
	deleteStory,
	editStory,
	findActivity,
	findStory,
	moveActivity,
	moveSlice,
	moveStep,
	moveStory,
	renameActivity,
	renameSlice,
	renameStep
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

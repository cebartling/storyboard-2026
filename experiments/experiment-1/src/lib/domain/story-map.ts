/**
 * The StoryMap aggregate: pure data + pure functions. See ADR 0004 for why
 * this is a single aggregate, documentation/domain-model.md for the entity
 * shapes and invariants, and documentation/architecture.md for how this
 * layer fits into the rest of the app.
 *
 * Every function here is pure: it takes a `StoryMap` (and other plain
 * arguments) and returns a new `StoryMap` (or, for `add*`, the new map plus
 * the created entity) — the input is never mutated. Invariant violations
 * throw a descriptive `Error` rather than silently producing a bad state.
 */

import type { ActivityId, MapId, SliceId, StepId, StoryId } from './ids';
import { newId } from './ids';
import { rankAtEnd, rankBetween, type Rank } from './rank';
import { ConflictError, InvariantError } from './errors';

export interface Activity {
	id: ActivityId;
	mapId: MapId;
	name: string;
	rank: Rank;
	steps: Step[];
}

export interface Step {
	id: StepId;
	activityId: ActivityId;
	name: string;
	rank: Rank;
}

export interface Slice {
	id: SliceId;
	mapId: MapId;
	name: string;
	rank: Rank;
}

export interface Story {
	id: StoryId;
	stepId: StepId;
	title: string;
	description: string | null;
	sliceId: SliceId | null;
	rank: Rank;
}

export interface StoryMap {
	id: MapId;
	name: string;
	createdAt: Date;
	version: number;
	activities: Activity[];
	slices: Slice[];
	stories: Story[];
}

/** A neighbour reference for a move/insert operation: the id of an existing
 * sibling already in the target scope, or `null`/`undefined` to mean "the
 * very start" (as `beforeId`) or "the very end" (as `afterId`) of that scope. */
export type NeighbourId = string | null | undefined;

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function createStoryMap(name: string, createdAt: Date = new Date()): StoryMap {
	return {
		id: newId<MapId>(),
		name,
		createdAt,
		version: 0,
		activities: [],
		slices: [],
		stories: []
	};
}

// ---------------------------------------------------------------------------
// Lookups (throw on not-found; used internally and exported for callers that
// need read access, e.g. the app layer building view models)
// ---------------------------------------------------------------------------

export function findActivity(map: StoryMap, activityId: ActivityId): Activity {
	const activity = map.activities.find((a) => a.id === activityId);
	if (!activity) throw new InvariantError(`Activity not found: ${activityId}`);
	return activity;
}

export function findStep(map: StoryMap, stepId: StepId): Step {
	for (const activity of map.activities) {
		const step = activity.steps.find((s) => s.id === stepId);
		if (step) return step;
	}
	throw new InvariantError(`Step not found: ${stepId}`);
}

export function findSlice(map: StoryMap, sliceId: SliceId): Slice {
	const slice = map.slices.find((s) => s.id === sliceId);
	if (!slice) throw new InvariantError(`Slice not found: ${sliceId}`);
	return slice;
}

export function findStory(map: StoryMap, storyId: StoryId): Story {
	const story = map.stories.find((s) => s.id === storyId);
	if (!story) throw new InvariantError(`Story not found: ${storyId}`);
	return story;
}

// ---------------------------------------------------------------------------
// Rank-scope helpers
// ---------------------------------------------------------------------------

function activityRanks(map: StoryMap): Rank[] {
	return map.activities.map((a) => a.rank);
}

function stepRanks(activity: Activity): Rank[] {
	return activity.steps.map((s) => s.rank);
}

function sliceRanks(map: StoryMap): Rank[] {
	return map.slices.map((s) => s.rank);
}

function storyRanksInScope(map: StoryMap, stepId: StepId, sliceId: SliceId | null): Rank[] {
	return map.stories.filter((s) => s.stepId === stepId && s.sliceId === sliceId).map((s) => s.rank);
}

/** Resolves a rank for inserting/moving into a scope, given optional
 * neighbour ids and a lookup from id to that neighbour's current rank
 * (restricted to items that must actually be in the target scope). */
function resolveRank<TId>(
	scopeItems: { id: TId; rank: Rank }[],
	beforeId: NeighbourId,
	afterId: NeighbourId,
	scopeLabel: string
): Rank {
	const prev =
		beforeId != null ? requireInScope(scopeItems, beforeId, scopeLabel, 'beforeId') : null;
	const next = afterId != null ? requireInScope(scopeItems, afterId, scopeLabel, 'afterId') : null;
	if (prev === null && next === null) {
		// A drop into a populated scope always has at least one neighbour, so a
		// payload with neither can only mean the client derived them wrongly.
		// Appending silently would put the card somewhere the user did not drop
		// it; every other path in this function rejects a bad neighbour.
		if (scopeItems.length > 0) {
			throw new InvariantError(
				`neither beforeId nor afterId given for non-empty scope: ${scopeLabel}`
			);
		}
		return rankAtEnd([]);
	}
	assertNeighboursBracketAGap(scopeItems, prev, next, scopeLabel);
	return rankBetween(prev, next);
}

/**
 * A drop's neighbours name a gap in the target scope. If a sibling sits inside
 * that gap, the caller's view of the scope is stale — something was inserted
 * after it loaded — and the rank derived from those neighbours is not the
 * position the user chose. Worse, it is usually a *duplicate*: appended ranks
 * are consecutive, and `generateKeyBetween(prev, null)` returns exactly what
 * the next appended sibling already holds, so the save would fail on the unique
 * index as an opaque 500 instead of a conflict the client can act on.
 *
 * `ConflictError`, not `InvariantError`: nothing is wrong with the request in
 * itself, the caller is simply working from an out-of-date board, which is what
 * a 409 tells them.
 */
function assertNeighboursBracketAGap<TId>(
	scopeItems: { id: TId; rank: Rank }[],
	prev: Rank | null,
	next: Rank | null,
	scopeLabel: string
): void {
	const intruder = scopeItems.find(
		(item) => (prev === null || item.rank > prev) && (next === null || item.rank < next)
	);
	if (intruder) {
		throw new ConflictError(
			`the drop target in ${scopeLabel} has changed since it was loaded; reload and try again`
		);
	}
}

function requireInScope<TId>(
	scopeItems: { id: TId; rank: Rank }[],
	id: string,
	scopeLabel: string,
	which: string
): Rank {
	const item = scopeItems.find((i) => i.id === id);
	if (!item) {
		throw new InvariantError(`${which} (${id}) is not a member of the target scope: ${scopeLabel}`);
	}
	return item.rank;
}

// ---------------------------------------------------------------------------
// Add
// ---------------------------------------------------------------------------

export function addActivity(map: StoryMap, name: string): { map: StoryMap; activity: Activity } {
	const activity: Activity = {
		id: newId<ActivityId>(),
		mapId: map.id,
		name,
		rank: rankAtEnd(activityRanks(map)),
		steps: []
	};
	return { map: { ...map, activities: [...map.activities, activity] }, activity };
}

export function addStep(
	map: StoryMap,
	activityId: ActivityId,
	name: string
): { map: StoryMap; step: Step } {
	const activity = findActivity(map, activityId);
	const step: Step = {
		id: newId<StepId>(),
		activityId,
		name,
		rank: rankAtEnd(stepRanks(activity))
	};
	return {
		map: {
			...map,
			activities: map.activities.map((a) =>
				a.id === activityId ? { ...a, steps: [...a.steps, step] } : a
			)
		},
		step
	};
}

export function addSlice(map: StoryMap, name: string): { map: StoryMap; slice: Slice } {
	const slice: Slice = {
		id: newId<SliceId>(),
		mapId: map.id,
		name,
		rank: rankAtEnd(sliceRanks(map))
	};
	return { map: { ...map, slices: [...map.slices, slice] }, slice };
}

export function addStory(
	map: StoryMap,
	stepId: StepId,
	title: string,
	options: { description?: string | null; sliceId?: SliceId | null } = {}
): { map: StoryMap; story: Story } {
	findStep(map, stepId); // throws if not found
	const sliceId = options.sliceId ?? null;
	if (sliceId !== null) assertSliceBelongsToMap(map, sliceId);

	const story: Story = {
		id: newId<StoryId>(),
		stepId,
		title,
		description: options.description ?? null,
		sliceId,
		rank: rankAtEnd(storyRanksInScope(map, stepId, sliceId))
	};
	return { map: { ...map, stories: [...map.stories, story] }, story };
}

function assertSliceBelongsToMap(map: StoryMap, sliceId: SliceId): void {
	if (!map.slices.some((s) => s.id === sliceId)) {
		throw new InvariantError(`Slice ${sliceId} does not belong to map ${map.id}`);
	}
}

// ---------------------------------------------------------------------------
// Rename / edit
// ---------------------------------------------------------------------------

export function renameActivity(map: StoryMap, activityId: ActivityId, name: string): StoryMap {
	findActivity(map, activityId);
	return {
		...map,
		activities: map.activities.map((a) => (a.id === activityId ? { ...a, name } : a))
	};
}

export function renameStep(map: StoryMap, stepId: StepId, name: string): StoryMap {
	findStep(map, stepId);
	return {
		...map,
		activities: map.activities.map((a) => ({
			...a,
			steps: a.steps.map((s) => (s.id === stepId ? { ...s, name } : s))
		}))
	};
}

export function renameSlice(map: StoryMap, sliceId: SliceId, name: string): StoryMap {
	findSlice(map, sliceId);
	return { ...map, slices: map.slices.map((s) => (s.id === sliceId ? { ...s, name } : s)) };
}

export function editStory(
	map: StoryMap,
	storyId: StoryId,
	changes: { title?: string; description?: string | null }
): StoryMap {
	findStory(map, storyId);
	return {
		...map,
		stories: map.stories.map((s) =>
			s.id === storyId
				? {
						...s,
						// Assigned explicitly rather than spread: a spread copies keys whose
						// value is `undefined`, so `{ title: undefined }` would blank a
						// required field. `description` needs the `!== undefined` form
						// because `null` is a legal value that must still clear it.
						title: changes.title ?? s.title,
						description: changes.description !== undefined ? changes.description : s.description
					}
				: s
		)
	};
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/** Deleting an Activity cascades to its Steps and their Stories. */
export function deleteActivity(map: StoryMap, activityId: ActivityId): StoryMap {
	const activity = findActivity(map, activityId);
	const deletedStepIds = new Set(activity.steps.map((s) => s.id));
	return {
		...map,
		activities: map.activities.filter((a) => a.id !== activityId),
		stories: map.stories.filter((s) => !deletedStepIds.has(s.stepId))
	};
}

/** Deleting a Step cascades to its Stories. */
export function deleteStep(map: StoryMap, stepId: StepId): StoryMap {
	findStep(map, stepId);
	return {
		...map,
		activities: map.activities.map((a) => ({
			...a,
			steps: a.steps.filter((s) => s.id !== stepId)
		})),
		stories: map.stories.filter((s) => s.stepId !== stepId)
	};
}

/** Deleting a Slice does NOT delete its Stories — it un-slices them
 * (sliceId -> null), matching pulling a strip of tape off a physical wall.
 * Un-sliced stories are re-ranked to append, in their prior relative order,
 * to the end of each affected step's unsliced band (their old rank was
 * scoped to (stepId, sliceId) and would not necessarily be valid, or even
 * unique, in the (stepId, null) scope). */
export function deleteSlice(map: StoryMap, sliceId: SliceId): StoryMap {
	findSlice(map, sliceId);

	const affected = map.stories
		.filter((s) => s.sliceId === sliceId)
		.sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));

	const unslicedRanksByStep = new Map<StepId, Rank[]>();
	const reranked = new Map<StoryId, Rank>();
	for (const story of affected) {
		const existing =
			unslicedRanksByStep.get(story.stepId) ?? storyRanksInScope(map, story.stepId, null);
		const newRank = rankAtEnd(existing);
		unslicedRanksByStep.set(story.stepId, [...existing, newRank]);
		reranked.set(story.id, newRank);
	}

	return {
		...map,
		slices: map.slices.filter((s) => s.id !== sliceId),
		stories: map.stories.map((s) =>
			s.sliceId === sliceId ? { ...s, sliceId: null, rank: reranked.get(s.id)! } : s
		)
	};
}

export function deleteStory(map: StoryMap, storyId: StoryId): StoryMap {
	findStory(map, storyId);
	return { ...map, stories: map.stories.filter((s) => s.id !== storyId) };
}

// ---------------------------------------------------------------------------
// Move / reorder
// ---------------------------------------------------------------------------

/** Moves a Story to a target (stepId, sliceId) scope, computing its rank
 * from `beforeId`/`afterId` — siblings already in that target scope. When
 * `toSliceId` differs from the story's current `sliceId`, this is a slice
 * reassignment plus a re-rank, written together (see domain-model.md's
 * worked example). `toSliceId` must be `null` or a Slice belonging to the
 * same map. */
export function moveStory(
	map: StoryMap,
	storyId: StoryId,
	toStepId: StepId,
	toSliceId: SliceId | null,
	beforeId: NeighbourId,
	afterId: NeighbourId
): StoryMap {
	findStory(map, storyId);
	findStep(map, toStepId);
	if (toSliceId !== null) assertSliceBelongsToMap(map, toSliceId);

	const targetSiblings = map.stories
		.filter((s) => s.id !== storyId && s.stepId === toStepId && s.sliceId === toSliceId)
		.map((s) => ({ id: s.id, rank: s.rank }));
	const rank = resolveRank(
		targetSiblings,
		beforeId,
		afterId,
		`(step ${toStepId}, slice ${toSliceId})`
	);

	return {
		...map,
		stories: map.stories.map((s) =>
			s.id === storyId ? { ...s, stepId: toStepId, sliceId: toSliceId, rank } : s
		)
	};
}

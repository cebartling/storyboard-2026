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

import type {
	AcceptanceCriterionId,
	ActivityId,
	GlossaryEntryId,
	MapId,
	SliceId,
	StepId,
	StoryId
} from './ids';
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

/**
 * Where a story has got to (ADR 0021).
 *
 * Declared as a `const` array with the type derived from it, rather than the
 * other way round: the `<select>` in the edit dialog and `requireStatus` in the
 * route both need to enumerate the values at runtime, and deriving the union
 * from the array is what stops those two lists from drifting apart from this
 * one.
 */
export const STORY_STATUSES = ['backlog', 'todo', 'in-progress', 'in-review', 'done'] as const;

export type StoryStatus = (typeof STORY_STATUSES)[number];

/**
 * The status every story starts in, and the one a document written before this
 * field existed reads back as. See ADR 0021 for why it is `todo` rather than
 * `backlog`.
 */
export const DEFAULT_STORY_STATUS: StoryStatus = 'todo';

export function isStoryStatus(value: unknown): value is StoryStatus {
	return STORY_STATUSES.includes(value as StoryStatus);
}

/**
 * One acceptance criterion on one story (ADR 0024).
 *
 * Nested inside its `Story` rather than flat on the root beside `dependencies`,
 * because a criterion has exactly one parent: the parent *is* the rank scope,
 * and every cascade that removes a story removes its criteria structurally,
 * with no filter to forget.
 */
export interface AcceptanceCriterion {
	id: AcceptanceCriterionId;
	text: string;
	/** Fractional rank, scoped to the one story that owns it (ADR 0005). */
	rank: Rank;
	satisfied: boolean;
}

export interface Story {
	id: StoryId;
	stepId: StepId;
	title: string;
	description: string | null;
	sliceId: SliceId | null;
	/** Never absent in the domain. The two edges that can produce a story
	 *  without one — `addStory` and the repository's `toDomain` — both default
	 *  it, because there are no migrations (ADR 0003). */
	status: StoryStatus;
	rank: Rank;
	/** Never absent in the domain, for the same reason and at the same two
	 *  edges as `status`. Empty is the normal case. */
	criteria: AcceptanceCriterion[];
}

/**
 * A directional "blocks" edge between two Stories in one map (ADR 0019).
 *
 * The pair *is* the identity — that is exactly what the duplicate rule
 * enforces — so there is no id to keep consistent with it. And an edge is never
 * laid out on the board, so it has no `rank`: `dependencies` is deliberately
 * left out of `inRankOrder`, whose `byRank` would sort on a field that is not
 * there.
 */
export interface Dependency {
	/** The story that must come first. */
	blockerId: StoryId;
	/** The story that waits on it. */
	blockedId: StoryId;
}

/**
 * One term in the map's glossary (ADR 0025).
 *
 * Flat on the root, because a term belongs to the map rather than to any one
 * story: many stories link to it, and deleting a story must not take it along.
 * No `rank` — the glossary is shown sorted by term, so there is no order a
 * person chooses, and `inRankOrder` leaves it alone as it does `dependencies`.
 *
 * Both fields are plain text. A story description links here by id
 * (`[words](glossary:<id>)`), so renaming a term never breaks a link.
 */
export interface GlossaryEntry {
	id: GlossaryEntryId;
	term: string;
	definition: string;
}

export interface StoryMap {
	id: MapId;
	name: string;
	createdAt: Date;
	version: number;
	activities: Activity[];
	slices: Slice[];
	stories: Story[];
	/** Flat on the root beside `stories`, because an edge belongs to neither
	 *  endpoint: nesting it under the blocker would make "what blocks me" a scan
	 *  of every story, and make the two prune directions structurally different. */
	dependencies: Dependency[];
	/** Never absent in the domain; the repository's `toDomain` defaults it for
	 *  documents written before it existed. Empty is the normal case. */
	glossary: GlossaryEntry[];
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
		name: requireName(name, 'Map name'),
		createdAt,
		version: 0,
		activities: [],
		slices: [],
		stories: [],
		dependencies: [],
		glossary: []
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

export function findGlossaryEntry(map: StoryMap, entryId: GlossaryEntryId): GlossaryEntry {
	const entry = map.glossary.find((e) => e.id === entryId);
	if (!entry) throw new InvariantError(`Glossary entry not found: ${entryId}`);
	return entry;
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
		name: requireName(name, 'Activity name'),
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
		name: requireName(name, 'Step name'),
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
		name: requireName(name, 'Slice name'),
		rank: rankAtEnd(sliceRanks(map))
	};
	return { map: { ...map, slices: [...map.slices, slice] }, slice };
}

export function addStory(
	map: StoryMap,
	stepId: StepId,
	title: string,
	options: { description?: string | null; sliceId?: SliceId | null; status?: StoryStatus } = {}
): { map: StoryMap; story: Story } {
	findStep(map, stepId); // throws if not found
	const sliceId = options.sliceId ?? null;
	if (sliceId !== null) assertSliceBelongsToMap(map, sliceId);

	const story: Story = {
		id: newId<StoryId>(),
		stepId,
		title: requireName(title, 'Story title'),
		description: options.description ?? null,
		sliceId,
		status: options.status ?? DEFAULT_STORY_STATUS,
		rank: rankAtEnd(storyRanksInScope(map, stepId, sliceId)),
		criteria: []
	};
	return { map: { ...map, stories: [...map.stories, story] }, story };
}

/**
 * Every entity on a board is identified to the user by its name, so a blank one
 * is not a degenerate case to tolerate — it is a card nobody can read. Trimming
 * here rather than at the edge also means two names cannot differ only by
 * padding. Descriptions are exempt: they are genuinely optional.
 */
function requireName(value: string, label: string): string {
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		throw new InvariantError(`${label} must not be empty`);
	}
	return trimmed;
}

function assertSliceBelongsToMap(map: StoryMap, sliceId: SliceId): void {
	if (!map.slices.some((s) => s.id === sliceId)) {
		throw new InvariantError(`Slice ${sliceId} does not belong to map ${map.id}`);
	}
}

/** Every edge that does not touch one of `removed`. Used by the deletes that
 *  actually remove stories, so no edge is left pointing at nothing — there is
 *  no foreign key here to catch one (ADR 0003). */
function withoutStories(dependencies: Dependency[], removed: Set<StoryId>): Dependency[] {
	return dependencies.filter((d) => !removed.has(d.blockerId) && !removed.has(d.blockedId));
}

/**
 * The chain of story ids from `from` to `to` along blocks-edges, or `null` when
 * `to` is unreachable. Returned as a path rather than a boolean so a rejection
 * can name the loop it would have closed.
 *
 * The `seen` set is not for termination — the stored graph is acyclic by
 * induction, since every edge in it went through `addDependency` — it is for
 * cost. Without it a diamond is re-walked once per path into it, and a document
 * hand-edited into a cycle would hang here instead of being rejected.
 */
function pathBetween(dependencies: Dependency[], from: StoryId, to: StoryId): StoryId[] | null {
	const successors = new Map<StoryId, StoryId[]>();
	for (const d of dependencies) {
		const existing = successors.get(d.blockerId);
		if (existing) existing.push(d.blockedId);
		else successors.set(d.blockerId, [d.blockedId]);
	}

	const seen = new Set<StoryId>([from]);
	const stack: StoryId[][] = [[from]];
	while (stack.length > 0) {
		const path = stack.pop()!;
		const node = path[path.length - 1];
		if (node === to) return path;
		for (const next of successors.get(node) ?? []) {
			if (seen.has(next)) continue;
			seen.add(next);
			stack.push([...path, next]);
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// Rename / edit
// ---------------------------------------------------------------------------

export function renameActivity(map: StoryMap, activityId: ActivityId, name: string): StoryMap {
	findActivity(map, activityId);
	const trimmed = requireName(name, 'Activity name');
	return {
		...map,
		activities: map.activities.map((a) => (a.id === activityId ? { ...a, name: trimmed } : a))
	};
}

export function renameStep(map: StoryMap, stepId: StepId, name: string): StoryMap {
	findStep(map, stepId);
	const trimmed = requireName(name, 'Step name');
	return {
		...map,
		activities: map.activities.map((a) => ({
			...a,
			steps: a.steps.map((s) => (s.id === stepId ? { ...s, name: trimmed } : s))
		}))
	};
}

export function renameSlice(map: StoryMap, sliceId: SliceId, name: string): StoryMap {
	findSlice(map, sliceId);
	const trimmed = requireName(name, 'Slice name');
	return {
		...map,
		slices: map.slices.map((s) => (s.id === sliceId ? { ...s, name: trimmed } : s))
	};
}

export function editStory(
	map: StoryMap,
	storyId: StoryId,
	changes: { title?: string; description?: string | null; status?: StoryStatus }
): StoryMap {
	const story = findStory(map, storyId);
	const title = changes.title === undefined ? undefined : requireName(changes.title, 'Story title');
	// Acceptance criteria gate `done`, and nothing else (ADR 0024). Checked here
	// rather than in the repository: a stored document may legitimately hold
	// `done` alongside an unmet criterion — a criterion added by a later build to
	// a story already finished, or a hand-edited document — and refusing that on
	// the read path would make the map impossible to load rather than impossible
	// to save.
	if (changes.status !== undefined) assertStatusAllowed(story, changes.status);
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
						title: title ?? s.title,
						description: changes.description !== undefined ? changes.description : s.description,
						status: changes.status ?? s.status
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
	const deletedStoryIds = new Set(
		map.stories.filter((s) => deletedStepIds.has(s.stepId)).map((s) => s.id)
	);
	return {
		...map,
		activities: map.activities.filter((a) => a.id !== activityId),
		stories: map.stories.filter((s) => !deletedStoryIds.has(s.id)),
		dependencies: withoutStories(map.dependencies, deletedStoryIds)
	};
}

/** Deleting a Step cascades to its Stories. */
export function deleteStep(map: StoryMap, stepId: StepId): StoryMap {
	findStep(map, stepId);
	// Hoisted rather than filtering on `stepId` twice, so "what went" has one
	// definition that both the story filter and the edge filter read.
	const deletedStoryIds = new Set(map.stories.filter((s) => s.stepId === stepId).map((s) => s.id));
	return {
		...map,
		activities: map.activities.map((a) => ({
			...a,
			steps: a.steps.filter((s) => s.id !== stepId)
		})),
		stories: map.stories.filter((s) => !deletedStoryIds.has(s.id)),
		dependencies: withoutStories(map.dependencies, deletedStoryIds)
	};
}

/**
 * The same map, with every collection in rank order.
 *
 * Rank decides what the board renders where, but nothing else here maintains
 * array order — `moveStory` and friends change a rank and leave the element
 * where it sits. Under SQLite that never showed, because every read went
 * through an `ORDER BY rank`; a document store hands back the array as written,
 * so the guarantee has to be made somewhere. Repositories apply this on load,
 * and the contract test holds them to it.
 *
 * Stories are sorted as one list rather than per cell: sorting the whole list
 * fixes the relative order inside every (step, slice) scope, which is where
 * rank is unique and where the board actually reads it.
 *
 * A story's acceptance criteria are sorted inside it, the way a step is sorted
 * inside its activity — the second nesting level, and the only cost of having
 * put criteria on the story rather than on the root (ADR 0024).
 */
export function inRankOrder(map: StoryMap): StoryMap {
	return {
		...map,
		activities: byRank(map.activities).map((a) => ({ ...a, steps: byRank(a.steps) })),
		slices: byRank(map.slices),
		stories: byRank(map.stories).map((s) => ({ ...s, criteria: byRank(s.criteria) }))
	};
}

function byRank<T extends { rank: Rank }>(items: T[]): T[] {
	return [...items].sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
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
	return {
		...map,
		stories: map.stories.filter((s) => s.id !== storyId),
		dependencies: withoutStories(map.dependencies, new Set([storyId]))
	};
}

// ---------------------------------------------------------------------------
// Dependencies (ADR 0019)
// ---------------------------------------------------------------------------

/**
 * Records that `blocker` must come before `blocked`.
 *
 * Existence is checked first, and it doubles as the same-map check: `map.stories`
 * is the whole map, so "this story exists" and "this story belongs here" are one
 * lookup — the same trick `addStory` plays with `findStep`.
 */
export function addDependency(map: StoryMap, blockerId: StoryId, blockedId: StoryId): StoryMap {
	const blocker = findStory(map, blockerId);
	const blocked = findStory(map, blockedId);

	if (blockerId === blockedId) {
		throw new InvariantError(`"${blocker.title}" cannot block itself`);
	}
	if (map.dependencies.some((d) => d.blockerId === blockerId && d.blockedId === blockedId)) {
		throw new InvariantError(`"${blocker.title}" already blocks "${blocked.title}"`);
	}

	// Deliberately not checked above: the *reverse* edge. It is not a duplicate —
	// the edges are directional and distinct — it is the shortest possible cycle,
	// and it belongs to the check below, whose message says so. Reporting it as a
	// duplicate would answer a question the user did not ask.
	//
	// Adding blocker -> blocked closes a loop exactly when `blocked` already
	// reaches `blocker`, so the walk starts at the blocked story and looks for
	// the blocker. Reversed, this would ask "does the blocker already reach the
	// blocked story?" — which accepts real 2-cycles and rejects a merely
	// redundant transitive edge.
	const loop = pathBetween(map.dependencies, blockedId, blockerId);
	if (loop) {
		// `loop` already runs from the blocked story to the blocker, so the edge
		// being refused goes on the *front* to close it: C -> A -> B -> C reads as
		// the loop it would make. Appending the blocker instead repeats the tail
		// and leaves out the edge the user actually asked for.
		const chain = [blockerId, ...loop]
			.map((id) => `"${findStory(map, id).title}"`)
			.join(' blocks ');
		throw new InvariantError(
			`"${blocker.title}" cannot block "${blocked.title}": that would create a cycle (${chain})`
		);
	}

	return { ...map, dependencies: [...map.dependencies, { blockerId, blockedId }] };
}

/**
 * Drops one edge, in the direction given.
 *
 * Throws on a missing edge rather than being idempotent, matching `deleteStory`.
 * The idempotent reading would be "someone else already removed it", but any
 * removal bumps the version, so a stale caller is refused with a 409 before this
 * runs — a missing edge here can only be a malformed request.
 */
export function removeDependency(map: StoryMap, blockerId: StoryId, blockedId: StoryId): StoryMap {
	const remaining = map.dependencies.filter(
		(d) => !(d.blockerId === blockerId && d.blockedId === blockedId)
	);
	if (remaining.length === map.dependencies.length) {
		throw new InvariantError(`No dependency from ${blockerId} to ${blockedId}`);
	}
	return { ...map, dependencies: remaining };
}

// ---------------------------------------------------------------------------
// Acceptance criteria (ADR 0024)
// ---------------------------------------------------------------------------

function criterionRanks(story: Story): Rank[] {
	return story.criteria.map((c) => c.rank);
}

/**
 * The criterion, or a throw naming the story it was looked for in.
 *
 * Scoped to one story rather than searched across the map, which is what makes
 * the ticket's "must have a user story parent" operational: a criterion id that
 * belongs to a different story is *rejected* here, not quietly found.
 */
function findCriterion(story: Story, criterionId: AcceptanceCriterionId): AcceptanceCriterion {
	const criterion = story.criteria.find((c) => c.id === criterionId);
	if (!criterion) {
		throw new InvariantError(`Acceptance criterion not found on story ${story.id}: ${criterionId}`);
	}
	return criterion;
}

/** The same map with one story replaced. Every criterion operation rebuilds two
 *  levels, and doing it in one place keeps the spread — which is what carries
 *  the fields none of these functions touch — out of four call sites. */
function withStory(map: StoryMap, storyId: StoryId, next: (story: Story) => Story): StoryMap {
	return { ...map, stories: map.stories.map((s) => (s.id === storyId ? next(s) : s)) };
}

/**
 * How far a story's criteria have got, for the `done` gate and its message.
 *
 * A story with no criteria reports nothing unmet, which is what makes the gate
 * invisible to every story that has none.
 */
function unmetCriteria(story: Story): AcceptanceCriterion[] {
	return story.criteria.filter((c) => !c.satisfied);
}

/**
 * `done` is the one status acceptance criteria constrain (ADR 0024): a story
 * whose criteria are not all satisfied cannot be marked finished.
 *
 * Only `done`. The other four stay freely settable, so the field keeps one rule
 * rather than becoming derived for some stories and stored for others.
 */
function assertStatusAllowed(story: Story, status: StoryStatus): void {
	if (status !== 'done') return;
	const unmet = unmetCriteria(story);
	if (unmet.length > 0) {
		throw new InvariantError(
			`${unmet.length} of ${story.criteria.length} acceptance criteria are unmet on "${story.title}"`
		);
	}
}

/**
 * A `done` story that acquires an unmet criterion drops back to `in-review`.
 *
 * The alternative — refusing the write — would make a `done` story the one
 * story you cannot add a criterion to, which is backwards: noticing a missing
 * criterion is exactly what happens while reviewing something called finished.
 * `in-review` rather than `in-progress` because the work was claimed complete;
 * what is outstanding is the checking.
 *
 * There is no move in the other direction. Satisfying the last criterion does
 * not promote a story to `done` — a person does that, deliberately, and the
 * gate above is what stops them doing it early.
 */
function demoteIfDone(story: Story): Story {
	if (story.status !== 'done' || unmetCriteria(story).length === 0) return story;
	return { ...story, status: 'in-review' };
}

export function addAcceptanceCriterion(
	map: StoryMap,
	storyId: StoryId,
	text: string
): { map: StoryMap; criterion: AcceptanceCriterion } {
	const story = findStory(map, storyId); // throws if not found, and so if not in this map
	const criterion: AcceptanceCriterion = {
		id: newId<AcceptanceCriterionId>(),
		text: requireName(text, 'Acceptance criterion'),
		rank: rankAtEnd(criterionRanks(story)),
		satisfied: false
	};
	return {
		map: withStory(map, storyId, (s) =>
			demoteIfDone({ ...s, criteria: [...s.criteria, criterion] })
		),
		criterion
	};
}

export function editAcceptanceCriterion(
	map: StoryMap,
	storyId: StoryId,
	criterionId: AcceptanceCriterionId,
	changes: { text?: string; satisfied?: boolean }
): StoryMap {
	const story = findStory(map, storyId);
	findCriterion(story, criterionId); // throws if it belongs to another story
	const text =
		changes.text === undefined ? undefined : requireName(changes.text, 'Acceptance criterion');
	// Only an undone tick can grow the unmet set, so only an undone tick can
	// demote. ADR 0024 names exactly two triggers — a tick undone, or a criterion
	// added — and rewording a criterion is neither: a story that legitimately
	// holds `done` beside an unmet criterion (which the read path must accept)
	// would otherwise change status because somebody fixed a typo.
	const undoingATick = changes.satisfied === false;
	return withStory(map, storyId, (s) => {
		const next: Story = {
			...s,
			criteria: s.criteria.map((c) =>
				c.id === criterionId
					? {
							...c,
							// Assigned explicitly rather than spread, as `editStory` does: a
							// spread copies keys whose value is `undefined`, which would blank
							// a field the caller did not mention. `!== undefined` rather than
							// `??` for `satisfied` — `??` happens to be correct for a boolean,
							// but it stops being correct the moment the field is widened, and
							// "unticking is a no-op" is a bug that no other test here catches.
							text: text ?? c.text,
							satisfied: changes.satisfied !== undefined ? changes.satisfied : c.satisfied
						}
					: c
			)
		};
		return undoingATick ? demoteIfDone(next) : next;
	});
}

/**
 * Drops one criterion.
 *
 * Throws on a missing one rather than being idempotent, for the reason
 * `removeDependency` gives: any removal bumps the version, so a stale caller is
 * refused with a 409 before this runs.
 *
 * Removing an unmet criterion never promotes the story, even when it was the
 * only thing outstanding — see `demoteIfDone`.
 */
export function removeAcceptanceCriterion(
	map: StoryMap,
	storyId: StoryId,
	criterionId: AcceptanceCriterionId
): StoryMap {
	const story = findStory(map, storyId);
	findCriterion(story, criterionId);
	return withStory(map, storyId, (s) => ({
		...s,
		criteria: s.criteria.filter((c) => c.id !== criterionId)
	}));
}

/** Reorders a criterion within its own story, which is the whole rank scope —
 *  so like `moveActivity` there is nowhere else to move it to. */
export function moveAcceptanceCriterion(
	map: StoryMap,
	storyId: StoryId,
	criterionId: AcceptanceCriterionId,
	beforeId: NeighbourId,
	afterId: NeighbourId
): StoryMap {
	const story = findStory(map, storyId);
	findCriterion(story, criterionId);
	const siblings = story.criteria.filter((c) => c.id !== criterionId);
	const rank = resolveRank(siblings, beforeId, afterId, `criteria of story ${storyId}`);
	return withStory(map, storyId, (s) => ({
		...s,
		criteria: s.criteria.map((c) => (c.id === criterionId ? { ...c, rank } : c))
	}));
}

// ---------------------------------------------------------------------------
// Glossary (ADR 0025)
// ---------------------------------------------------------------------------

/**
 * Terms are unique per map, compared the way a reader compares them: "SKU" and
 * " sku " are one term. Two entries for one term would leave a reader unsure
 * which definition a link means, and the glossary page with two rows that
 * look identical.
 *
 * `exceptId` lets an entry keep its own term while its definition is edited.
 */
function assertTermIsFree(map: StoryMap, term: string, exceptId?: GlossaryEntryId): void {
	const key = term.toLocaleLowerCase();
	const clash = map.glossary.find((e) => e.id !== exceptId && e.term.toLocaleLowerCase() === key);
	if (clash) {
		throw new InvariantError(`"${clash.term}" is already in the glossary`);
	}
}

export function addGlossaryEntry(
	map: StoryMap,
	term: string,
	definition: string
): { map: StoryMap; entry: GlossaryEntry } {
	const entry: GlossaryEntry = {
		id: newId<GlossaryEntryId>(),
		term: requireName(term, 'Glossary term'),
		definition: requireName(definition, 'Glossary definition')
	};
	assertTermIsFree(map, entry.term);
	return { map: { ...map, glossary: [...map.glossary, entry] }, entry };
}

export function editGlossaryEntry(
	map: StoryMap,
	entryId: GlossaryEntryId,
	changes: { term?: string; definition?: string }
): StoryMap {
	findGlossaryEntry(map, entryId);
	const term = changes.term === undefined ? undefined : requireName(changes.term, 'Glossary term');
	const definition =
		changes.definition === undefined
			? undefined
			: requireName(changes.definition, 'Glossary definition');
	if (term !== undefined) assertTermIsFree(map, term, entryId);
	return {
		...map,
		glossary: map.glossary.map((e) =>
			e.id === entryId
				? // Assigned explicitly rather than spread, as `editStory` does: a
					// spread copies keys whose value is `undefined`.
					{ ...e, term: term ?? e.term, definition: definition ?? e.definition }
				: e
		)
	};
}

/**
 * Drops one entry, and deliberately leaves every description alone.
 *
 * A link to a deleted entry renders as its plain words (ADR 0025), so nothing
 * breaks; rewriting other people's prose as a side effect of a glossary edit
 * would be a far larger write than the one asked for. Throws on a missing
 * entry for the reason `removeDependency` gives.
 */
export function deleteGlossaryEntry(map: StoryMap, entryId: GlossaryEntryId): StoryMap {
	findGlossaryEntry(map, entryId);
	return { ...map, glossary: map.glossary.filter((e) => e.id !== entryId) };
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
/**
 * Reorders an activity within the map. The map is the whole rank scope, so
 * unlike `moveStep` there is nowhere else to move to.
 */
export function moveActivity(
	map: StoryMap,
	activityId: ActivityId,
	beforeId: NeighbourId,
	afterId: NeighbourId
): StoryMap {
	findActivity(map, activityId);

	const siblings = map.activities
		.filter((a) => a.id !== activityId)
		.map((a) => ({ id: a.id, rank: a.rank }));
	const rank = resolveRank(siblings, beforeId, afterId, `activities of map ${map.id}`);

	return {
		...map,
		activities: map.activities.map((a) => (a.id === activityId ? { ...a, rank } : a))
	};
}

/**
 * Moves a step within its activity, or to a different one. Stories reference
 * their step by id and carry no activity of their own, so they follow the step
 * without being touched here — the same reason `deleteStep` has to remove them
 * explicitly.
 */
export function moveStep(
	map: StoryMap,
	stepId: StepId,
	toActivityId: ActivityId,
	beforeId: NeighbourId,
	afterId: NeighbourId
): StoryMap {
	const step = findStep(map, stepId);
	const toActivity = findActivity(map, toActivityId);

	const siblings = toActivity.steps
		.filter((s) => s.id !== stepId)
		.map((s) => ({ id: s.id, rank: s.rank }));
	const rank = resolveRank(siblings, beforeId, afterId, `steps of activity ${toActivityId}`);

	const moved: Step = { ...step, activityId: toActivityId, rank };
	return {
		...map,
		activities: map.activities.map((a) => {
			const withoutStep = a.steps.filter((s) => s.id !== stepId);
			return {
				...a,
				steps: a.id === toActivityId ? [...withoutStep, moved] : withoutStep
			};
		})
	};
}

/** Reorders a slice within the map, changing the board's release bands top to
 *  bottom. Stories reference slices by id, so their membership is untouched. */
export function moveSlice(
	map: StoryMap,
	sliceId: SliceId,
	beforeId: NeighbourId,
	afterId: NeighbourId
): StoryMap {
	findSlice(map, sliceId);

	const siblings = map.slices
		.filter((s) => s.id !== sliceId)
		.map((s) => ({ id: s.id, rank: s.rank }));
	const rank = resolveRank(siblings, beforeId, afterId, `slices of map ${map.id}`);

	return {
		...map,
		slices: map.slices.map((s) => (s.id === sliceId ? { ...s, rank } : s))
	};
}

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

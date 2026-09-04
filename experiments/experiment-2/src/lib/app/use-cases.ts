/**
 * Use-case functions: thin orchestration between the driving adapter
 * (`src/routes/`) and the domain core + outbound ports. See
 * documentation/architecture.md's layer diagram and `moveStory` trace.
 *
 * Each function here calls into `src/lib/domain/` and the ports it needs — it
 * holds no business rules of its own. Name validation used to live here (and
 * again in the route), which contradicted that sentence and let the seed
 * builder past it; it is now in the domain where the other invariants are. The
 * board-editing use cases (add/rename/delete activities, steps, stories,
 * slices; move/reorder/slice a story) all follow the same shape: load the
 * aggregate, call the pure domain function, save, return whatever the
 * caller needs.
 */

import type { ActivityId, MapId, SliceId, StepId, StoryId, UserId } from '$lib/domain/ids';
import type {
	AiAssistant,
	Caller,
	MapAccess,
	MapSummary,
	Role,
	StoryMapRepository,
	StorySuggestion
} from '$lib/domain/ports';
import { ConflictError, InvariantError } from '$lib/domain/errors';
import { KeyedLock } from './keyed-lock';
import * as domain from '$lib/domain/story-map';
import {
	createStoryMap,
	type Activity,
	type Slice,
	type Step,
	type Story,
	type StoryMap
} from '$lib/domain/story-map';

export type { MapSummary };

export async function listMaps(
	repository: StoryMapRepository,
	caller: Caller
): Promise<MapSummary[]> {
	return repository.listSummaries(caller);
}

export async function createMap(
	repository: StoryMapRepository,
	caller: Caller,
	name: string
): Promise<StoryMap> {
	// The caller becomes the map's owner, inside the repository's own
	// transaction — see `StoryMapRepository.save` (ADR 0015).
	return repository.save(caller, createStoryMap(name));
}

/**
 * Deletes a whole map. Deliberately not a `loadOrThrow` + domain call like the
 * others: there is no aggregate left to hold an invariant, and no version to
 * check — the repository's cascade is the operation.
 *
 * Idempotent on purpose. The only caller is the map list, built from ids it has
 * just rendered, so a missing map means someone deleted it first rather than a
 * malformed request; failing would report an error for a state the caller
 * wanted anyway.
 */
export async function deleteMap(
	repository: StoryMapRepository,
	caller: Caller,
	mapId: MapId
): Promise<void> {
	await repository.delete(caller, mapId);
}

/** Returns the map *and* the caller's role, which the board needs to decide
 *  whether to offer owner-only controls. */
export async function loadMap(
	repository: StoryMapRepository,
	caller: Caller,
	id: MapId
): Promise<MapAccess | null> {
	return repository.load(caller, id);
}

/**
 * The caller's role on a map, without loading it. For authorising an action that
 * does not need the board — the cursor endpoint, which runs at pointer rate.
 */
export async function roleOf(
	repository: StoryMapRepository,
	caller: Caller,
	mapId: MapId
): Promise<Role | null> {
	return repository.roleOf(caller, mapId);
}

/** Shares a map with another account as an editor. Owner-only; the repository
 *  enforces that. */
export async function shareMap(
	repository: StoryMapRepository,
	caller: Caller,
	mapId: MapId,
	userId: UserId
): Promise<void> {
	await repository.addMember(caller, mapId, userId, 'editor');
}

async function loadOrThrow(
	repository: StoryMapRepository,
	caller: Caller,
	id: MapId,
	expectedVersion?: number
): Promise<StoryMap> {
	const access = await repository.load(caller, id);
	// Null covers both "no such map" and "not yours" — the repository does not
	// distinguish them, so neither can this (ADR 0015).
	if (!access) {
		throw new InvariantError(`No story map with id ${id}`);
	}
	const map = access.map;
	// The compare-and-set in `save()` only spans one request, which is not the
	// window that matters: a user holds an open editor for far longer than that.
	// Comparing the version the client was *given* against what is stored now is
	// what turns a stale editor into a 409 instead of a silent overwrite
	// (ADR 0014 §3). Checked before the domain function runs, so nothing is
	// computed against state we already know is stale.
	if (expectedVersion !== undefined && map.version !== expectedVersion) {
		throw new ConflictError(
			`Story map ${id} changed since it was loaded (expected version ${expectedVersion}, current version ${map.version})`
		);
	}
	return map;
}

/**
 * Serialises writes to one map (ADR 0014 §2). Module-level rather than injected:
 * it holds no configuration and has no second implementation, so a `Deps` entry
 * would be the DI-container creep ADR 0006 declined. The keys are map ids, so
 * separate tests never contend with each other.
 *
 * Sound only because the deployment is a single Node process — see `KeyedLock`.
 */
const mapWriteLock = new KeyedLock<MapId>();

/**
 * The shape every board mutation has: load the aggregate, apply one pure domain
 * function, save. Wrapping the whole of it — not just the save — is the point.
 *
 * Note what the lock does and does not buy, because ADR 0014 §2 overstates it
 * slightly. It says the second of two concurrent inserts "sees the first's
 * rank"; once §3's version round-trip is in place that cannot happen, because
 * the second writer is holding the version its editor opened at and is rejected
 * before it reaches the domain at all. What the lock actually guarantees is
 * that no two writers ever compute ranks against the same state — which matters
 * because `rank.ts` is deterministic with no actor entropy, so identical state
 * yields byte-identical keys — and that a retry always runs against committed
 * state rather than contending at the SQLite level.
 */
async function mutate<T>(
	repository: StoryMapRepository,
	caller: Caller,
	mapId: MapId,
	expectedVersion: number,
	apply: (map: StoryMap) => { map: StoryMap; result: T }
): Promise<T> {
	return mapWriteLock.run(mapId, async () => {
		const map = await loadOrThrow(repository, caller, mapId, expectedVersion);
		const { map: updated, result } = apply(map);
		await repository.save(caller, updated);
		return result;
	});
}

// ---------------------------------------------------------------------------
// Add
// ---------------------------------------------------------------------------

export async function addActivity(
	repository: StoryMapRepository,
	caller: Caller,
	mapId: MapId,
	expectedVersion: number,
	name: string
): Promise<Activity> {
	return mutate(repository, caller, mapId, expectedVersion, (map) => {
		const { map: updated, activity } = domain.addActivity(map, name);
		return { map: updated, result: activity };
	});
}

export async function addStep(
	repository: StoryMapRepository,
	caller: Caller,
	mapId: MapId,
	expectedVersion: number,
	activityId: ActivityId,
	name: string
): Promise<Step> {
	return mutate(repository, caller, mapId, expectedVersion, (map) => {
		const { map: updated, step } = domain.addStep(map, activityId, name);
		return { map: updated, result: step };
	});
}

export async function createSlice(
	repository: StoryMapRepository,
	caller: Caller,
	mapId: MapId,
	expectedVersion: number,
	name: string
): Promise<Slice> {
	return mutate(repository, caller, mapId, expectedVersion, (map) => {
		const { map: updated, slice } = domain.addSlice(map, name);
		return { map: updated, result: slice };
	});
}

export async function addStory(
	repository: StoryMapRepository,
	caller: Caller,
	mapId: MapId,
	expectedVersion: number,
	stepId: StepId,
	title: string,
	options: { description?: string | null; sliceId?: SliceId | null } = {}
): Promise<Story> {
	return mutate(repository, caller, mapId, expectedVersion, (map) => {
		const { map: updated, story } = domain.addStory(map, stepId, title, options);
		return { map: updated, result: story };
	});
}

// ---------------------------------------------------------------------------
// Rename / edit
// ---------------------------------------------------------------------------

export async function renameActivity(
	repository: StoryMapRepository,
	caller: Caller,
	mapId: MapId,
	expectedVersion: number,
	activityId: ActivityId,
	name: string
): Promise<void> {
	await mutate(repository, caller, mapId, expectedVersion, (map) => ({
		map: domain.renameActivity(map, activityId, name),
		result: undefined
	}));
}

export async function renameStep(
	repository: StoryMapRepository,
	caller: Caller,
	mapId: MapId,
	expectedVersion: number,
	stepId: StepId,
	name: string
): Promise<void> {
	await mutate(repository, caller, mapId, expectedVersion, (map) => ({
		map: domain.renameStep(map, stepId, name),
		result: undefined
	}));
}

export async function renameSlice(
	repository: StoryMapRepository,
	caller: Caller,
	mapId: MapId,
	expectedVersion: number,
	sliceId: SliceId,
	name: string
): Promise<void> {
	await mutate(repository, caller, mapId, expectedVersion, (map) => ({
		map: domain.renameSlice(map, sliceId, name),
		result: undefined
	}));
}

export async function editStory(
	repository: StoryMapRepository,
	caller: Caller,
	mapId: MapId,
	expectedVersion: number,
	storyId: StoryId,
	changes: { title?: string; description?: string | null }
): Promise<void> {
	const trimmedChanges =
		changes.title !== undefined ? { ...changes, title: changes.title } : changes;
	await mutate(repository, caller, mapId, expectedVersion, (map) => ({
		map: domain.editStory(map, storyId, trimmedChanges),
		result: undefined
	}));
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteActivity(
	repository: StoryMapRepository,
	caller: Caller,
	mapId: MapId,
	expectedVersion: number,
	activityId: ActivityId
): Promise<void> {
	await mutate(repository, caller, mapId, expectedVersion, (map) => ({
		map: domain.deleteActivity(map, activityId),
		result: undefined
	}));
}

export async function deleteStep(
	repository: StoryMapRepository,
	caller: Caller,
	mapId: MapId,
	expectedVersion: number,
	stepId: StepId
): Promise<void> {
	await mutate(repository, caller, mapId, expectedVersion, (map) => ({
		map: domain.deleteStep(map, stepId),
		result: undefined
	}));
}

export async function deleteSlice(
	repository: StoryMapRepository,
	caller: Caller,
	mapId: MapId,
	expectedVersion: number,
	sliceId: SliceId
): Promise<void> {
	await mutate(repository, caller, mapId, expectedVersion, (map) => ({
		map: domain.deleteSlice(map, sliceId),
		result: undefined
	}));
}

export async function deleteStory(
	repository: StoryMapRepository,
	caller: Caller,
	mapId: MapId,
	expectedVersion: number,
	storyId: StoryId
): Promise<void> {
	await mutate(repository, caller, mapId, expectedVersion, (map) => ({
		map: domain.deleteStory(map, storyId),
		result: undefined
	}));
}

// ---------------------------------------------------------------------------
// Move / reorder / slice
// ---------------------------------------------------------------------------

/**
 * Moves a Story to a target (stepId, sliceId) scope and re-ranks it there
 * from `beforeId`/`afterId` — the neighbour ids already in that scope, as
 * dropped by the drag wrapper. This is the one use case both a form POST
 * (progressive enhancement) and the drag zone's `finalize` handler call
 * (see documentation/architecture.md's `moveStory` trace); the server is
 * the sole authority on the resulting rank.
 */
export async function moveStory(
	repository: StoryMapRepository,
	caller: Caller,
	mapId: MapId,
	expectedVersion: number,
	storyId: StoryId,
	toStepId: StepId,
	toSliceId: SliceId | null,
	beforeId: string | null,
	afterId: string | null
): Promise<void> {
	await mutate(repository, caller, mapId, expectedVersion, (map) => ({
		map: domain.moveStory(map, storyId, toStepId, toSliceId, beforeId, afterId),
		result: undefined
	}));
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

/**
 * Asks the `AiAssistant` port for candidate stories on a step, given what the
 * step already has. This is the port's first consumer: ADR 0007 claimed the app
 * was "wired against the port today" when nothing called it, so the contract —
 * a domain snapshot in, structured suggestions out — was asserted rather than
 * demonstrated (finding A4 of documentation/review-2026-09-02.md).
 *
 * Read-only by design. Suggestions are returned for the caller to apply or
 * discard through the ordinary `addStory` path; writing them here would both
 * bump the version under a concurrent editor and take the accept/reject
 * decision away from the user.
 */
export async function suggestStoriesForStep(
	repository: StoryMapRepository,
	aiAssistant: AiAssistant,
	caller: Caller,
	mapId: MapId,
	stepId: StepId
): Promise<StorySuggestion[]> {
	const map = await loadOrThrow(repository, caller, mapId);
	const step = domain.findStep(map, stepId);
	const activity = domain.findActivity(map, step.activityId);

	return aiAssistant.suggestStoriesForStep({
		stepName: step.name,
		activityName: activity.name,
		existingStoryTitles: map.stories.filter((s) => s.stepId === stepId).map((s) => s.title)
	});
}

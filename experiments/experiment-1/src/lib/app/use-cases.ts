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

import type { ActivityId, MapId, SliceId, StepId, StoryId } from '$lib/domain/ids';
import type { AiAssistant, StoryMapRepository, StorySuggestion } from '$lib/domain/ports';
import { InvariantError } from '$lib/domain/errors';
import * as domain from '$lib/domain/story-map';
import {
	createStoryMap,
	type Activity,
	type Slice,
	type Step,
	type Story,
	type StoryMap
} from '$lib/domain/story-map';

export interface MapSummary {
	id: MapId;
	name: string;
	createdAt: Date;
}

export async function listMaps(repository: StoryMapRepository): Promise<MapSummary[]> {
	return repository.listSummaries();
}

export async function createMap(repository: StoryMapRepository, name: string): Promise<StoryMap> {
	return repository.save(createStoryMap(name));
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
export async function deleteMap(repository: StoryMapRepository, mapId: MapId): Promise<void> {
	await repository.delete(mapId);
}

export async function loadMap(repository: StoryMapRepository, id: MapId): Promise<StoryMap | null> {
	return repository.load(id);
}

async function loadOrThrow(repository: StoryMapRepository, id: MapId): Promise<StoryMap> {
	const map = await repository.load(id);
	if (!map) {
		throw new InvariantError(`No story map with id ${id}`);
	}
	return map;
}

// ---------------------------------------------------------------------------
// Add
// ---------------------------------------------------------------------------

export async function addActivity(
	repository: StoryMapRepository,
	mapId: MapId,
	name: string
): Promise<Activity> {
	const map = await loadOrThrow(repository, mapId);
	const { map: updated, activity } = domain.addActivity(map, name);
	await repository.save(updated);
	return activity;
}

export async function addStep(
	repository: StoryMapRepository,
	mapId: MapId,
	activityId: ActivityId,
	name: string
): Promise<Step> {
	const map = await loadOrThrow(repository, mapId);
	const { map: updated, step } = domain.addStep(map, activityId, name);
	await repository.save(updated);
	return step;
}

export async function createSlice(
	repository: StoryMapRepository,
	mapId: MapId,
	name: string
): Promise<Slice> {
	const map = await loadOrThrow(repository, mapId);
	const { map: updated, slice } = domain.addSlice(map, name);
	await repository.save(updated);
	return slice;
}

export async function addStory(
	repository: StoryMapRepository,
	mapId: MapId,
	stepId: StepId,
	title: string,
	options: { description?: string | null; sliceId?: SliceId | null } = {}
): Promise<Story> {
	const map = await loadOrThrow(repository, mapId);
	const { map: updated, story } = domain.addStory(map, stepId, title, options);
	await repository.save(updated);
	return story;
}

// ---------------------------------------------------------------------------
// Rename / edit
// ---------------------------------------------------------------------------

export async function renameActivity(
	repository: StoryMapRepository,
	mapId: MapId,
	activityId: ActivityId,
	name: string
): Promise<void> {
	const map = await loadOrThrow(repository, mapId);
	const updated = domain.renameActivity(map, activityId, name);
	await repository.save(updated);
}

export async function renameStep(
	repository: StoryMapRepository,
	mapId: MapId,
	stepId: StepId,
	name: string
): Promise<void> {
	const map = await loadOrThrow(repository, mapId);
	const updated = domain.renameStep(map, stepId, name);
	await repository.save(updated);
}

export async function renameSlice(
	repository: StoryMapRepository,
	mapId: MapId,
	sliceId: SliceId,
	name: string
): Promise<void> {
	const map = await loadOrThrow(repository, mapId);
	const updated = domain.renameSlice(map, sliceId, name);
	await repository.save(updated);
}

export async function editStory(
	repository: StoryMapRepository,
	mapId: MapId,
	storyId: StoryId,
	changes: { title?: string; description?: string | null }
): Promise<void> {
	const map = await loadOrThrow(repository, mapId);
	const trimmedChanges =
		changes.title !== undefined ? { ...changes, title: changes.title } : changes;
	const updated = domain.editStory(map, storyId, trimmedChanges);
	await repository.save(updated);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteActivity(
	repository: StoryMapRepository,
	mapId: MapId,
	activityId: ActivityId
): Promise<void> {
	const map = await loadOrThrow(repository, mapId);
	const updated = domain.deleteActivity(map, activityId);
	await repository.save(updated);
}

export async function deleteStep(
	repository: StoryMapRepository,
	mapId: MapId,
	stepId: StepId
): Promise<void> {
	const map = await loadOrThrow(repository, mapId);
	const updated = domain.deleteStep(map, stepId);
	await repository.save(updated);
}

export async function deleteSlice(
	repository: StoryMapRepository,
	mapId: MapId,
	sliceId: SliceId
): Promise<void> {
	const map = await loadOrThrow(repository, mapId);
	const updated = domain.deleteSlice(map, sliceId);
	await repository.save(updated);
}

export async function deleteStory(
	repository: StoryMapRepository,
	mapId: MapId,
	storyId: StoryId
): Promise<void> {
	const map = await loadOrThrow(repository, mapId);
	const updated = domain.deleteStory(map, storyId);
	await repository.save(updated);
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
	mapId: MapId,
	storyId: StoryId,
	toStepId: StepId,
	toSliceId: SliceId | null,
	beforeId: string | null,
	afterId: string | null
): Promise<void> {
	const map = await loadOrThrow(repository, mapId);
	const updated = domain.moveStory(map, storyId, toStepId, toSliceId, beforeId, afterId);
	await repository.save(updated);
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
	mapId: MapId,
	stepId: StepId
): Promise<StorySuggestion[]> {
	const map = await loadOrThrow(repository, mapId);
	const step = domain.findStep(map, stepId);
	const activity = domain.findActivity(map, step.activityId);

	return aiAssistant.suggestStoriesForStep({
		stepName: step.name,
		activityName: activity.name,
		existingStoryTitles: map.stories.filter((s) => s.stepId === stepId).map((s) => s.title)
	});
}

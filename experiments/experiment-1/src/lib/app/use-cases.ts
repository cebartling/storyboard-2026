/**
 * Use-case functions: thin orchestration between the driving adapter
 * (`src/routes/`) and the domain core + outbound ports. See
 * documentation/architecture.md's layer diagram and `moveStory` trace.
 *
 * Each function here validates its input, calls into `src/lib/domain/`, and
 * calls the ports it needs — it holds no business rules of its own. The
 * board-editing use cases (add/rename/delete activities, steps, stories,
 * slices; move/reorder/slice a story) all follow the same shape: load the
 * aggregate, call the pure domain function, save, return whatever the
 * caller needs.
 */

import type { ActivityId, MapId, SliceId, StepId, StoryId } from '$lib/domain/ids';
import type { StoryMapRepository } from '$lib/domain/ports';
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
	const trimmed = name.trim();
	if (trimmed.length === 0) {
		throw new Error('Map name must not be empty');
	}
	const map = createStoryMap(trimmed);
	return repository.save(map);
}

export async function loadMap(repository: StoryMapRepository, id: MapId): Promise<StoryMap | null> {
	return repository.load(id);
}

async function loadOrThrow(repository: StoryMapRepository, id: MapId): Promise<StoryMap> {
	const map = await repository.load(id);
	if (!map) {
		throw new Error(`No story map with id ${id}`);
	}
	return map;
}

function requireNonEmpty(value: string, label: string): string {
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		throw new Error(`${label} must not be empty`);
	}
	return trimmed;
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
	const { map: updated, activity } = domain.addActivity(
		map,
		requireNonEmpty(name, 'Activity name')
	);
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
	const { map: updated, step } = domain.addStep(
		map,
		activityId,
		requireNonEmpty(name, 'Step name')
	);
	await repository.save(updated);
	return step;
}

export async function createSlice(
	repository: StoryMapRepository,
	mapId: MapId,
	name: string
): Promise<Slice> {
	const map = await loadOrThrow(repository, mapId);
	const { map: updated, slice } = domain.addSlice(map, requireNonEmpty(name, 'Slice name'));
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
	const { map: updated, story } = domain.addStory(
		map,
		stepId,
		requireNonEmpty(title, 'Story title'),
		options
	);
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
	const updated = domain.renameActivity(map, activityId, requireNonEmpty(name, 'Activity name'));
	await repository.save(updated);
}

export async function renameStep(
	repository: StoryMapRepository,
	mapId: MapId,
	stepId: StepId,
	name: string
): Promise<void> {
	const map = await loadOrThrow(repository, mapId);
	const updated = domain.renameStep(map, stepId, requireNonEmpty(name, 'Step name'));
	await repository.save(updated);
}

export async function renameSlice(
	repository: StoryMapRepository,
	mapId: MapId,
	sliceId: SliceId,
	name: string
): Promise<void> {
	const map = await loadOrThrow(repository, mapId);
	const updated = domain.renameSlice(map, sliceId, requireNonEmpty(name, 'Slice name'));
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
		changes.title !== undefined
			? { ...changes, title: requireNonEmpty(changes.title, 'Story title') }
			: changes;
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

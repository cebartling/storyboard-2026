/**
 * Use-case functions: thin orchestration between the driving adapter
 * (`src/routes/`) and the domain core + outbound ports. See
 * documentation/architecture.md's layer diagram and `moveStory` trace.
 *
 * Each function here validates its input, calls into `src/lib/domain/`, and
 * calls the ports it needs — it holds no business rules of its own. Only
 * the use cases step 6's map-CRUD slice needs are defined for now
 * (createMap, listMaps, loadMap); more are added as later steps need them.
 */

import type { MapId } from '$lib/domain/ids';
import type { StoryMapRepository } from '$lib/domain/ports';
import { createStoryMap, type StoryMap } from '$lib/domain/story-map';

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
	await repository.save(map);
	return map;
}

export async function loadMap(repository: StoryMapRepository, id: MapId): Promise<StoryMap | null> {
	return repository.load(id);
}

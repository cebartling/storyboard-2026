import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { deps } from '$lib/server/deps';
import { loadMap } from '$lib/app/use-cases';
import type { MapId, SliceId } from '$lib/domain/ids';
import { buildReleaseViewModel } from '$lib/board/release-view-model';
import { requireCaller } from '$lib/server/auth/require-caller';

/**
 * One slice's stories in dependency order (ADR 0023). Read-only: there are no
 * actions, so nothing here carries a version or publishes to the map's hub.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	const access = await loadMap(
		deps.storyMapRepository,
		requireCaller(locals),
		params.mapId as MapId
	);
	// 404 for a map that is not yours, as the board does (ADR 0015).
	if (!access) {
		error(404, `No story map with id ${params.mapId}`);
	}

	// Also covers a slice id from another map: the lookup is within this one.
	const release = buildReleaseViewModel(access.map, params.sliceId as SliceId);
	if (!release) {
		error(404, `No slice with id ${params.sliceId} in story map ${params.mapId}`);
	}

	return { mapId: access.map.id, mapName: access.map.name, release };
};

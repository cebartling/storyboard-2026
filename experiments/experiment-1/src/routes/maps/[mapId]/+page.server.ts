import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { deps } from '$lib/server/deps';
import { loadMap } from '$lib/app/use-cases';
import type { MapId } from '$lib/domain/ids';

export const load: PageServerLoad = async ({ params }) => {
	const map = await loadMap(deps.storyMapRepository, params.mapId as MapId);
	if (!map) {
		error(404, `No story map with id ${params.mapId}`);
	}

	// Serialize a view model for the board: activities carry their steps, and
	// each step carries its stories split by slice — an "unsliced" bucket
	// plus one bucket per slice, all in rank order (see domain-model.md's
	// worked examples for what the (step, slice) scoping means).
	const board = {
		id: map.id,
		name: map.name,
		slices: map.slices,
		activities: map.activities.map((activity) => ({
			id: activity.id,
			name: activity.name,
			steps: activity.steps.map((step) => ({
				id: step.id,
				name: step.name,
				unslicedStories: map.stories.filter((s) => s.stepId === step.id && s.sliceId === null),
				storiesBySlice: map.slices.map((slice) => ({
					sliceId: slice.id,
					stories: map.stories.filter((s) => s.stepId === step.id && s.sliceId === slice.id)
				}))
			}))
		}))
	};

	return { board };
};

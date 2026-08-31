import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { deps } from '$lib/server/deps';
import {
	addActivity,
	addStep,
	addStory,
	createSlice,
	deleteActivity,
	deleteSlice,
	deleteStep,
	deleteStory,
	loadMap,
	moveStory,
	renameActivity,
	renameSlice,
	renameStep
} from '$lib/app/use-cases';
import type { ActivityId, MapId, SliceId, StepId, StoryId } from '$lib/domain/ids';
import { InvariantError } from '$lib/domain/errors';

import { buildBoardViewModel } from './board-view-model';
import { runAction } from './run-action';

export const load: PageServerLoad = async ({ params }) => {
	const map = await loadMap(deps.storyMapRepository, params.mapId as MapId);
	if (!map) {
		error(404, `No story map with id ${params.mapId}`);
	}

	return { board: buildBoardViewModel(map) };
};

function requireString(value: FormDataEntryValue | null, field: string): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new InvariantError(`${field} is required.`);
	}
	// Trim what we return, not just what we validate: id fields flow straight
	// into a domain lookup, where stray whitespace surfaces as a confusing
	// "not found" instead of being normalised.
	return value.trim();
}

/** Empty string means "no neighbour on this side" (start/end of scope). */
function optionalNeighbour(value: FormDataEntryValue | null): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

export const actions: Actions = {
	addActivity: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('addActivity', async () => {
			const name = requireString(form.get('name'), 'Activity name');
			await addActivity(deps.storyMapRepository, params.mapId as MapId, name);
		});
	},

	renameActivity: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('renameActivity', async () => {
			const activityId = requireString(form.get('activityId'), 'activityId') as ActivityId;
			const name = requireString(form.get('name'), 'Activity name');
			await renameActivity(deps.storyMapRepository, params.mapId as MapId, activityId, name);
		});
	},

	deleteActivity: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('deleteActivity', async () => {
			const activityId = requireString(form.get('activityId'), 'activityId') as ActivityId;
			await deleteActivity(deps.storyMapRepository, params.mapId as MapId, activityId);
		});
	},

	addStep: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('addStep', async () => {
			const activityId = requireString(form.get('activityId'), 'activityId') as ActivityId;
			const name = requireString(form.get('name'), 'Step name');
			await addStep(deps.storyMapRepository, params.mapId as MapId, activityId, name);
		});
	},

	renameStep: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('renameStep', async () => {
			const stepId = requireString(form.get('stepId'), 'stepId') as StepId;
			const name = requireString(form.get('name'), 'Step name');
			await renameStep(deps.storyMapRepository, params.mapId as MapId, stepId, name);
		});
	},

	deleteStep: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('deleteStep', async () => {
			const stepId = requireString(form.get('stepId'), 'stepId') as StepId;
			await deleteStep(deps.storyMapRepository, params.mapId as MapId, stepId);
		});
	},

	createSlice: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('createSlice', async () => {
			const name = requireString(form.get('name'), 'Slice name');
			await createSlice(deps.storyMapRepository, params.mapId as MapId, name);
		});
	},

	renameSlice: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('renameSlice', async () => {
			const sliceId = requireString(form.get('sliceId'), 'sliceId') as SliceId;
			const name = requireString(form.get('name'), 'Slice name');
			await renameSlice(deps.storyMapRepository, params.mapId as MapId, sliceId, name);
		});
	},

	deleteSlice: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('deleteSlice', async () => {
			const sliceId = requireString(form.get('sliceId'), 'sliceId') as SliceId;
			await deleteSlice(deps.storyMapRepository, params.mapId as MapId, sliceId);
		});
	},

	addStory: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('addStory', async () => {
			const stepId = requireString(form.get('stepId'), 'stepId') as StepId;
			const title = requireString(form.get('title'), 'Story title');
			const sliceIdRaw = form.get('sliceId');
			const sliceId =
				typeof sliceIdRaw === 'string' && sliceIdRaw.length > 0 ? (sliceIdRaw as SliceId) : null;
			await addStory(deps.storyMapRepository, params.mapId as MapId, stepId, title, { sliceId });
		});
	},

	deleteStory: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('deleteStory', async () => {
			const storyId = requireString(form.get('storyId'), 'storyId') as StoryId;
			await deleteStory(deps.storyMapRepository, params.mapId as MapId, storyId);
		});
	},

	moveStory: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('moveStory', async () => {
			const storyId = requireString(form.get('storyId'), 'storyId') as StoryId;
			const stepId = requireString(form.get('stepId'), 'stepId') as StepId;
			const sliceIdRaw = form.get('sliceId');
			const sliceId =
				typeof sliceIdRaw === 'string' && sliceIdRaw.length > 0 ? (sliceIdRaw as SliceId) : null;
			const beforeId = optionalNeighbour(form.get('beforeId'));
			const afterId = optionalNeighbour(form.get('afterId'));
			await moveStory(
				deps.storyMapRepository,
				params.mapId as MapId,
				storyId,
				stepId,
				sliceId,
				beforeId,
				afterId
			);
		});
	}
};

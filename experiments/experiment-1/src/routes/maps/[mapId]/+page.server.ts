import { error, fail } from '@sveltejs/kit';
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

import { buildBoardViewModel } from './board-view-model';

export const load: PageServerLoad = async ({ params }) => {
	const map = await loadMap(deps.storyMapRepository, params.mapId as MapId);
	if (!map) {
		error(404, `No story map with id ${params.mapId}`);
	}

	return { board: buildBoardViewModel(map) };
};

function requireString(value: FormDataEntryValue | null, field: string): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(`${field} is required.`);
	}
	return value;
}

/** Empty string means "no neighbour on this side" (start/end of scope). */
function optionalNeighbour(value: FormDataEntryValue | null): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

export const actions: Actions = {
	addActivity: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const name = requireString(form.get('name'), 'Activity name');
			await addActivity(deps.storyMapRepository, params.mapId as MapId, name);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to add activity' });
		}
	},

	renameActivity: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const activityId = requireString(form.get('activityId'), 'activityId') as ActivityId;
			const name = requireString(form.get('name'), 'Activity name');
			await renameActivity(deps.storyMapRepository, params.mapId as MapId, activityId, name);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to rename activity' });
		}
	},

	deleteActivity: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const activityId = requireString(form.get('activityId'), 'activityId') as ActivityId;
			await deleteActivity(deps.storyMapRepository, params.mapId as MapId, activityId);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to delete activity' });
		}
	},

	addStep: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const activityId = requireString(form.get('activityId'), 'activityId') as ActivityId;
			const name = requireString(form.get('name'), 'Step name');
			await addStep(deps.storyMapRepository, params.mapId as MapId, activityId, name);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to add step' });
		}
	},

	renameStep: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const stepId = requireString(form.get('stepId'), 'stepId') as StepId;
			const name = requireString(form.get('name'), 'Step name');
			await renameStep(deps.storyMapRepository, params.mapId as MapId, stepId, name);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to rename step' });
		}
	},

	deleteStep: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const stepId = requireString(form.get('stepId'), 'stepId') as StepId;
			await deleteStep(deps.storyMapRepository, params.mapId as MapId, stepId);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to delete step' });
		}
	},

	createSlice: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const name = requireString(form.get('name'), 'Slice name');
			await createSlice(deps.storyMapRepository, params.mapId as MapId, name);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to add slice' });
		}
	},

	renameSlice: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const sliceId = requireString(form.get('sliceId'), 'sliceId') as SliceId;
			const name = requireString(form.get('name'), 'Slice name');
			await renameSlice(deps.storyMapRepository, params.mapId as MapId, sliceId, name);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to rename slice' });
		}
	},

	deleteSlice: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const sliceId = requireString(form.get('sliceId'), 'sliceId') as SliceId;
			await deleteSlice(deps.storyMapRepository, params.mapId as MapId, sliceId);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to delete slice' });
		}
	},

	addStory: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const stepId = requireString(form.get('stepId'), 'stepId') as StepId;
			const title = requireString(form.get('title'), 'Story title');
			const sliceIdRaw = form.get('sliceId');
			const sliceId =
				typeof sliceIdRaw === 'string' && sliceIdRaw.length > 0 ? (sliceIdRaw as SliceId) : null;
			await addStory(deps.storyMapRepository, params.mapId as MapId, stepId, title, { sliceId });
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to add story' });
		}
	},

	deleteStory: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const storyId = requireString(form.get('storyId'), 'storyId') as StoryId;
			await deleteStory(deps.storyMapRepository, params.mapId as MapId, storyId);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to delete story' });
		}
	},

	moveStory: async ({ request, params }) => {
		const form = await request.formData();
		try {
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
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to move story' });
		}
	}
};

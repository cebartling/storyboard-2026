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
	editStory,
	loadMap,
	moveStory,
	renameActivity,
	renameSlice,
	renameStep
} from '$lib/app/use-cases';
import type { ActivityId, MapId, SliceId, StepId, StoryId } from '$lib/domain/ids';

import { buildBoardViewModel } from '$lib/board/board-view-model';
import { optionalNeighbour, requireString, requireVersion } from './form-fields';
import { runAction } from '../../run-action';

export const load: PageServerLoad = async ({ params }) => {
	const map = await loadMap(deps.storyMapRepository, params.mapId as MapId);
	if (!map) {
		error(404, `No story map with id ${params.mapId}`);
	}

	return { board: buildBoardViewModel(map) };
};

export const actions: Actions = {
	addActivity: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('addActivity', async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const name = requireString(form.get('name'), 'Activity name');
			await addActivity(deps.storyMapRepository, params.mapId as MapId, expectedVersion, name);
		});
	},

	renameActivity: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('renameActivity', async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const activityId = requireString(form.get('activityId'), 'activityId') as ActivityId;
			const name = requireString(form.get('name'), 'Activity name');
			await renameActivity(
				deps.storyMapRepository,
				params.mapId as MapId,
				expectedVersion,
				activityId,
				name
			);
		});
	},

	deleteActivity: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('deleteActivity', async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const activityId = requireString(form.get('activityId'), 'activityId') as ActivityId;
			await deleteActivity(
				deps.storyMapRepository,
				params.mapId as MapId,
				expectedVersion,
				activityId
			);
		});
	},

	addStep: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('addStep', async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const activityId = requireString(form.get('activityId'), 'activityId') as ActivityId;
			const name = requireString(form.get('name'), 'Step name');
			await addStep(
				deps.storyMapRepository,
				params.mapId as MapId,
				expectedVersion,
				activityId,
				name
			);
		});
	},

	renameStep: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('renameStep', async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const stepId = requireString(form.get('stepId'), 'stepId') as StepId;
			const name = requireString(form.get('name'), 'Step name');
			await renameStep(
				deps.storyMapRepository,
				params.mapId as MapId,
				expectedVersion,
				stepId,
				name
			);
		});
	},

	deleteStep: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('deleteStep', async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const stepId = requireString(form.get('stepId'), 'stepId') as StepId;
			await deleteStep(deps.storyMapRepository, params.mapId as MapId, expectedVersion, stepId);
		});
	},

	createSlice: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('createSlice', async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const name = requireString(form.get('name'), 'Slice name');
			await createSlice(deps.storyMapRepository, params.mapId as MapId, expectedVersion, name);
		});
	},

	renameSlice: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('renameSlice', async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const sliceId = requireString(form.get('sliceId'), 'sliceId') as SliceId;
			const name = requireString(form.get('name'), 'Slice name');
			await renameSlice(
				deps.storyMapRepository,
				params.mapId as MapId,
				expectedVersion,
				sliceId,
				name
			);
		});
	},

	deleteSlice: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('deleteSlice', async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const sliceId = requireString(form.get('sliceId'), 'sliceId') as SliceId;
			await deleteSlice(deps.storyMapRepository, params.mapId as MapId, expectedVersion, sliceId);
		});
	},

	addStory: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('addStory', async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const stepId = requireString(form.get('stepId'), 'stepId') as StepId;
			const title = requireString(form.get('title'), 'Story title');
			const sliceIdRaw = form.get('sliceId');
			const sliceId =
				typeof sliceIdRaw === 'string' && sliceIdRaw.length > 0 ? (sliceIdRaw as SliceId) : null;
			await addStory(
				deps.storyMapRepository,
				params.mapId as MapId,
				expectedVersion,
				stepId,
				title,
				{ sliceId }
			);
		});
	},

	editStory: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('editStory', async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const storyId = requireString(form.get('storyId'), 'storyId') as StoryId;
			const title = requireString(form.get('title'), 'Story title');
			// A description is optional, and clearing it is a real edit: an
			// empty textarea must write `null`, not leave the old text in
			// place. `undefined` would mean "don't touch it" to the domain.
			const descriptionRaw = form.get('description');
			const description =
				typeof descriptionRaw === 'string' && descriptionRaw.trim().length > 0
					? descriptionRaw.trim()
					: null;
			await editStory(deps.storyMapRepository, params.mapId as MapId, expectedVersion, storyId, {
				title,
				description
			});
		});
	},

	deleteStory: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('deleteStory', async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const storyId = requireString(form.get('storyId'), 'storyId') as StoryId;
			await deleteStory(deps.storyMapRepository, params.mapId as MapId, expectedVersion, storyId);
		});
	},

	moveStory: async ({ request, params }) => {
		const form = await request.formData();
		return runAction('moveStory', async () => {
			const expectedVersion = requireVersion(form.get('version'));
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
				expectedVersion,
				storyId,
				stepId,
				sliceId,
				beforeId,
				afterId
			);
		});
	}
};

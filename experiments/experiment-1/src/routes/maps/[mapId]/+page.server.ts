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
	renameStep,
	shareMap
} from '$lib/app/use-cases';
import type { ActivityId, MapId, SliceId, StepId, StoryId } from '$lib/domain/ids';

import { buildBoardViewModel } from '$lib/board/board-view-model';
import { optionalNeighbour, requireString, requireVersion } from './form-fields';
import { InvariantError } from '$lib/domain/errors';
import { requireCaller } from '$lib/server/auth/require-caller';
import { runAction } from '../../run-action';

export const load: PageServerLoad = async ({ params, locals }) => {
	const access = await loadMap(
		deps.storyMapRepository,
		requireCaller(locals),
		params.mapId as MapId
	);
	// 404, not 403: `load` returns null for a map that is not yours exactly as
	// for one that does not exist, so an outsider cannot probe for map ids.
	if (!access) {
		error(404, `No story map with id ${params.mapId}`);
	}

	// The role travels beside the board rather than inside the view model: it is
	// a fact about the viewer, not about the map.
	return { board: buildBoardViewModel(access.map), role: access.role };
};

export const actions: Actions = {
	addActivity: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAction('addActivity', async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const name = requireString(form.get('name'), 'Activity name');
			await addActivity(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				name
			);
		});
	},

	renameActivity: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAction('renameActivity', async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const activityId = requireString(form.get('activityId'), 'activityId') as ActivityId;
			const name = requireString(form.get('name'), 'Activity name');
			await renameActivity(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				activityId,
				name
			);
		});
	},

	deleteActivity: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAction('deleteActivity', async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const activityId = requireString(form.get('activityId'), 'activityId') as ActivityId;
			await deleteActivity(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				activityId
			);
		});
	},

	addStep: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAction('addStep', async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const activityId = requireString(form.get('activityId'), 'activityId') as ActivityId;
			const name = requireString(form.get('name'), 'Step name');
			await addStep(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				activityId,
				name
			);
		});
	},

	renameStep: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAction('renameStep', async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const stepId = requireString(form.get('stepId'), 'stepId') as StepId;
			const name = requireString(form.get('name'), 'Step name');
			await renameStep(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				stepId,
				name
			);
		});
	},

	deleteStep: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAction('deleteStep', async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const stepId = requireString(form.get('stepId'), 'stepId') as StepId;
			await deleteStep(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				stepId
			);
		});
	},

	createSlice: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAction('createSlice', async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const name = requireString(form.get('name'), 'Slice name');
			await createSlice(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				name
			);
		});
	},

	renameSlice: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAction('renameSlice', async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const sliceId = requireString(form.get('sliceId'), 'sliceId') as SliceId;
			const name = requireString(form.get('name'), 'Slice name');
			await renameSlice(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				sliceId,
				name
			);
		});
	},

	deleteSlice: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAction('deleteSlice', async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const sliceId = requireString(form.get('sliceId'), 'sliceId') as SliceId;
			await deleteSlice(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				sliceId
			);
		});
	},

	addStory: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
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
				caller,
				params.mapId as MapId,
				expectedVersion,
				stepId,
				title,
				{ sliceId }
			);
		});
	},

	editStory: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
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
			await editStory(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				storyId,
				{
					title,
					description
				}
			);
		});
	},

	deleteStory: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAction('deleteStory', async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const storyId = requireString(form.get('storyId'), 'storyId') as StoryId;
			await deleteStory(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				storyId
			);
		});
	},

	moveStory: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
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
				caller,
				params.mapId as MapId,
				expectedVersion,
				storyId,
				stepId,
				sliceId,
				beforeId,
				afterId
			);
		});
	},

	/**
	 * Share by email address rather than by user id: an id is not something a
	 * person has, and asking for one would mean exposing a directory. Owner-only,
	 * which the repository enforces — this route does not re-check it (ADR 0016).
	 */
	shareMap: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAction('shareMap', async () => {
			const email = requireString(form.get('email'), 'Email address');
			const invitee = deps.auth.findUserByEmail(email);
			if (!invitee) {
				// Named plainly: this is a map the caller already owns, and the
				// address is one they typed, so there is nothing to leak by saying
				// that nobody has registered it.
				throw new InvariantError(`No account for ${email}. They need to register first.`);
			}
			if (invitee.id === caller.userId) {
				throw new InvariantError('You already own this map.');
			}
			await shareMap(deps.storyMapRepository, caller, params.mapId as MapId, invitee.id);
		});
	}
};

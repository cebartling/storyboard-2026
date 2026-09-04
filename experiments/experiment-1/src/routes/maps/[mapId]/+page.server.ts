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

/**
 * Runs a board mutation and, if it succeeded, tells everyone watching the map
 * (ADR 0015 §5).
 *
 * The broadcast lives here rather than in the use case because publishing from
 * the app layer would need a third outbound port, which ADR 0006 forbids. The
 * new sequence is `expectedVersion + 1` exactly: the write ran under the per-map
 * lock against that version, and `save()` increments by one.
 *
 * The notification carries no payload — clients react by refetching, which is
 * the sync path this codebase already has the most confidence in.
 */
async function runAndPublish(
	label: string,
	mapId: MapId,
	// Returns the version it was called with, so that parsing the field stays
	// inside `runAction`'s error handling — hoisting it out would turn a
	// malformed request into a 500 instead of a 400.
	body: () => Promise<number>
) {
	let expectedVersion: number | null = null;
	const failure = await runAction(label, async () => {
		expectedVersion = await body();
	});
	if (!failure && expectedVersion !== null) {
		deps.collab.hubFor(mapId).publishChange(expectedVersion + 1);
	}
	return failure;
}

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
		return runAndPublish('addActivity', params.mapId as MapId, async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const name = requireString(form.get('name'), 'Activity name');
			await addActivity(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				name
			);
			return expectedVersion;
		});
	},

	renameActivity: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAndPublish('renameActivity', params.mapId as MapId, async () => {
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
			return expectedVersion;
		});
	},

	deleteActivity: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAndPublish('deleteActivity', params.mapId as MapId, async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const activityId = requireString(form.get('activityId'), 'activityId') as ActivityId;
			await deleteActivity(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				activityId
			);
			return expectedVersion;
		});
	},

	addStep: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAndPublish('addStep', params.mapId as MapId, async () => {
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
			return expectedVersion;
		});
	},

	renameStep: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAndPublish('renameStep', params.mapId as MapId, async () => {
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
			return expectedVersion;
		});
	},

	deleteStep: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAndPublish('deleteStep', params.mapId as MapId, async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const stepId = requireString(form.get('stepId'), 'stepId') as StepId;
			await deleteStep(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				stepId
			);
			return expectedVersion;
		});
	},

	createSlice: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAndPublish('createSlice', params.mapId as MapId, async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const name = requireString(form.get('name'), 'Slice name');
			await createSlice(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				name
			);
			return expectedVersion;
		});
	},

	renameSlice: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAndPublish('renameSlice', params.mapId as MapId, async () => {
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
			return expectedVersion;
		});
	},

	deleteSlice: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAndPublish('deleteSlice', params.mapId as MapId, async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const sliceId = requireString(form.get('sliceId'), 'sliceId') as SliceId;
			await deleteSlice(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				sliceId
			);
			return expectedVersion;
		});
	},

	addStory: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAndPublish('addStory', params.mapId as MapId, async () => {
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
			return expectedVersion;
		});
	},

	editStory: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAndPublish('editStory', params.mapId as MapId, async () => {
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
			return expectedVersion;
		});
	},

	deleteStory: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAndPublish('deleteStory', params.mapId as MapId, async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const storyId = requireString(form.get('storyId'), 'storyId') as StoryId;
			await deleteStory(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				storyId
			);
			return expectedVersion;
		});
	},

	moveStory: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAndPublish('moveStory', params.mapId as MapId, async () => {
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
			return expectedVersion;
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

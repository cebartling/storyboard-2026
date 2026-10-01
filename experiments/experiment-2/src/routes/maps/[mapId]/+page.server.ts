import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { deps } from '$lib/server/deps';
import {
	addAcceptanceCriterion,
	addActivity,
	addDependency,
	addGlossaryEntry,
	addStep,
	addStory,
	createSlice,
	deleteActivity,
	deleteSlice,
	deleteStep,
	deleteStory,
	editAcceptanceCriterion,
	editStory,
	loadMap,
	moveAcceptanceCriterion,
	moveStory,
	renameActivity,
	renameSlice,
	removeAcceptanceCriterion,
	removeDependency,
	setAcceptanceCriterionSatisfied,
	renameStep,
	shareMap
} from '$lib/app/use-cases';
import type {
	AcceptanceCriterionId,
	ActivityId,
	GlossaryEntryId,
	MapId,
	SliceId,
	StepId,
	StoryId
} from '$lib/domain/ids';

import { buildBoardViewModel } from '$lib/board/board-view-model';
import {
	optionalNeighbour,
	requireBoolean,
	requireDirection,
	requireStatus,
	requireString,
	requireVersion
} from './form-fields';
import { InvariantError } from '$lib/domain/errors';
import { requireCaller } from '$lib/server/auth/require-caller';
import { runAction } from '../../run-action';
import { runAndPublish } from './run-and-publish';

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
		return runAndPublish('addActivity', params.mapId as MapId, form, async () => {
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
		return runAndPublish('renameActivity', params.mapId as MapId, form, async () => {
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
		return runAndPublish('deleteActivity', params.mapId as MapId, form, async () => {
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
		return runAndPublish('addStep', params.mapId as MapId, form, async () => {
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
		return runAndPublish('renameStep', params.mapId as MapId, form, async () => {
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
		return runAndPublish('deleteStep', params.mapId as MapId, form, async () => {
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
		return runAndPublish('createSlice', params.mapId as MapId, form, async () => {
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
		return runAndPublish('renameSlice', params.mapId as MapId, form, async () => {
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
		return runAndPublish('deleteSlice', params.mapId as MapId, form, async () => {
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
		return runAndPublish('addStory', params.mapId as MapId, form, async () => {
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
		return runAndPublish('editStory', params.mapId as MapId, form, async () => {
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
			// Required, not optional: the dialog's <select> always has a value, so
			// a missing one is a malformed request rather than "leave it alone".
			const status = requireStatus(form.get('status'));
			await editStory(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				storyId,
				{
					title,
					description,
					status
				}
			);
			return expectedVersion;
		});
	},

	addDependency: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAndPublish('addDependency', params.mapId as MapId, form, async () => {
			const expectedVersion = requireVersion(form.get('version'));
			// The dialog posts "this story", "the other one" and which way round,
			// rather than a pre-oriented pair: that is the shape the radio group
			// produces, and it keeps the orientation rule on the server.
			const storyId = requireString(form.get('storyId'), 'storyId') as StoryId;
			const otherId = requireString(form.get('otherId'), 'otherId') as StoryId;
			const [blockerId, blockedId] =
				requireDirection(form.get('direction')) === 'blocks'
					? [storyId, otherId]
					: [otherId, storyId];
			await addDependency(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				blockerId,
				blockedId
			);
			return expectedVersion;
		});
	},

	removeDependency: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAndPublish('removeDependency', params.mapId as MapId, form, async () => {
			const expectedVersion = requireVersion(form.get('version'));
			// Already oriented, unlike the add: the row being removed renders from
			// a resolved edge, so there is no direction left to interpret.
			const blockerId = requireString(form.get('blockerId'), 'blockerId') as StoryId;
			const blockedId = requireString(form.get('blockedId'), 'blockedId') as StoryId;
			await removeDependency(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				blockerId,
				blockedId
			);
			return expectedVersion;
		});
	},

	addAcceptanceCriterion: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAndPublish('addAcceptanceCriterion', params.mapId as MapId, form, async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const storyId = requireString(form.get('storyId'), 'storyId') as StoryId;
			const text = requireString(form.get('text'), 'Acceptance criterion');
			await addAcceptanceCriterion(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				storyId,
				text
			);
			return expectedVersion;
		});
	},

	editAcceptanceCriterion: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAndPublish('editAcceptanceCriterion', params.mapId as MapId, form, async () => {
			const expectedVersion = requireVersion(form.get('version'));
			// Both ids: the criterion is looked up inside the story rather than
			// across the map, which is what rejects an id borrowed from another
			// story instead of quietly finding it (ADR 0024).
			const storyId = requireString(form.get('storyId'), 'storyId') as StoryId;
			const criterionId = requireString(
				form.get('criterionId'),
				'criterionId'
			) as AcceptanceCriterionId;
			const text = requireString(form.get('text'), 'Acceptance criterion');
			await editAcceptanceCriterion(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				storyId,
				criterionId,
				text
			);
			return expectedVersion;
		});
	},

	setAcceptanceCriterionSatisfied: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAndPublish(
			'setAcceptanceCriterionSatisfied',
			params.mapId as MapId,
			form,
			async () => {
				const expectedVersion = requireVersion(form.get('version'));
				const storyId = requireString(form.get('storyId'), 'storyId') as StoryId;
				const criterionId = requireString(
					form.get('criterionId'),
					'criterionId'
				) as AcceptanceCriterionId;
				// The intended next value, posted in a hidden field. Not read off a
				// checkbox's own presence: an unchecked box posts nothing, so that
				// shape cannot express "untick this" at all (see `requireBoolean`).
				const satisfied = requireBoolean(form.get('satisfied'), 'Satisfied');
				await setAcceptanceCriterionSatisfied(
					deps.storyMapRepository,
					caller,
					params.mapId as MapId,
					expectedVersion,
					storyId,
					criterionId,
					satisfied
				);
				return expectedVersion;
			}
		);
	},

	removeAcceptanceCriterion: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAndPublish('removeAcceptanceCriterion', params.mapId as MapId, form, async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const storyId = requireString(form.get('storyId'), 'storyId') as StoryId;
			const criterionId = requireString(
				form.get('criterionId'),
				'criterionId'
			) as AcceptanceCriterionId;
			await removeAcceptanceCriterion(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				storyId,
				criterionId
			);
			return expectedVersion;
		});
	},

	moveAcceptanceCriterion: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAndPublish('moveAcceptanceCriterion', params.mapId as MapId, form, async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const storyId = requireString(form.get('storyId'), 'storyId') as StoryId;
			const criterionId = requireString(
				form.get('criterionId'),
				'criterionId'
			) as AcceptanceCriterionId;
			// Neighbour ids, never a rank: the server derives the rank (ADR 0005).
			await moveAcceptanceCriterion(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				storyId,
				criterionId,
				optionalNeighbour(form.get('beforeId')),
				optionalNeighbour(form.get('afterId'))
			);
			return expectedVersion;
		});
	},

	deleteStory: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAndPublish('deleteStory', params.mapId as MapId, form, async () => {
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
		return runAndPublish('moveStory', params.mapId as MapId, form, async () => {
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
	 * Adds a glossary entry from the story editor (ADR 0025) and returns its id,
	 * so the editor can link the selected phrase to it without a second request.
	 * The glossary page has its own copy of this action; this one exists because
	 * the board's editor posts to the board's route, and its response has to
	 * carry the new id back.
	 */
	addGlossaryEntry: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		let entryId: GlossaryEntryId | null = null;
		const failure = await runAndPublish(
			'addGlossaryEntry',
			params.mapId as MapId,
			form,
			async () => {
				const expectedVersion = requireVersion(form.get('version'));
				const term = requireString(form.get('term'), 'Term');
				const definition = requireString(form.get('definition'), 'Definition');
				const entry = await addGlossaryEntry(
					deps.storyMapRepository,
					caller,
					params.mapId as MapId,
					expectedVersion,
					term,
					definition
				);
				entryId = entry.id;
				return expectedVersion;
			}
		);
		return failure ?? { entryId };
	},

	/**
	 * Share by email address rather than by user id: an id is not something a
	 * person has, and asking for one would mean exposing a directory. Owner-only,
	 * which the repository enforces — this route does not re-check it (ADR 0015).
	 */
	shareMap: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAction('shareMap', async () => {
			const email = requireString(form.get('email'), 'Email address');
			const invitee = await deps.auth.findUserByEmail(email);
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

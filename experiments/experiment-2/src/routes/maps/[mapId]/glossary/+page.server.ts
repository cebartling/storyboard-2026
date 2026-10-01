import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { deps } from '$lib/server/deps';
import {
	addGlossaryEntry,
	deleteGlossaryEntry,
	editGlossaryEntry,
	loadMap
} from '$lib/app/use-cases';
import type { GlossaryEntryId, MapId } from '$lib/domain/ids';
import { sortByTerm } from '$lib/glossary/glossary-list';
import { requireCaller } from '$lib/server/auth/require-caller';
import { requireString, requireVersion } from '../form-fields';
import { runAndPublish } from '../run-and-publish';

/**
 * The map's glossary (ADR 0025): every entry, sorted by term, with the actions
 * that add, edit and delete them. Owners and editors alike may write, as on the
 * board — the repository enforces membership, so a non-member never gets here.
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

	return {
		mapId: access.map.id,
		mapName: access.map.name,
		version: access.map.version,
		entries: sortByTerm(access.map.glossary)
	};
};

export const actions: Actions = {
	addGlossaryEntry: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAndPublish('addGlossaryEntry', params.mapId as MapId, form, async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const term = requireString(form.get('term'), 'Term');
			const definition = requireString(form.get('definition'), 'Definition');
			await addGlossaryEntry(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				term,
				definition
			);
			return expectedVersion;
		});
	},

	editGlossaryEntry: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAndPublish('editGlossaryEntry', params.mapId as MapId, form, async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const entryId = requireString(form.get('entryId'), 'entryId') as GlossaryEntryId;
			// Both fields every time: the edit form always shows both, so a missing
			// one is a malformed request rather than "leave it as it was".
			const term = requireString(form.get('term'), 'Term');
			const definition = requireString(form.get('definition'), 'Definition');
			await editGlossaryEntry(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				entryId,
				{ term, definition }
			);
			return expectedVersion;
		});
	},

	deleteGlossaryEntry: async ({ request, params, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		return runAndPublish('deleteGlossaryEntry', params.mapId as MapId, form, async () => {
			const expectedVersion = requireVersion(form.get('version'));
			const entryId = requireString(form.get('entryId'), 'entryId') as GlossaryEntryId;
			await deleteGlossaryEntry(
				deps.storyMapRepository,
				caller,
				params.mapId as MapId,
				expectedVersion,
				entryId
			);
			return expectedVersion;
		});
	}
};

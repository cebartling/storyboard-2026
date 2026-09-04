import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { deps } from '$lib/server/deps';
import { requireCaller } from '$lib/server/auth/require-caller';
import type { MapId } from '$lib/domain/ids';
import { InvariantError } from '$lib/domain/errors';
import { createMap, deleteMap, listMaps } from '$lib/app/use-cases';
import { runAction } from './run-action';

export const load: PageServerLoad = async ({ locals }) => {
	// Only the caller's own maps: `listSummaries` used to return every map in
	// the database (ADR 0006, finding A10).
	const maps = await listMaps(deps.storyMapRepository, requireCaller(locals));
	return { maps };
};

export const actions: Actions = {
	createMap: async ({ request, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();
		let map;

		const failure = await runAction('createMap', async () => {
			const name = form.get('name');
			if (typeof name !== 'string' || name.trim().length === 0) {
				throw new InvariantError('Map name is required.');
			}
			map = await createMap(deps.storyMapRepository, caller, name);
		});
		if (failure) return failure;

		redirect(303, `/maps/${map!.id}`);
	},

	deleteMap: async ({ request, locals }) => {
		const caller = requireCaller(locals);
		const form = await request.formData();

		const failure = await runAction('deleteMap', async () => {
			const mapId = form.get('mapId');
			if (typeof mapId !== 'string' || mapId.length === 0) {
				throw new InvariantError('Map id is required.');
			}
			await deleteMap(deps.storyMapRepository, caller, mapId as MapId);
		});
		if (failure) return failure;

		// No redirect: the list is already the page we are on, and `use:enhance`
		// refetches it.
		return { success: true };
	}
};

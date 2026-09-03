import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { deps } from '$lib/server/deps';
import type { MapId } from '$lib/domain/ids';
import { createMap, deleteMap, listMaps } from '$lib/app/use-cases';

export const load: PageServerLoad = async () => {
	const maps = await listMaps(deps.storyMapRepository);
	return { maps };
};

export const actions: Actions = {
	createMap: async ({ request }) => {
		const form = await request.formData();
		const name = form.get('name');

		if (typeof name !== 'string' || name.trim().length === 0) {
			return fail(400, { error: 'Map name is required.' });
		}

		const map = await createMap(deps.storyMapRepository, name);
		redirect(303, `/maps/${map.id}`);
	},

	deleteMap: async ({ request }) => {
		const form = await request.formData();
		const mapId = form.get('mapId');

		if (typeof mapId !== 'string' || mapId.length === 0) {
			return fail(400, { error: 'Map id is required.' });
		}

		await deleteMap(deps.storyMapRepository, mapId as MapId);
		// No redirect: the list is already the page we are on, and `use:enhance`
		// refetches it.
		return { success: true };
	}
};

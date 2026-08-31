import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { deps } from '$lib/server/deps';
import { createMap, listMaps } from '$lib/app/use-cases';

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
	}
};

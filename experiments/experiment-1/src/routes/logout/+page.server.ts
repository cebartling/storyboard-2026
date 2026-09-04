import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { deps } from '$lib/server/deps';
import { SESSION_COOKIE, clearSessionCookie } from '$lib/server/auth/session-cookie';

// No page: this route exists only to receive the header's POST. A GET would
// make logout reachable by link, which prefetchers and <img> tags can follow.
export const actions: Actions = {
	default: async ({ cookies }) => {
		const token = cookies.get(SESSION_COOKIE);
		if (token) deps.auth.logout(token);
		clearSessionCookie(cookies);
		redirect(303, '/login');
	}
};

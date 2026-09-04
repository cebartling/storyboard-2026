import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { InvariantError } from '$lib/domain/errors';
import { deps } from '$lib/server/deps';
import { setSessionCookie } from '$lib/server/auth/session-cookie';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(303, '/');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '');
		const displayName = String(form.get('displayName') ?? '');
		const password = String(form.get('password') ?? '');

		let user;
		try {
			user = await deps.auth.register(email, displayName, password);
		} catch (e) {
			// Registration's InvariantErrors are written for the person filling in
			// the form ("Use a password of at least 8 characters"), so they are the
			// message rather than something to translate.
			if (e instanceof InvariantError) {
				return fail(400, { error: e.message, email, displayName });
			}
			throw e;
		}

		// Registering signs you in: bouncing a new account to a login form to
		// retype what they just typed serves nobody.
		const session = deps.auth.createSession(user.id);
		setSessionCookie(cookies, session.token, session.expiresAt);
		redirect(303, '/');
	}
};

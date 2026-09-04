import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { deps } from '$lib/server/deps';
import { setSessionCookie } from '$lib/server/auth/session-cookie';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(303, '/');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const email = form.get('email');
		const password = form.get('password');

		if (typeof email !== 'string' || typeof password !== 'string') {
			return fail(400, {
				error: 'Enter your email address and password.',
				email: typeof email === 'string' ? email : ''
			});
		}

		const result = await deps.auth.login(email, password);
		if (!result) {
			// One message for "no such account" and "wrong password" alike, so this
			// form cannot be used to discover which addresses are registered.
			return fail(400, { error: 'Email or password is incorrect.', email });
		}

		setSessionCookie(cookies, result.session.token, result.session.expiresAt);
		redirect(303, '/');
	}
};

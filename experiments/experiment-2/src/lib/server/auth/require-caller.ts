import { redirect } from '@sveltejs/kit';
import type { Caller } from '$lib/domain/ports';

/**
 * The **only** place a `Caller` is constructed (ADR 0015).
 *
 * That is the mechanism, not a convention: ADR 0014 §6 insists the presence
 * identity must never become the authentication identity, and funnelling every
 * caller through one function that reads `locals.user` — plus `UserId` being a
 * separate brand from the presence client id — is what makes "must not" into
 * "cannot".
 *
 * The hook has already redirected anonymous requests, so reaching this without
 * a user means a route was added outside the hook's coverage. Redirecting again
 * is the safe answer.
 */
export function requireCaller(locals: App.Locals): Caller {
	if (!locals.user) {
		redirect(303, '/login');
	}
	return { userId: locals.user.id };
}

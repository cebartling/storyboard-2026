import { redirect, type Handle } from '@sveltejs/kit';
import { deps } from '$lib/server/deps';
import { SESSION_COOKIE, clearSessionCookie } from '$lib/server/auth/session-cookie';

/**
 * The only pages an anonymous visitor may reach. Everything else redirects to
 * `/login` — this app has no public read path, and adding one later means
 * adding it here rather than remembering a check at each route.
 */
const PUBLIC_PATHS = new Set(['/login', '/register']);

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	const user = token ? await deps.auth.validateSession(token) : null;

	// A cookie that no longer resolves is stale — an expired or logged-out
	// session, or a database that has been reset in development. Clearing it
	// keeps the browser from presenting it on every subsequent request.
	if (token && !user) clearSessionCookie(event.cookies);

	event.locals.user = user;

	if (!user && !PUBLIC_PATHS.has(event.url.pathname)) {
		redirect(303, '/login');
	}

	return resolve(event);
};

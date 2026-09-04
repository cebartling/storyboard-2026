import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { SESSION_TTL_MS } from './auth';

export const SESSION_COOKIE = 'session';

/**
 * One place that knows how the session cookie is written, so login, register
 * and logout cannot drift apart on its attributes.
 *
 * `httpOnly` because nothing client-side has any business reading it — the
 * page learns who it is from `locals`, via the layout's load. `sameSite: lax`
 * lets an ordinary link into the app keep the session while still refusing
 * cross-site form posts.
 */
export function setSessionCookie(cookies: Cookies, token: string, expiresAt: Date): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		expires: expiresAt,
		maxAge: Math.floor(SESSION_TTL_MS / 1000)
	});
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

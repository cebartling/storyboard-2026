import { fail, type ActionFailure } from '@sveltejs/kit';
import { ConflictError, ForbiddenError, InvariantError } from '$lib/domain/errors';

/**
 * Runs one form action's body and turns anything it throws into the right
 * response, so every named action shares one policy instead of each collapsing
 * failures into `fail(400, e.message)`.
 *
 * Lives at the route root rather than beside the board: the map list has the
 * same three failure modes once maps have owners (ADR 0016), and had been
 * hand-rolling `fail(400)` instead.
 *
 * - `InvariantError` -> 400 with the domain's own message. These are written
 *   for the person who made the request, so they are safe to show.
 * - `ForbiddenError` -> 403, likewise with its own message. The caller is known
 *   and simply not permitted, so a redirect to sign in would be misleading.
 * - `ConflictError` -> 409. Someone else changed the map between the version
 *   the user's editor was opened at and now; the internal version numbers are
 *   an operator detail, so the user gets the remedy instead. The remedy is
 *   deliberately not "reload": the client refreshes the board itself and keeps
 *   what the user typed, so a reload would only throw their own edit away.
 * - anything else -> 500, logged server-side with the action's label. The
 *   message is never shown: it can carry driver or filesystem detail.
 *
 * Returns `undefined` on success, which is what a SvelteKit action returns
 * when it has no data for the page.
 */
export async function runAction(
	label: string,
	body: () => Promise<void>
): Promise<ActionFailure<{ error: string }> | undefined> {
	try {
		await body();
		return undefined;
	} catch (e) {
		if (e instanceof InvariantError) {
			return fail(400, { error: e.message });
		}
		if (e instanceof ForbiddenError) {
			return fail(403, { error: e.message });
		}
		if (e instanceof ConflictError) {
			return fail(409, {
				error:
					'Someone else changed this map while you were editing. The board has been refreshed — check your change against it, then save again.'
			});
		}
		console.error(`action ${label} failed`, e);
		return fail(500, { error: 'Something went wrong on the server. Please try again.' });
	}
}

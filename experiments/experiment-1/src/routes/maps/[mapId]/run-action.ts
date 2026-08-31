import { fail, type ActionFailure } from '@sveltejs/kit';
import { ConflictError, InvariantError } from '$lib/domain/errors';

/**
 * Runs one form action's body and turns anything it throws into the right
 * response, so the eleven actions in `+page.server.ts` share one policy
 * instead of each collapsing every failure into `fail(400, e.message)`.
 *
 * - `InvariantError` -> 400 with the domain's own message. These are written
 *   for the person who made the request, so they are safe to show.
 * - `ConflictError` -> 409. Someone else changed the map between our load and
 *   our save; the internal version numbers are an operator detail, so the user
 *   gets the remedy instead.
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
		if (e instanceof ConflictError) {
			return fail(409, {
				error: 'Someone else changed this map while you were editing. Reload to see their changes.'
			});
		}
		console.error(`action ${label} failed`, e);
		return fail(500, { error: 'Something went wrong on the server. Please try again.' });
	}
}

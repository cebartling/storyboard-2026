import type { LayoutServerLoad } from './$types';

/**
 * Who the page is for. The header needs a name and a logout control, and the
 * board needs the viewer's identity for presence once ADR 0014 Stage 1 lands.
 *
 * Note for ADR 0008's caveat: this is the layout load that ADR said would make
 * `invalidateAll()` worth revisiting. It stays as it is — this load reads one
 * cookie-derived value that the hook has already resolved, so rerunning it is
 * far cheaper than the board refetch it accompanies.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	return { user: locals.user };
};

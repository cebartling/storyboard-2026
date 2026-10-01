import type { ClientId, MapId } from '$lib/domain/ids';
import { deps } from '$lib/server/deps';
import { runAction } from '../../run-action';

/**
 * Runs a map mutation and, if it succeeded, tells everyone watching the map
 * (ADR 0014 §5).
 *
 * The broadcast lives here rather than in the use case because publishing from
 * the app layer would need a third outbound port, which ADR 0006 forbids. The
 * new sequence is `expectedVersion + 1` exactly: the write ran under the per-map
 * lock against that version, and `save()` increments by one.
 *
 * The notification carries no payload — clients react by refetching, which is
 * the sync path this codebase already has the most confidence in.
 *
 * Shared by every page that writes to a map — the board and its glossary
 * (ADR 0025) — so a write from either reaches viewers of both.
 */
export async function runAndPublish(
	label: string,
	mapId: MapId,
	form: FormData,
	// Returns the version it was called with, so that parsing the field stays
	// inside `runAction`'s error handling — hoisting it out would turn a
	// malformed request into a 500 instead of a 400.
	body: () => Promise<number>
) {
	let expectedVersion: number | null = null;
	const failure = await runAction(label, async () => {
		expectedVersion = await body();
	});
	if (!failure && expectedVersion !== null) {
		// The submitting tab identifies itself so the hub can skip it: it has
		// already refetched as part of this submission. Optional, untrusted, and
		// cast rather than validated on purpose: the worst a forged value does is
		// deny that tab one notification it was going to refetch for anyway. It
		// never reaches a use case or the repository.
		const origin = form.get('clientId');
		// `watching`, not `hubFor`: nobody may be on this board, and creating a hub
		// to broadcast into an empty room leaves it behind for the process lifetime.
		deps.collab
			.watching(mapId)
			?.publishChange(
				expectedVersion + 1,
				typeof origin === 'string' ? (origin as ClientId) : undefined
			);
	}
	return failure;
}

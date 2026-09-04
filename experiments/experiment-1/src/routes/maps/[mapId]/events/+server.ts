import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deps } from '$lib/server/deps';
import { requireCaller } from '$lib/server/auth/require-caller';
import { loadMap } from '$lib/app/use-cases';
import type { MapId } from '$lib/domain/ids';
import { createEventStream, parseLastSeq } from '$lib/server/collab/sse';

/**
 * The map's event stream (ADR 0015 §4). SSE downstream, ordinary POSTs upstream.
 *
 * Authorisation happens before subscribing, through the same use case the page
 * load uses — without it, anyone with a map id would learn whenever that map
 * changed and who was looking at it, which is most of what the board tells you.
 */
export const GET: RequestHandler = async ({ params, url, request, locals }) => {
	const caller = requireCaller(locals);
	const mapId = params.mapId as MapId;

	const access = await loadMap(deps.storyMapRepository, caller, mapId);
	// 404 rather than 403, matching the page: a non-member must not be able to
	// tell a map that exists from one that does not.
	if (!access) error(404, `No story map with id ${params.mapId}`);

	const hub = deps.collab.hubFor(mapId);
	// Seed the hub from what is actually persisted, so a client that loaded the
	// page before this process started is not told it is behind.
	hub.observe(access.map.version);

	// The client mints its own id per connection: it distinguishes two tabs of
	// one account and is deliberately not an identity (ADR 0016 §6).
	const clientId = url.searchParams.get('client') ?? crypto.randomUUID();

	return createEventStream(
		hub,
		{ userId: caller.userId, displayName: locals.user!.displayName, clientId },
		parseLastSeq(request.headers.get('last-event-id'), url.searchParams.get('lastSeq'))
	);
};

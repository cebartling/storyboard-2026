import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deps } from '$lib/server/deps';
import { requireCaller } from '$lib/server/auth/require-caller';
import { roleOf } from '$lib/app/use-cases';
import type { MapId } from '$lib/domain/ids';
import { parseCursorBody } from '$lib/server/collab/cursor-body';

/**
 * Where someone's pointer is (ADR 0015 §6). Ephemeral: published to the map's
 * hub and never written to SQLite, so losing it on reconnect is correct
 * behaviour rather than data loss.
 *
 * A POST rather than part of the stream because SSE is one-directional. The
 * cost ADR 0015 §4 names — a request per pointer move — is paid down by
 * throttling on the client, not by batching here.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const caller = requireCaller(locals);
	const mapId = params.mapId as MapId;

	// `roleOf`, not `loadMap`: this fires up to twenty times a second per tab and
	// needs only a yes or no, where loading the aggregate would rebuild the whole
	// board from five queries and throw it away.
	const role = await roleOf(deps.storyMapRepository, caller, mapId);
	if (!role) error(404, `No story map with id ${params.mapId}`);

	const body = parseCursorBody(await request.json().catch(() => null));
	if (body === undefined) error(400, 'Expected {x, y} or {x: null}.');

	// `watching`, not `hubFor`: this POST is sent with `keepalive`, so it often
	// lands after the sender's own stream has closed and the hub has been
	// dropped — recreating it would leave an empty hub behind for good.
	deps.collab
		.watching(mapId)
		?.publishCursor(
			{ userId: caller.userId, displayName: locals.user!.displayName, clientId: body.clientId },
			body.cursor
		);

	return json({ ok: true });
};

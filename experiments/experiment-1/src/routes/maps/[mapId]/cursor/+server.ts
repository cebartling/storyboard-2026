import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deps } from '$lib/server/deps';
import { requireCaller } from '$lib/server/auth/require-caller';
import { loadMap } from '$lib/app/use-cases';
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

	const access = await loadMap(deps.storyMapRepository, caller, mapId);
	if (!access) error(404, `No story map with id ${params.mapId}`);

	const body = parseCursorBody(await request.json().catch(() => null));
	if (body === undefined) error(400, 'Expected {x, y} or {x: null}.');

	deps.collab
		.hubFor(mapId)
		.publishCursor(
			{ userId: caller.userId, displayName: locals.user!.displayName, clientId: body.clientId },
			body.cursor
		);

	return json({ ok: true });
};

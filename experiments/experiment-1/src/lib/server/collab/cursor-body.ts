/**
 * Parses a cursor POST. Returns `undefined` for anything malformed, so the
 * route answers 400 rather than publishing a NaN that every viewer would then
 * try to position an element at.
 */
export function parseCursorBody(
	body: unknown
): { clientId: string; cursor: { x: number; y: number } | null } | undefined {
	if (typeof body !== 'object' || body === null) return undefined;
	const candidate = body as { clientId?: unknown; x?: unknown; y?: unknown };

	if (typeof candidate.clientId !== 'string' || candidate.clientId.length === 0) return undefined;

	// `{x: null}` means "my pointer left the board", which is a real message
	// rather than an absent one.
	if (candidate.x === null) return { clientId: candidate.clientId, cursor: null };

	if (typeof candidate.x !== 'number' || typeof candidate.y !== 'number') return undefined;
	if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) return undefined;

	return { clientId: candidate.clientId, cursor: { x: candidate.x, y: candidate.y } };
}

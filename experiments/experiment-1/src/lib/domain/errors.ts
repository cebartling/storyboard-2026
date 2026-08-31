/**
 * Domain error types, so the driving adapter can tell a caller's mistake from
 * a server fault without string-matching on messages.
 *
 * Pure TypeScript, like the rest of `src/lib/domain/` — see ADR 0006.
 *
 * - `InvariantError`: the request was not valid against the aggregate's rules
 *   (missing field, unknown id, neighbour outside the target scope). The
 *   message is written for the person who made the request and is safe to show.
 * - `ConflictError`: the request was valid, but the aggregate changed between
 *   load and save. Retrying against fresh state is the remedy.
 *
 * Anything else escaping a use case is an unexpected fault: log it, and do not
 * show its message to the user.
 */

/** A request that violates a domain rule. Safe to surface to the caller. */
export class InvariantError extends Error {
	readonly name = 'InvariantError';
}

/** A lost-update conflict: the aggregate moved on since it was loaded. */
export class ConflictError extends Error {
	readonly name = 'ConflictError';
}

import { InvariantError } from '$lib/domain/errors';

/**
 * Form-field parsing shared by the board's named actions. Extracted from
 * `+page.server.ts` so it can be unit-tested without a request: this is the
 * only place a malformed POST is turned into a domain-shaped error.
 */

export function requireString(value: FormDataEntryValue | null, field: string): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new InvariantError(`${field} is required.`);
	}
	// Trim what we return, not just what we validate: id fields flow straight
	// into a domain lookup, where stray whitespace surfaces as a confusing
	// "not found" instead of being normalised.
	return value.trim();
}

/** Empty string means "no neighbour on this side" (start/end of scope). */
export function optionalNeighbour(value: FormDataEntryValue | null): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * The aggregate version the client's editor was opened at (ADR 0015 §3).
 *
 * Strict on purpose. A missing or unparseable version cannot be defaulted:
 * treating it as "whatever is current" would reinstate the silent overwrite
 * this field exists to prevent, and treating it as 0 would reject every
 * legitimate edit to a board that has ever been touched. Both are worse than
 * telling the caller its request was malformed.
 */
export function requireVersion(value: FormDataEntryValue | null): number {
	const raw = requireString(value, 'Version');
	const version = Number(raw);
	if (!Number.isInteger(version) || version < 0) {
		throw new InvariantError(`Version must be a non-negative integer, got ${raw}.`);
	}
	return version;
}

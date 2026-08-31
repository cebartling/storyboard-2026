/**
 * Fractional ranking: thin wrapper around `fractional-indexing`'s
 * `generateKeyBetween`. See ADR 0005 for why lexicographic fractional ranks
 * were chosen over integer `position` columns, and domain-model.md for the
 * worked examples this API is built to support.
 *
 * A rank is an opaque, lexicographically-sortable string. Callers never
 * construct one directly — they ask for a rank relative to existing
 * neighbours (or the ends of a list).
 */

import { generateKeyBetween } from 'fractional-indexing';
import { InvariantError } from './errors';

export type Rank = string;

/**
 * Computes a rank strictly between `prev` and `next`. Pass `null` for
 * `prev` to mean "before everything" and `null` for `next` to mean "after
 * everything"; both `null` means "the first rank in an empty scope."
 *
 * Throws if `prev` and `next` are out of order (`prev >= next`) or equal —
 * the caller has passed the wrong neighbours for the intended drop.
 */
export function rankBetween(prev: Rank | null, next: Rank | null): Rank {
	if (prev !== null && next !== null && prev >= next) {
		throw new InvariantError(`rankBetween: prev (${prev}) must sort before next (${next})`);
	}
	return generateKeyBetween(prev, next);
}

/** Computes a rank that sorts after every rank in `existingRanks`. */
export function rankAtEnd(existingRanks: readonly Rank[]): Rank {
	const last = maxRank(existingRanks);
	return rankBetween(last, null);
}

function maxRank(ranks: readonly Rank[]): Rank | null {
	return ranks.reduce<Rank | null>((max, r) => (max === null || r > max ? r : max), null);
}

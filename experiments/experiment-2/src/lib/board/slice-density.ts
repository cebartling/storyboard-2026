/**
 * How much of a release slice row this viewer wants to see (ADR 0022).
 *
 * Presentation, so it lives here rather than in `src/lib/domain/` — the same
 * reason `story-status.ts` does. It sits beside `board-view-model.ts` because
 * the board route and the deck component both read it, and neither imports
 * from the other.
 *
 * Three states, but only two values: **absent means expanded**. Expanded is the
 * default every row starts in, so storing it would mean writing an entry per
 * slice on a board nobody has touched.
 */
export type SliceDensity = 'condensed' | 'collapsed';

export const SLICE_DENSITIES: readonly SliceDensity[] = ['condensed', 'collapsed'];

export function isSliceDensity(value: unknown): value is SliceDensity {
	return value === 'condensed' || value === 'collapsed';
}

/**
 * The cycle the row control walks: expanded → condensed → collapsed → expanded.
 *
 * `undefined` is expanded on both ends, which is what makes this closed: three
 * calls from any state return to that state.
 */
export function nextSliceDensity(current: SliceDensity | undefined): SliceDensity | undefined {
	if (current === undefined) return 'condensed';
	if (current === 'condensed') return 'collapsed';
	return undefined;
}

/**
 * The verb for the control's label, naming the state it moves *to*.
 *
 * The button says what it will do rather than what the row currently is, which
 * is also why `aria-expanded` is gone: it is binary and would have to lie about
 * one of the three states.
 */
export function sliceDensityAction(next: SliceDensity | undefined): string {
	if (next === 'condensed') return 'Condense';
	if (next === 'collapsed') return 'Collapse';
	return 'Expand';
}

/** What a row's `data-density` attribute reads, for tests and styling hooks. */
export function sliceDensityName(current: SliceDensity | undefined): string {
	return current ?? 'expanded';
}

// ---------------------------------------------------------------------------
// Which stories a given story could be linked to, and how a typed query narrows
// them (ADR 0019).
//
// Pure and DB-free, beside `dialog-subject.ts` for the same reason: the picker
// has real rules — exclude yourself, exclude what is already linked, cap a long
// list — and they are worth testing without mounting a dialog.
//
// Note what is *not* here: candidates that would close a cycle are deliberately
// left in. Filtering them would duplicate a domain rule outside the pure core
// (ADR 0006), and could not be enforced against a direct POST anyway. The
// server refuses, and its message names the loop.
// ---------------------------------------------------------------------------

import type { StoryId } from '$lib/domain/ids';
import type { BoardViewModel } from './board-view-model';

export interface Candidate {
	id: StoryId;
	title: string;
	/** Where it sits, so two stories with the same title can be told apart. */
	stepName: string;
	sliceName: string;
}

/**
 * Every story that could legally be picked as the other end of a dependency
 * from `storyId`: not itself, and not already linked in either direction.
 *
 * Already-linked is excluded in *both* directions even though only one of them
 * is a duplicate — the other is a cycle. Neither is a row worth offering.
 */
export function candidateStories(board: BoardViewModel, storyId: StoryId): Candidate[] {
	const stepNameById = new Map(board.columns.map((c) => [c.stepId, c.name]));
	const sliceNameById = new Map(board.rows.map((r) => [r.sliceId, r.name]));

	const linked = new Set<StoryId>();
	for (const d of board.dependencies) {
		if (d.blockerId === storyId) linked.add(d.blockedId);
		if (d.blockedId === storyId) linked.add(d.blockerId);
	}

	return board.cells.flatMap((cell) =>
		cell.stories
			.filter((s) => s.id !== storyId && !linked.has(s.id))
			.map((s) => ({
				id: s.id,
				title: s.title,
				stepName: stepNameById.get(cell.stepId) ?? '',
				sliceName: sliceNameById.get(cell.sliceId) ?? ''
			}))
	);
}

/**
 * Case-insensitive substring match on the title or the step it sits in, capped.
 *
 * `total` is the untruncated count so the dialog can say "showing 50 of 137" —
 * a list that silently stops at the cap reads as "there is nothing else".
 */
export function filterCandidates(
	candidates: Candidate[],
	query: string,
	limit: number
): { shown: Candidate[]; total: number } {
	const needle = query.trim().toLowerCase();
	const matches =
		needle === ''
			? candidates
			: candidates.filter(
					(c) => c.title.toLowerCase().includes(needle) || c.stepName.toLowerCase().includes(needle)
				);
	return { shown: matches.slice(0, limit), total: matches.length };
}

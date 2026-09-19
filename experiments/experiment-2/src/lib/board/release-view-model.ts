import type { SliceId, StoryId } from '$lib/domain/ids';
import type { Story, StoryMap, StoryStatus } from '$lib/domain/story-map';

/**
 * One release slice's stories as a build order (ADR 0023).
 *
 * Pure and DB-free for the same reason as `board-view-model.ts`: the route
 * that renders it cannot be imported by a test without booting `deps`.
 */

/** What blocks a story, as the release view shows it. Only direct edges —
 *  a chain through other stories decides the order, but is not listed. */
export type BlockerVM =
	| { kind: 'inSlice'; id: StoryId; title: string; position: number }
	| {
			kind: 'outside';
			id: StoryId;
			title: string;
			/** `null` is the unsliced band. */
			sliceName: string | null;
			/** The blocker sits in a later slice or is unsliced and is not done,
			 *  so this release cannot ship as planned: it waits on work planned
			 *  after it. */
			contradicts: boolean;
	  };

export interface ReleaseStoryVM {
	id: StoryId;
	title: string;
	status: StoryStatus;
	activityName: string;
	stepName: string;
	blockers: BlockerVM[];
}

export interface ReleaseViewModel {
	sliceId: SliceId;
	name: string;
	stories: ReleaseStoryVM[];
}

/**
 * Returns `null` when the map has no such slice, so the route can 404.
 *
 * The order is a topological sort that always takes the ready story earliest in
 * reading order — activity, then step, then story rank — so stories no edge
 * constrains read exactly as they do on the board.
 *
 * A story must come after another in the slice when *any* path of edges joins
 * them, not only a direct edge: with A → X → B and X in another slice, B still
 * cannot be built before A.
 */
export function buildReleaseViewModel(map: StoryMap, sliceId: SliceId): ReleaseViewModel | null {
	const sliceOrder = new Map(map.slices.map((s, i) => [s.id, { index: i, name: s.name }]));
	const release = sliceOrder.get(sliceId);
	if (!release) return null;

	// Activities and steps arrive in rank order (`inRankOrder` on load, and the
	// `add*` functions append), which is the order the board reads them in.
	const stepPlace = new Map<string, { index: number; stepName: string; activityName: string }>();
	for (const activity of map.activities) {
		for (const step of activity.steps) {
			stepPlace.set(step.id, {
				index: stepPlace.size,
				stepName: step.name,
				activityName: activity.name
			});
		}
	}
	const readingOrder = (a: Story, b: Story) =>
		stepPlace.get(a.stepId)!.index - stepPlace.get(b.stepId)!.index ||
		(a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0);

	const inSlice = map.stories.filter((s) => s.sliceId === sliceId).sort(readingOrder);
	const inSliceIds = new Set(inSlice.map((s) => s.id));

	// Both directions, built once: the walk below follows successors, and each
	// row's blocker list reads predecessors. Filtering every edge per row would
	// be O(stories x edges), which `buildBoardViewModel` avoids for the same reason.
	const successors = new Map<StoryId, StoryId[]>();
	const predecessors = new Map<StoryId, StoryId[]>();
	const append = (into: Map<StoryId, StoryId[]>, key: StoryId, value: StoryId) => {
		const list = into.get(key);
		if (list) list.push(value);
		else into.set(key, [value]);
	};
	for (const d of map.dependencies) {
		append(successors, d.blockerId, d.blockedId);
		append(predecessors, d.blockedId, d.blockerId);
	}

	// For each story in the slice, every other story in the slice it reaches
	// must come after it. `seen` saves re-walking a diamond, and it is also what
	// stops the walk on a hand-edited cycle, which addDependency would have
	// refused (ADR 0019) — so that the stall check below can report it rather
	// than this loop spinning forever.
	const mustFollow = new Map<StoryId, Set<StoryId>>(inSlice.map((s) => [s.id, new Set()]));
	const waitingOn = new Map<StoryId, number>(inSlice.map((s) => [s.id, 0]));
	for (const from of inSlice) {
		const seen = new Set<StoryId>();
		const stack = [...(successors.get(from.id) ?? [])];
		while (stack.length > 0) {
			const id = stack.pop()!;
			if (seen.has(id)) continue;
			seen.add(id);
			if (inSliceIds.has(id)) {
				mustFollow.get(from.id)!.add(id);
				waitingOn.set(id, waitingOn.get(id)! + 1);
			}
			stack.push(...(successors.get(id) ?? []));
		}
	}

	// Kahn's algorithm. `inSlice` is already in reading order, so the first
	// ready story in it is the one to take.
	const ordered: Story[] = [];
	const remaining = [...inSlice];
	while (remaining.length > 0) {
		const next = remaining.findIndex((s) => waitingOn.get(s.id) === 0);
		if (next === -1) {
			throw new Error(
				`Release view for slice ${sliceId}: dependencies among ${remaining
					.map((s) => s.id)
					.join(', ')} form a cycle, which addDependency should have refused (ADR 0019)`
			);
		}
		const [story] = remaining.splice(next, 1);
		ordered.push(story);
		for (const id of mustFollow.get(story.id)!) {
			waitingOn.set(id, waitingOn.get(id)! - 1);
		}
	}

	const position = new Map(ordered.map((s, i) => [s.id, i + 1]));
	const storyById = new Map(map.stories.map((s) => [s.id, s]));

	// In-slice blockers first, by position; then the rest by slice, unsliced
	// last, and in reading order within a slice — the order a reader would go
	// and look for them.
	const toBlocker = (blocker: Story): { sortKey: number; story: Story; vm: BlockerVM } => {
		if (blocker.sliceId === sliceId) {
			const at = position.get(blocker.id)!;
			return {
				sortKey: at,
				story: blocker,
				vm: { kind: 'inSlice', id: blocker.id, title: blocker.title, position: at }
			};
		}
		const blockerSlice = blocker.sliceId === null ? undefined : sliceOrder.get(blocker.sliceId);
		const sliceRank = blockerSlice?.index ?? map.slices.length;
		return {
			sortKey: ordered.length + 1 + sliceRank,
			story: blocker,
			vm: {
				kind: 'outside',
				id: blocker.id,
				title: blocker.title,
				sliceName: blockerSlice?.name ?? null,
				contradicts: sliceRank > release.index && blocker.status !== 'done'
			}
		};
	};

	return {
		sliceId,
		name: release.name,
		stories: ordered.map((story) => {
			const place = stepPlace.get(story.stepId)!;
			const blockers = (predecessors.get(story.id) ?? [])
				// Defensive, as in `buildBoardViewModel`: a partial fixture can
				// leave an edge whose blocker is gone.
				.flatMap((blockerId) => {
					const blocker = storyById.get(blockerId);
					return blocker ? [toBlocker(blocker)] : [];
				})
				.sort((a, b) => a.sortKey - b.sortKey || readingOrder(a.story, b.story))
				.map((b) => b.vm);
			return {
				id: story.id,
				title: story.title,
				status: story.status,
				activityName: place.activityName,
				stepName: place.stepName,
				blockers
			};
		})
	};
}

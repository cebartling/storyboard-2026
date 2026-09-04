import type { BoardDialog } from '$lib/components/board-dialogs.svelte';
import type { BoardViewModel } from './board-view-model';

/**
 * Whether the thing an open dialog is editing still looks the way it did when
 * the dialog opened (ADR 0014 Stage 1).
 *
 * Live refetching makes this routine rather than rare: the board underneath an
 * open editor now changes on its own. Without this the user's first sign that
 * someone else touched their subject is a 409 on save, or — for a delete —
 * a confusing "not found".
 *
 * The `BoardDialog` object *is* the open-time snapshot: it carries the values
 * the form was prefilled with, so comparing it against the current board is
 * exactly "has this changed since I opened it".
 *
 * Pure, and in `src/lib/board/` beside the view model it reads, so it is
 * testable without a component.
 */
export type SubjectStatus =
	| { status: 'current' }
	| { status: 'deleted' }
	/** Changed, with a dialog describing the subject as it is now. */
	| { status: 'changed'; current: BoardDialog };

export function subjectStatus(dialog: BoardDialog, board: BoardViewModel): SubjectStatus {
	switch (dialog.kind) {
		// Creating something new has no subject to go stale — but its *parent*
		// can vanish, and adding a step to a deleted activity fails confusingly.
		case 'addActivity':
		case 'addSlice':
		case 'shareMap':
			return { status: 'current' };

		case 'addStep': {
			const activity = board.activities.find((a) => a.id === dialog.activityId);
			return activity ? { status: 'current' } : { status: 'deleted' };
		}

		case 'addStory': {
			const step = board.columns.find((c) => c.stepId === dialog.stepId);
			if (!step) return { status: 'deleted' };
			if (dialog.sliceId !== null && !board.slices.some((s) => s.id === dialog.sliceId)) {
				return { status: 'deleted' };
			}
			return { status: 'current' };
		}

		case 'editActivity': {
			const activity = board.activities.find((a) => a.id === dialog.activityId);
			if (!activity) return { status: 'deleted' };
			return activity.name === dialog.name
				? { status: 'current' }
				: { status: 'changed', current: { ...dialog, name: activity.name } };
		}

		case 'editStep': {
			const step = board.columns.find((c) => c.stepId === dialog.stepId);
			if (!step) return { status: 'deleted' };
			return step.name === dialog.name
				? { status: 'current' }
				: { status: 'changed', current: { ...dialog, name: step.name } };
		}

		case 'editSlice': {
			const slice = board.slices.find((s) => s.id === dialog.sliceId);
			if (!slice) return { status: 'deleted' };
			return slice.name === dialog.name
				? { status: 'current' }
				: { status: 'changed', current: { ...dialog, name: slice.name } };
		}

		case 'editStory': {
			const story = board.cells
				.flatMap((cell) => cell.stories)
				.find((s) => s.id === dialog.storyId);
			if (!story) return { status: 'deleted' };
			// A move changes which cell holds the story but not the story itself,
			// and is not something the editor needs to warn about.
			return story.title === dialog.title && story.description === dialog.description
				? { status: 'current' }
				: {
						status: 'changed',
						current: { ...dialog, title: story.title, description: story.description }
					};
		}
	}
}

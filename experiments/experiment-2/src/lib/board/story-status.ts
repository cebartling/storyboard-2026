import { STORY_STATUSES, type StoryStatus } from '$lib/domain/story-map';

/**
 * How each story status is named and painted (ADR 0021).
 *
 * Presentation, so it lives here rather than in `src/lib/domain/` — the domain
 * knows the five values and nothing about how they look. It sits beside
 * `board-view-model.ts` for the same reason that file does: the board route and
 * the card component both read it, and neither imports from the other.
 *
 * The class strings are written out in full and never assembled. Tailwind scans
 * source text for complete class names, so a template literal like
 * `bg-status-${status}/8` produces no CSS at all — it would simply render an
 * untinted card, with nothing failing anywhere to say why.
 */
export interface StoryStatusPresentation {
	/** Shown in the card's chip and as the `<select>` option label. */
	label: string;
	/** Tint for the card body: replaces the accent colouring every card wore
	 *  before statuses existed. */
	card: string;
	/** The chip itself, following the dependency badge's pattern in
	 *  `story-card.svelte`. */
	chip: string;
}

const CHIP_BASE =
	'inline-flex shrink-0 items-center rounded border px-1 py-0.5 text-[0.7rem] font-medium';

export const STORY_STATUS_PRESENTATION: Record<StoryStatus, StoryStatusPresentation> = {
	backlog: {
		label: 'Backlog',
		card: 'border-status-backlog/25 bg-status-backlog/8',
		chip: `border-status-backlog/25 bg-status-backlog/8 text-status-backlog ${CHIP_BASE}`
	},
	todo: {
		label: 'To do',
		card: 'border-status-todo/25 bg-status-todo/8',
		chip: `border-status-todo/25 bg-status-todo/8 text-status-todo ${CHIP_BASE}`
	},
	'in-progress': {
		label: 'In progress',
		card: 'border-status-in-progress/25 bg-status-in-progress/8',
		chip: `border-status-in-progress/25 bg-status-in-progress/8 text-status-in-progress ${CHIP_BASE}`
	},
	'in-review': {
		label: 'In review',
		card: 'border-status-in-review/25 bg-status-in-review/8',
		chip: `border-status-in-review/25 bg-status-in-review/8 text-status-in-review ${CHIP_BASE}`
	},
	done: {
		label: 'Done',
		card: 'border-status-done/25 bg-status-done/8',
		chip: `border-status-done/25 bg-status-done/8 text-status-done ${CHIP_BASE}`
	}
};

/** The statuses in the order they are offered in the edit dialog: the order
 *  `STORY_STATUSES` declares, which is the order work moves through. */
export const STORY_STATUS_OPTIONS: { value: StoryStatus; label: string }[] = STORY_STATUSES.map(
	(value) => ({ value, label: STORY_STATUS_PRESENTATION[value].label })
);

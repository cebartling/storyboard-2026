import type { ActivityId, MapId, SliceId, StepId, StoryId } from '$lib/domain/ids';
import type { StoryMap } from '$lib/domain/story-map';

// ---------------------------------------------------------------------------
// Board view model: a CSS-grid-friendly flattening of the aggregate.
//
// Grid layout (see documentation/architecture.md and the plan's step 7):
//   column 1            -> row labels (slice names, "Unsliced")
//   columns 2..N         -> one per Step, steps grouped under their Activity
//                           in narrative (rank) order, left to right
//   row 1                -> Activity headers, each spanning its Steps' columns
//   row 2                -> Step headers
//   rows 3..3+slices      -> one band per Slice, in rank order
//   last row              -> the unsliced band
//
// Building this here (rather than in the .svelte file) keeps the template a
// plain iteration over precomputed grid coordinates.
// ---------------------------------------------------------------------------

export interface ActivityHeaderVM {
	activityId: ActivityId;
	name: string;
	gridColumnStart: number;
	gridColumnEnd: number;
}

export interface ColumnVM {
	stepId: StepId;
	activityId: ActivityId;
	name: string;
	gridColumn: number;
}

export interface RowVM {
	sliceId: SliceId | null;
	name: string;
	gridRow: number;
}

export interface CellVM {
	stepId: StepId;
	sliceId: SliceId | null;
	gridColumn: number;
	gridRow: number;
	stories: { id: StoryId; title: string; description: string | null }[];
}

export interface BoardViewModel {
	id: MapId;
	name: string;
	activities: { id: ActivityId; name: string; stepCount: number }[];
	slices: { id: SliceId; name: string }[];
	activityHeaders: ActivityHeaderVM[];
	columns: ColumnVM[];
	rows: RowVM[];
	cells: CellVM[];
	totalColumns: number;
}

export function buildBoardViewModel(map: StoryMap): BoardViewModel {
	const activityHeaders: ActivityHeaderVM[] = [];
	const columns: ColumnVM[] = [];

	let nextColumn = 2; // column 1 is the row-label gutter
	for (const activity of map.activities) {
		const gridColumnStart = nextColumn;
		if (activity.steps.length === 0) {
			// No steps yet: still reserve one column so the activity header and
			// its "add step" form have somewhere to live.
			nextColumn += 1;
		} else {
			for (const step of activity.steps) {
				columns.push({
					stepId: step.id,
					activityId: activity.id,
					name: step.name,
					gridColumn: nextColumn
				});
				nextColumn += 1;
			}
		}
		activityHeaders.push({
			activityId: activity.id,
			name: activity.name,
			gridColumnStart,
			gridColumnEnd: nextColumn
		});
	}
	// `nextColumn` starts at 2 (column 1 is the gutter) and advances once per
	// content column, so the content-column count is `nextColumn - 2`. The
	// grid template spends a separate `max-content` track on the gutter, so
	// counting it here too would reserve a permanently empty trailing column.
	const totalColumns = Math.max(nextColumn - 2, 1);

	const rows: RowVM[] = map.slices.map((slice, i) => ({
		sliceId: slice.id,
		name: slice.name,
		gridRow: 3 + i
	}));
	const unslicedRow = 3 + map.slices.length;
	rows.push({ sliceId: null, name: 'Unsliced', gridRow: unslicedRow });

	const cells: CellVM[] = [];
	for (const column of columns) {
		for (const row of rows) {
			cells.push({
				stepId: column.stepId,
				sliceId: row.sliceId,
				gridColumn: column.gridColumn,
				gridRow: row.gridRow,
				stories: map.stories
					.filter((s) => s.stepId === column.stepId && s.sliceId === row.sliceId)
					.map((s) => ({ id: s.id, title: s.title, description: s.description }))
			});
		}
	}

	return {
		id: map.id,
		name: map.name,
		activities: map.activities.map((a) => ({ id: a.id, name: a.name, stepCount: a.steps.length })),
		slices: map.slices.map((s) => ({ id: s.id, name: s.name })),
		activityHeaders,
		columns,
		rows,
		cells,
		totalColumns
	};
}

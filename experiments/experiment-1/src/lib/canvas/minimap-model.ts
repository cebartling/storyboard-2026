// ---------------------------------------------------------------------------
// Minimap model (ADR 0010): flattens the board's grid geometry into a
// uniform-grid overview for `board-minimap.svelte`.
//
// The real board's track sizes are `minmax(...)` (content-dependent — see
// ADR 0010's "track sizes stay minmax" decision), so this deliberately does
// NOT try to reproduce true column widths/row heights. It is an
// approximation: every column the same width, every row the same height,
// which is what a navigator needs. The one piece of geometry that must be
// truthful — the visible viewport rectangle — is computed separately in
// `board-minimap.svelte` from the camera's measured sizes, not from this
// model.
//
// The input is a *structural* type naming only the fields this module reads.
// It was originally that way to keep `src/lib/` from importing a route module;
// `board-view-model.ts` now lives in `src/lib/board/`, so that reason is gone
// and the narrowness is the reason on its own — a minimap that named the whole
// `BoardViewModel` would be recompiled by every field added to it.
// ---------------------------------------------------------------------------

export interface MinimapBoardInput {
	totalColumns: number;
	columns: { gridColumn: number }[];
	rows: { sliceId: string | null; name: string; gridRow: number }[];
	cells: { gridColumn: number; gridRow: number; stories: unknown[] }[];
}

export interface MinimapModel {
	columns: number;
	rows: { sliceId: string | null; name: string }[];
	cells: { col: number; row: number; storyCount: number }[];
}

/**
 * Converts a board's grid-column/grid-row coordinates (1-based, with gaps for
 * the gutter and header rows — see `board-view-model.ts`) into 0-based
 * `col`/`row` indices suitable for placing rectangles in an SVG minimap.
 */
export function toMinimapModel(board: MinimapBoardInput): MinimapModel {
	const colIndexByGridColumn = new Map<number, number>();
	board.columns.forEach((column, index) => colIndexByGridColumn.set(column.gridColumn, index));

	const rowIndexByGridRow = new Map<number, number>();
	board.rows.forEach((row, index) => rowIndexByGridRow.set(row.gridRow, index));

	const cells: MinimapModel['cells'] = [];
	for (const cell of board.cells) {
		const col = colIndexByGridColumn.get(cell.gridColumn);
		const row = rowIndexByGridRow.get(cell.gridRow);
		if (col === undefined || row === undefined) continue;
		cells.push({ col, row, storyCount: cell.stories.length });
	}

	return {
		columns: board.totalColumns,
		rows: board.rows.map((row) => ({ sliceId: row.sliceId, name: row.name })),
		cells
	};
}

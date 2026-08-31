import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { deps } from '$lib/server/deps';
import {
	addActivity,
	addStep,
	addStory,
	createSlice,
	deleteActivity,
	deleteSlice,
	deleteStep,
	deleteStory,
	loadMap,
	moveStory,
	renameActivity,
	renameSlice,
	renameStep
} from '$lib/app/use-cases';
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

interface ActivityHeaderVM {
	activityId: ActivityId;
	name: string;
	gridColumnStart: number;
	gridColumnEnd: number;
}

interface ColumnVM {
	stepId: StepId;
	activityId: ActivityId;
	name: string;
	gridColumn: number;
}

interface RowVM {
	sliceId: SliceId | null;
	name: string;
	gridRow: number;
}

interface CellVM {
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
	totalRows: number;
}

function buildBoardViewModel(map: StoryMap): BoardViewModel {
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
	const totalColumns = Math.max(nextColumn - 1, 1);

	const rows: RowVM[] = map.slices.map((slice, i) => ({
		sliceId: slice.id,
		name: slice.name,
		gridRow: 3 + i
	}));
	const unslicedRow = 3 + map.slices.length;
	rows.push({ sliceId: null, name: 'Unsliced', gridRow: unslicedRow });
	const totalRows = unslicedRow;

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
		totalColumns,
		totalRows
	};
}

export const load: PageServerLoad = async ({ params }) => {
	const map = await loadMap(deps.storyMapRepository, params.mapId as MapId);
	if (!map) {
		error(404, `No story map with id ${params.mapId}`);
	}

	return { board: buildBoardViewModel(map) };
};

function requireString(value: FormDataEntryValue | null, field: string): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(`${field} is required.`);
	}
	return value;
}

/** Empty string means "no neighbour on this side" (start/end of scope). */
function optionalNeighbour(value: FormDataEntryValue | null): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

export const actions: Actions = {
	addActivity: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const name = requireString(form.get('name'), 'Activity name');
			await addActivity(deps.storyMapRepository, params.mapId as MapId, name);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to add activity' });
		}
	},

	renameActivity: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const activityId = requireString(form.get('activityId'), 'activityId') as ActivityId;
			const name = requireString(form.get('name'), 'Activity name');
			await renameActivity(deps.storyMapRepository, params.mapId as MapId, activityId, name);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to rename activity' });
		}
	},

	deleteActivity: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const activityId = requireString(form.get('activityId'), 'activityId') as ActivityId;
			await deleteActivity(deps.storyMapRepository, params.mapId as MapId, activityId);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to delete activity' });
		}
	},

	addStep: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const activityId = requireString(form.get('activityId'), 'activityId') as ActivityId;
			const name = requireString(form.get('name'), 'Step name');
			await addStep(deps.storyMapRepository, params.mapId as MapId, activityId, name);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to add step' });
		}
	},

	renameStep: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const stepId = requireString(form.get('stepId'), 'stepId') as StepId;
			const name = requireString(form.get('name'), 'Step name');
			await renameStep(deps.storyMapRepository, params.mapId as MapId, stepId, name);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to rename step' });
		}
	},

	deleteStep: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const stepId = requireString(form.get('stepId'), 'stepId') as StepId;
			await deleteStep(deps.storyMapRepository, params.mapId as MapId, stepId);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to delete step' });
		}
	},

	createSlice: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const name = requireString(form.get('name'), 'Slice name');
			await createSlice(deps.storyMapRepository, params.mapId as MapId, name);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to add slice' });
		}
	},

	renameSlice: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const sliceId = requireString(form.get('sliceId'), 'sliceId') as SliceId;
			const name = requireString(form.get('name'), 'Slice name');
			await renameSlice(deps.storyMapRepository, params.mapId as MapId, sliceId, name);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to rename slice' });
		}
	},

	deleteSlice: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const sliceId = requireString(form.get('sliceId'), 'sliceId') as SliceId;
			await deleteSlice(deps.storyMapRepository, params.mapId as MapId, sliceId);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to delete slice' });
		}
	},

	addStory: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const stepId = requireString(form.get('stepId'), 'stepId') as StepId;
			const title = requireString(form.get('title'), 'Story title');
			const sliceIdRaw = form.get('sliceId');
			const sliceId =
				typeof sliceIdRaw === 'string' && sliceIdRaw.length > 0 ? (sliceIdRaw as SliceId) : null;
			await addStory(deps.storyMapRepository, params.mapId as MapId, stepId, title, { sliceId });
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to add story' });
		}
	},

	deleteStory: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const storyId = requireString(form.get('storyId'), 'storyId') as StoryId;
			await deleteStory(deps.storyMapRepository, params.mapId as MapId, storyId);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to delete story' });
		}
	},

	moveStory: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const storyId = requireString(form.get('storyId'), 'storyId') as StoryId;
			const stepId = requireString(form.get('stepId'), 'stepId') as StepId;
			const sliceIdRaw = form.get('sliceId');
			const sliceId =
				typeof sliceIdRaw === 'string' && sliceIdRaw.length > 0 ? (sliceIdRaw as SliceId) : null;
			const beforeId = optionalNeighbour(form.get('beforeId'));
			const afterId = optionalNeighbour(form.get('afterId'));
			await moveStory(
				deps.storyMapRepository,
				params.mapId as MapId,
				storyId,
				stepId,
				sliceId,
				beforeId,
				afterId
			);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Failed to move story' });
		}
	}
};

import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import StoryDndZone from './story-dnd-zone.svelte';

describe('StoryDndZone', () => {
	it('renders each item as a story card, in the order given', async () => {
		render(StoryDndZone, {
			items: [
				{ id: 's1', title: 'Search by keyword', description: null },
				{ id: 's2', title: 'Filter by category', description: null }
			],
			stepId: 'step-1',
			sliceId: null,
			onMove: () => {},
			onEditStory: () => {}
		});

		const zone = page.getByTestId('cell-step-1-unsliced');
		await expect.element(zone).toBeInTheDocument();

		const titles = zone.element().querySelectorAll('[data-testid^="story-"]');
		expect(Array.from(titles).map((el) => el.textContent?.trim())).toEqual([
			expect.stringContaining('Search by keyword'),
			expect.stringContaining('Filter by category')
		]);
	});

	it('scopes its data-testid to the (step, slice) cell it renders', async () => {
		render(StoryDndZone, {
			items: [],
			stepId: 'step-7',
			sliceId: 'slice-3',
			onMove: () => {},
			onEditStory: () => {}
		});

		await expect.element(page.getByTestId('cell-step-7-slice-3')).toBeInTheDocument();
	});

	it('renders an empty cell with no cards when given no items', async () => {
		render(StoryDndZone, {
			items: [],
			stepId: 'step-9',
			sliceId: null,
			onMove: () => {},
			onEditStory: () => {}
		});

		const zone = page.getByTestId('cell-step-9-unsliced');
		expect(zone.element().querySelectorAll('[data-testid^="story-"]').length).toBe(0);
	});
});

/**
 * `handleFinalize`'s neighbour derivation is the only thing standing between a
 * drag and a wrong (or rejected) server rank, so it is worth testing directly
 * rather than only through the one Playwright drag. These dispatch the
 * `finalize` CustomEvent the library would dispatch, at the zone element.
 */
describe('StoryDndZone finalize handling', () => {
	const items = [
		{ id: 's1', title: 'First', description: null },
		{ id: 's2', title: 'Second', description: null },
		{ id: 's3', title: 'Third', description: null }
	];

	/** Dispatches the event `svelte-dnd-action` fires when a drag settles. */
	function finalize(
		zone: Element,
		detail: {
			items: { id: string; title: string }[];
			info: { trigger: string; id: string; source: string };
		}
	) {
		zone.dispatchEvent(new CustomEvent('finalize', { detail }));
	}

	async function renderZone(onMove: (detail: unknown) => void) {
		render(StoryDndZone, {
			items,
			stepId: 'step-1',
			sliceId: 'slice-1',
			onMove,
			onEditStory: () => {}
		});
		const zone = page.getByTestId('cell-step-1-slice-1');
		await expect.element(zone).toBeInTheDocument();
		return zone.element();
	}

	it('ignores a finalize whose trigger is not a drop into this zone', async () => {
		const onMove = vi.fn();
		const zone = await renderZone(onMove);

		// The origin zone of a cross-zone drag sees this as the card leaves it.
		finalize(zone, {
			items: [items[0], items[2]],
			info: { trigger: 'droppedIntoAnother', id: 's2', source: 'pointer' }
		});

		expect(onMove).not.toHaveBeenCalled();
	});

	it('reports no neighbours before a card dropped at the head', async () => {
		const onMove = vi.fn();
		const zone = await renderZone(onMove);

		finalize(zone, {
			items: [{ id: 'sX', title: 'Moved', description: null }, ...items],
			info: { trigger: 'droppedIntoZone', id: 'sX', source: 'pointer' }
		});

		expect(onMove).toHaveBeenCalledWith({
			storyId: 'sX',
			stepId: 'step-1',
			sliceId: 'slice-1',
			beforeId: null,
			afterId: 's1'
		});
	});

	it('reports both neighbours for a card dropped in the middle', async () => {
		const onMove = vi.fn();
		const zone = await renderZone(onMove);

		finalize(zone, {
			items: [items[0], { id: 'sX', title: 'Moved', description: null }, items[1], items[2]],
			info: { trigger: 'droppedIntoZone', id: 'sX', source: 'pointer' }
		});

		expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ beforeId: 's1', afterId: 's2' }));
	});

	it('reports no neighbour after a card dropped at the tail', async () => {
		const onMove = vi.fn();
		const zone = await renderZone(onMove);

		finalize(zone, {
			items: [...items, { id: 'sX', title: 'Moved', description: null }],
			info: { trigger: 'droppedIntoZone', id: 'sX', source: 'pointer' }
		});

		expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ beforeId: 's3', afterId: null }));
	});

	it('reports a null sliceId when the zone is the unsliced band', async () => {
		const onMove = vi.fn();
		render(StoryDndZone, {
			items,
			stepId: 'step-2',
			sliceId: null,
			onMove,
			onEditStory: () => {}
		});
		const zone = page.getByTestId('cell-step-2-unsliced');
		await expect.element(zone).toBeInTheDocument();

		finalize(zone.element(), {
			items: [...items, { id: 'sX', title: 'Moved', description: null }],
			info: { trigger: 'droppedIntoZone', id: 'sX', source: 'pointer' }
		});

		expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ sliceId: null }));
	});

	it('ignores a drop whose id is not in the resulting items', async () => {
		const onMove = vi.fn();
		const zone = await renderZone(onMove);

		finalize(zone, {
			items,
			info: { trigger: 'droppedIntoZone', id: 'not-here', source: 'pointer' }
		});

		expect(onMove).not.toHaveBeenCalled();
	});
});

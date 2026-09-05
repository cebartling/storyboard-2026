import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import { page } from 'vitest/browser';
import StoryDndZone from './story-dnd-zone.svelte';

describe('StoryDndZone', () => {
	it('renders each item as a story card, in the order given', async () => {
		render(StoryDndZone, {
			zoneLabel: 'Test cell',
			items: [
				{ id: 's1', title: 'Search by keyword', description: null },
				{ id: 's2', title: 'Filter by category', description: null }
			],
			stepId: 'step-1',
			sliceId: null,
			onMove: () => {},
			onEditStory: () => {},
			onViewStory: () => {}
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
			zoneLabel: 'Test cell',
			items: [],
			stepId: 'step-7',
			sliceId: 'slice-3',
			onMove: () => {},
			onEditStory: () => {},
			onViewStory: () => {}
		});

		await expect.element(page.getByTestId('cell-step-7-slice-3')).toBeInTheDocument();
	});

	it('renders an empty cell with no cards when given no items', async () => {
		render(StoryDndZone, {
			zoneLabel: 'Test cell',
			items: [],
			stepId: 'step-9',
			sliceId: null,
			onMove: () => {},
			onEditStory: () => {},
			onViewStory: () => {}
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

	function renderedIds(): string[] {
		return [...document.querySelectorAll('[data-testid^="story-"]')].map((el) =>
			el.getAttribute('data-testid')!.replace('story-', '')
		);
	}

	async function renderZone(onMove: (detail: unknown) => void) {
		render(StoryDndZone, {
			zoneLabel: 'Test cell',
			items,
			stepId: 'step-1',
			sliceId: 'slice-1',
			onMove,
			onEditStory: () => {},
			onViewStory: () => {}
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
			zoneLabel: 'Test cell',
			items,
			stepId: 'step-2',
			sliceId: null,
			onMove,
			onEditStory: () => {},
			onViewStory: () => {}
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

	// svelte-dnd-action builds every keyboard-drag announcement from
	// `aria-label` on the zone and on the dragged item — "started dragging {item}
	// in {zone}", "moved to position N of M". With neither labelled, a screen
	// reader user hears those sentences with the nouns missing.
	it('labels the zone and its cards so keyboard-drag announcements name them', async () => {
		render(StoryDndZone, {
			items: [{ id: 's1', title: 'Keyword search', description: null }],
			stepId: 'step-1',
			sliceId: null,
			zoneLabel: 'Search products, unsliced',
			onMove: () => {},
			onEditStory: () => {},
			onViewStory: () => {}
		});

		const zone = page.getByTestId('cell-step-1-unsliced').element();
		expect(zone.getAttribute('aria-label')).toBe('Search products, unsliced');

		const card = page.getByTestId('story-s1').element();
		expect(card.getAttribute('aria-label')).toBe('Keyword search');
	});

	// The writable-derived `localItems` is the one non-obvious Svelte 5 semantic
	// in the drag path: the library owns the array during a drag, then the
	// server's order has to win again once `items` changes. Nothing exercised
	// that second half — the spec never changed the prop after a finalize — so a
	// resync that silently stopped working would have looked fine here and shown
	// up only as a card stuck in the wrong place after a rejected move.
	it('lets a changed items prop override the order left by a drag', async () => {
		const { rerender } = render(StoryDndZone, {
			zoneLabel: 'Test cell',
			items,
			stepId: 'step-1',
			sliceId: 'slice-1',
			onMove: () => {},
			onEditStory: () => {},
			onViewStory: () => {}
		});
		const zone = page.getByTestId('cell-step-1-slice-1').element();

		const reordered = [items[2], items[0], items[1]];
		zone.dispatchEvent(
			new CustomEvent('finalize', {
				detail: {
					items: reordered,
					info: { trigger: 'droppedIntoZone', id: 's3', source: 'pointer' }
				}
			})
		);
		await tick();
		expect(renderedIds()).toEqual(reordered.map((i) => i.id));

		// The server rejected the move, so `load()` sends the original order back.
		await rerender({ items });
		expect(renderedIds()).toEqual(items.map((i) => i.id));
	});

	// ADR 0014 Stage 1: a remote refetch mid-drag replaces the array
	// `svelte-dnd-action` is animating, and the card jumps out from under the
	// pointer. The page suspends syncing while any zone is mid-drag, and needs
	// this zone to say when that starts and stops.
	describe('drag state reporting', () => {
		it('reports a drag starting on the first consider and ending on finalize', async () => {
			const states: boolean[] = [];
			render(StoryDndZone, {
				items: [{ id: 's1', title: 'A', description: null }],
				stepId: 'step-1',
				sliceId: null,
				zoneLabel: 'cell',
				onMove: () => {},
				onEditStory: () => {},
				onViewStory: () => {},
				onDragStateChange: (dragging: boolean) => states.push(dragging)
			});
			const zone = page.getByTestId('cell-step-1-unsliced').element();

			zone.dispatchEvent(
				new CustomEvent('consider', {
					detail: { items: [{ id: 's1', title: 'A', description: null }], info: {} }
				})
			);
			await tick();
			expect(states).toEqual([true]);

			// Repeated considers are the ordinary case during one drag; only the
			// transition is worth reporting.
			zone.dispatchEvent(
				new CustomEvent('consider', {
					detail: { items: [{ id: 's1', title: 'A', description: null }], info: {} }
				})
			);
			await tick();
			expect(states).toEqual([true]);

			zone.dispatchEvent(
				new CustomEvent('finalize', {
					detail: {
						items: [{ id: 's1', title: 'A', description: null }],
						info: { trigger: 'droppedIntoZone', id: 's1' }
					}
				})
			);
			await tick();
			expect(states).toEqual([true, false]);
		});

		it('reports the end of a drag that left this zone for another', async () => {
			// The origin zone of a cross-zone drag sees DROPPED_INTO_ANOTHER, not
			// DROPPED_INTO_ZONE. It still has to say the drag is over, or syncing
			// stays suspended for the rest of the session.
			const states: boolean[] = [];
			render(StoryDndZone, {
				items: [{ id: 's1', title: 'A', description: null }],
				stepId: 'step-9',
				sliceId: null,
				zoneLabel: 'cell',
				onMove: () => {},
				onEditStory: () => {},
				onViewStory: () => {},
				onDragStateChange: (dragging: boolean) => states.push(dragging)
			});
			const zone = page.getByTestId('cell-step-9-unsliced').element();

			zone.dispatchEvent(new CustomEvent('consider', { detail: { items: [], info: {} } }));
			zone.dispatchEvent(
				new CustomEvent('finalize', {
					detail: { items: [], info: { trigger: 'droppedIntoAnother', id: 's1' } }
				})
			);
			await tick();

			expect(states).toEqual([true, false]);
		});
	});
});

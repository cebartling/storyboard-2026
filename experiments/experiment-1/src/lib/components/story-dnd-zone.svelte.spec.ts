import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import StoryDndZone from './story-dnd-zone.svelte';

describe('StoryDndZone', () => {
	it('renders each item as a story card, in the order given', async () => {
		render(StoryDndZone, {
			items: [
				{ id: 's1', title: 'Search by keyword' },
				{ id: 's2', title: 'Filter by category' }
			],
			stepId: 'step-1',
			sliceId: null,
			onMove: () => {}
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
			onMove: () => {}
		});

		await expect.element(page.getByTestId('cell-step-7-slice-3')).toBeInTheDocument();
	});

	it('renders an empty cell with no cards when given no items', async () => {
		render(StoryDndZone, {
			items: [],
			stepId: 'step-9',
			sliceId: null,
			onMove: () => {}
		});

		const zone = page.getByTestId('cell-step-9-unsliced');
		expect(zone.element().querySelectorAll('[data-testid^="story-"]').length).toBe(0);
	});
});

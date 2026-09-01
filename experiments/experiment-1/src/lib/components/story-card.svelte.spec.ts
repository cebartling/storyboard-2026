import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import StoryCard from './story-card.svelte';

describe('StoryCard', () => {
	it('renders the story title', async () => {
		render(StoryCard, { id: 'story-1', title: 'Search by keyword', onEdit: () => {} });

		await expect.element(page.getByTestId('story-story-1')).toHaveTextContent('Search by keyword');
	});

	// The card mutates nothing itself any more (ADR 0011): both editing and
	// deleting live in the story dialog this button opens.
	it('calls onEdit when its edit button is activated', async () => {
		const onEdit = vi.fn();
		render(StoryCard, { id: 'story-42', title: 'Filter by category', onEdit });

		await page.getByRole('button', { name: 'Edit story Filter by category' }).click();

		expect(onEdit).toHaveBeenCalledOnce();
	});

	it('carries no form of its own', async () => {
		render(StoryCard, { id: 'story-7', title: 'Sort results', onEdit: () => {} });

		expect(page.getByTestId('story-story-7').element().querySelector('form')).toBeNull();
	});
});

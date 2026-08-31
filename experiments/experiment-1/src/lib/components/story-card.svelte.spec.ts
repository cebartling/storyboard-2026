import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import StoryCard from './story-card.svelte';

describe('StoryCard', () => {
	it('renders the story title', async () => {
		render(StoryCard, { id: 'story-1', title: 'Search by keyword' });

		await expect.element(page.getByTestId('story-story-1')).toHaveTextContent('Search by keyword');
	});

	it('renders a delete form posting to ?/deleteStory with the story id', async () => {
		render(StoryCard, { id: 'story-42', title: 'Filter by category' });

		const card = page.getByTestId('story-story-42');
		const form = card.element().querySelector('form');
		expect(form?.getAttribute('action')).toBe('?/deleteStory');

		const hidden = form?.querySelector('input[name="storyId"]') as HTMLInputElement | null;
		expect(hidden?.value).toBe('story-42');
	});
});

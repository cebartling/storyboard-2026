import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import StoryCard from './story-card.svelte';

describe('StoryCard', () => {
	it('renders the story title', async () => {
		render(StoryCard, {
			id: 'story-1',
			title: 'Search by keyword',
			onEdit: () => {},
			onView: () => {}
		});

		await expect.element(page.getByTestId('story-story-1')).toHaveTextContent('Search by keyword');
	});

	// The card mutates nothing itself any more (ADR 0011): both editing and
	// deleting live in the story dialog this button opens.
	it('calls onEdit when its edit button is activated', async () => {
		const onEdit = vi.fn();
		render(StoryCard, { id: 'story-42', title: 'Filter by category', onEdit, onView: () => {} });

		await page.getByRole('button', { name: 'Edit story Filter by category' }).click();

		expect(onEdit).toHaveBeenCalledOnce();
	});

	// The pencil is a Lucide SVG, not a text glyph: a glyph inherits font
	// fallback, so its weight and baseline drift per platform and it cannot
	// share a stroke width with the rest of the controls.
	it('draws its edit affordance as the pencil icon', async () => {
		render(StoryCard, { id: 'story-9', title: 'Sort results', onEdit: () => {}, onView: () => {} });

		const button = page
			.getByRole('button', { name: 'Edit story Sort results' })
			.element() as HTMLElement;

		expect(button.querySelector('svg.lucide-pencil')).not.toBeNull();
		expect(button.textContent?.trim()).toBe('');
	});

	it('carries no form of its own', async () => {
		render(StoryCard, { id: 'story-7', title: 'Sort results', onEdit: () => {}, onView: () => {} });

		expect(page.getByTestId('story-story-7').element().querySelector('form')).toBeNull();
	});

	// The card is the only place a description can be read from (ADR 0018), so
	// the view trigger is a sibling of the pencil rather than a click on the
	// card body: `svelte-dnd-action` owns the body's pointer stream and there is
	// no threshold that separates a tap from the start of a drag (ADR 0011).
	it('calls onView when its view button is activated', async () => {
		const onView = vi.fn();
		render(StoryCard, { id: 'story-3', title: 'Search by keyword', onEdit: () => {}, onView });

		await page.getByRole('button', { name: 'View story Search by keyword' }).click();

		expect(onView).toHaveBeenCalledOnce();
	});

	it('draws its view affordance as an icon, distinct from the pencil', async () => {
		render(StoryCard, {
			id: 'story-4',
			title: 'Sort results',
			onEdit: () => {},
			onView: () => {}
		});

		const button = page
			.getByRole('button', { name: 'View story Sort results' })
			.element() as HTMLElement;

		expect(button.querySelector('svg.lucide-pencil')).toBeNull();
		expect(button.querySelector('svg')).not.toBeNull();
		expect(button.textContent?.trim()).toBe('');
	});

	// Both triggers must stay buttons: that is what keeps them inside
	// `BoardViewport`'s INTERACTIVE_SELECTOR, so panning never steals them.
	it('exposes both of its triggers as buttons', async () => {
		render(StoryCard, {
			id: 'story-5',
			title: 'Sort results',
			onEdit: () => {},
			onView: () => {}
		});

		const card = page.getByTestId('story-story-5').element();

		expect(card.querySelectorAll('button')).toHaveLength(2);
	});
});

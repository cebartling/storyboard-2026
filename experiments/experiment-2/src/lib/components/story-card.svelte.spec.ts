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

	// A story that is blocked is the one a planner scans for; a story that merely
	// blocks others is legible from the other card (ADR 0019).
	describe('dependency badge', () => {
		it('shows nothing when the story is not blocked', async () => {
			render(StoryCard, {
				id: 'story-10',
				title: 'Sort results',
				onEdit: () => {},
				onView: () => {}
			});

			expect(page.getByTestId('deps-badge-story-10').elements()).toHaveLength(0);
		});

		it('shows the count of blockers', async () => {
			render(StoryCard, {
				id: 'story-11',
				title: 'Filter by price',
				blockedByCount: 2,
				onEdit: () => {},
				onView: () => {}
			});

			await expect.element(page.getByTestId('deps-badge-story-11')).toHaveTextContent('2');
		});

		it('names what it means, for anyone not reading the icon', async () => {
			render(StoryCard, {
				id: 'story-12',
				title: 'Filter by price',
				blockedByCount: 1,
				onEdit: () => {},
				onView: () => {}
			});

			// The accessible *name*, not the attribute: an aria-label on a bare
			// <span> is ignored, so asserting the attribute would pass while a
			// screen reader still announced only "1". `role="img"` is what makes
			// the label count, and this assertion is what notices if it goes.
			await expect
				.element(page.getByTestId('deps-badge-story-12'))
				.toHaveAccessibleName('Blocked by 1 story');
		});

		it('pluralises', async () => {
			render(StoryCard, {
				id: 'story-13',
				title: 'Filter by price',
				blockedByCount: 3,
				onEdit: () => {},
				onView: () => {}
			});

			await expect
				.element(page.getByTestId('deps-badge-story-13'))
				.toHaveAccessibleName('Blocked by 3 stories');
		});

		// BoardViewport's INTERACTIVE_SELECTOR is
		// '[data-testid^="story-"], button, a' — so a testid starting with
		// `story-` would be classified as a card by the pan handler, and a drag
		// begun on the badge would stop panning the board. This asserts the
		// prefix we deliberately avoided.
		it('does not claim a testid the pan handler treats as a card', async () => {
			render(StoryCard, {
				id: 'story-14',
				title: 'Filter by price',
				blockedByCount: 1,
				onEdit: () => {},
				onView: () => {}
			});

			const badge = page.getByTestId('deps-badge-story-14').element();

			expect(badge.getAttribute('data-testid')?.startsWith('story-')).toBe(false);
		});

		it('is not a third button on the card', async () => {
			render(StoryCard, {
				id: 'story-15',
				title: 'Filter by price',
				blockedByCount: 1,
				onEdit: () => {},
				onView: () => {}
			});

			expect(page.getByTestId('story-story-15').element().querySelectorAll('button')).toHaveLength(
				2
			);
		});
	});
});

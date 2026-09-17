import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import StoryDeck from './story-deck.svelte';
import type { DndStoryItem } from './story-dnd-zone.svelte';

const STORIES: DndStoryItem[] = [
	{ id: 'story-1', title: 'Export CSV', description: null, status: 'in-progress' },
	{ id: 'story-2', title: 'Invite a teammate', description: null, status: 'todo' },
	{ id: 'story-3', title: 'Audit log', description: null, status: 'done' }
];

function renderDeck(overrides: Partial<{ stories: DndStoryItem[] }> = {}) {
	const onViewStory = vi.fn();
	render(StoryDeck, {
		stories: overrides.stories ?? STORIES,
		stepId: 'step-1',
		sliceId: 'slice-1',
		cellLabel: 'Browse / Search, Release 1',
		onViewStory
	});
	return onViewStory;
}

describe('StoryDeck', () => {
	it('offers every story in the deck, not just the one on top', async () => {
		renderDeck();

		for (const story of STORIES) {
			await expect
				.element(page.getByTestId(`deck-story-${story.id}`))
				.toHaveTextContent(story.title);
		}
	});

	it('counts the stories under the stack', async () => {
		renderDeck();

		await expect
			.element(page.getByTestId('condensed-count-step-1-slice-1'))
			.toHaveTextContent('3 stories');
	});

	it('says "1 story" for a single-story deck', async () => {
		renderDeck({ stories: STORIES.slice(0, 1) });

		await expect
			.element(page.getByTestId('condensed-count-step-1-slice-1'))
			.toHaveTextContent('1 story');
	});

	// The deck is read-only like the rest of the grid (ADR 0011): a click opens
	// the detail dialog, which is the only place a description is legible.
	it('reports the story a card was activated for', async () => {
		const onViewStory = renderDeck();

		await page.getByRole('button', { name: 'View story Invite a teammate' }).click();

		expect(onViewStory).toHaveBeenCalledExactlyOnceWith('story-2');
	});

	// ADR 0021: colour is never the only carrier of a status, so the chip's
	// text has to survive into the condensed density too.
	it('keeps the status legible as text, not only as a tint', async () => {
		renderDeck();

		await expect.element(page.getByTestId('deck-story-story-1')).toHaveTextContent('In progress');
	});

	// BoardViewport's INTERACTIVE_SELECTOR is '[data-testid^="story-"], button,
	// a'. A deck testid with that prefix would make the pan handler treat the
	// whole cell as a card and refuse to pan from it.
	it('keeps the `story-` testid prefix off its chrome', async () => {
		renderDeck();

		const cell = page.getByTestId('condensed-cell-step-1-slice-1').element();
		expect(cell.querySelectorAll('[data-testid^="story-"]')).toHaveLength(0);
	});

	// `opacity-0`, not `hidden`: reaching a card by keyboard is what opens the
	// panel, and a `display: none` panel has nothing to reach.
	it('reveals the fanned-out panel when a card takes focus', async () => {
		renderDeck();

		const stack = page.getByRole('button', { name: /^Show the 3 stories/ }).element();
		expect(stack.getAttribute('aria-expanded')).toBe('false');

		(page.getByTestId('deck-story-story-1').element() as HTMLElement).focus();

		await expect
			.element(page.getByRole('button', { name: /^Show the 3 stories/ }))
			.toHaveAttribute('aria-expanded', 'true');
	});

	// The stack's click opens and never toggles. Reaching it with a mouse means
	// hovering it first, which has already opened the panel, so a toggle's only
	// reachable effect would be to shut what the hover just opened.
	it('keeps the panel open when the stack itself is clicked', async () => {
		renderDeck();

		const stack = page.getByRole('button', { name: /^Show the 3 stories/ });

		// `pointerenter` does not bubble, and the handler is on the cell, so a
		// synthetic event has to be aimed there rather than at the stack.
		page
			.getByTestId('condensed-cell-step-1-slice-1')
			.element()
			.dispatchEvent(new PointerEvent('pointerenter'));
		await tick();
		expect(stack.element().getAttribute('aria-expanded')).toBe('true');

		(stack.element() as HTMLElement).click();
		// Read the attribute after a flush rather than through a retrying
		// `expect.element`, which would settle on the pre-click DOM and pass
		// against a toggle too — the bug this test exists to catch.
		await tick();

		expect(stack.element().getAttribute('aria-expanded')).toBe('true');
	});

	it('draws no stack for an empty cell, only the count', async () => {
		renderDeck({ stories: [] });

		await expect
			.element(page.getByTestId('condensed-count-step-1-slice-1'))
			.toHaveTextContent('0 stories');
		expect(page.getByRole('button').elements()).toHaveLength(0);
	});
});

import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import type { ClientId, UserId } from '$lib/domain/ids';
import type { RemoteCursor } from '$lib/collab/map-sync.svelte';
import { participantColour } from '$lib/collab/participant-colour';
import RemoteCursors from './remote-cursors.svelte';

// Nothing covered these until now, which meant the collaboration demo could
// narrate "that is Bob's pointer, in his colour" over a board where cursors had
// silently stopped rendering.

function cursor(overrides: Partial<RemoteCursor> = {}): RemoteCursor {
	return {
		clientId: 'tab-1' as ClientId,
		// Deliberately hashes to a *different* palette entry than the clientId —
		// see the colour test, which is vacuous if the two agree by luck.
		userId: 'user-7' as UserId,
		displayName: 'Bob Lindqvist',
		x: 120,
		y: 80,
		...overrides
	};
}

describe('RemoteCursors', () => {
	it('renders nothing when nobody else is pointing at the board', async () => {
		const { container } = render(RemoteCursors, { cursors: [] });

		expect(container.querySelectorAll('[data-testid^="remote-cursor-"]')).toHaveLength(0);
	});

	it('names the person the pointer belongs to', async () => {
		render(RemoteCursors, { cursors: [cursor()] });

		await expect
			.element(page.getByTestId('remote-cursor-tab-1'))
			.toHaveTextContent('Bob Lindqvist');
	});

	it('positions the pointer in the board world coordinates it was given', async () => {
		// Both ends of the cursor wire speak unzoomed world pixels, and these
		// render inside the zoomed world element — so `zoom` and scroll apply for
		// free and there is deliberately no camera maths here (ADR 0010).
		render(RemoteCursors, { cursors: [cursor({ x: 250.5, y: 40 })] });

		const el = page.getByTestId('remote-cursor-tab-1').element() as HTMLElement;
		expect(el.style.left).toBe('250.5px');
		expect(el.style.top).toBe('40px');
	});

	it('never intercepts the pointer, so it cannot break a drag', async () => {
		// A cursor sits on top of the board at z-20. If it took pointer events it
		// would swallow drags near another person's pointer.
		render(RemoteCursors, { cursors: [cursor()] });

		const el = page.getByTestId('remote-cursor-tab-1').element();
		expect(getComputedStyle(el).pointerEvents).toBe('none');
	});

	it('is hidden from assistive technology', async () => {
		// Someone else's pointer position is ambient, not content; announcing every
		// move would be unusable.
		render(RemoteCursors, { cursors: [cursor()] });

		expect(page.getByTestId('remote-cursor-tab-1').element()).toHaveAttribute(
			'aria-hidden',
			'true'
		);
	});

	it('colours the pointer by person, not by tab, so it matches their avatar', async () => {
		// The claim the demo makes out loud. Keyed on userId rather than clientId,
		// which is what makes a colleague with two windows open one colour rather
		// than two.
		const byPerson = participantColour('user-7');
		const byTab = participantColour('tab-1');
		// Guard the guard: with only eight colours the two keys can collide, and
		// this test would then pass whichever one the component used. An earlier
		// version of this fixture did exactly that.
		expect(byPerson.text).not.toBe(byTab.text);

		render(RemoteCursors, { cursors: [cursor()] });

		const el = page.getByTestId('remote-cursor-tab-1').element();
		expect(el.querySelector('svg')?.getAttribute('class')).toContain(byPerson.text);
		expect(el.querySelector('span')?.getAttribute('class')).toContain(byPerson.bg);
	});

	it('gives two different people two different pointers', async () => {
		render(RemoteCursors, {
			cursors: [
				cursor(),
				cursor({ clientId: 'tab-2' as ClientId, userId: 'user-2' as UserId, displayName: 'Ada' })
			]
		});

		await expect.element(page.getByTestId('remote-cursor-tab-1')).toBeVisible();
		await expect.element(page.getByTestId('remote-cursor-tab-2')).toHaveTextContent('Ada');
	});
});

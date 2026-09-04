import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import type { ClientId, UserId } from '$lib/domain/ids';
import type { RemoteParticipant } from '$lib/collab/map-sync.svelte';
import { participantColour } from '$lib/collab/participant-colour';
import PresenceList from './presence-list.svelte';

function person(overrides: Partial<RemoteParticipant> = {}): RemoteParticipant {
	return {
		userId: 'user-7' as UserId,
		displayName: 'Bob Lindqvist',
		clientIds: ['tab-1' as ClientId],
		...overrides
	};
}

const ME = 'my-tab' as ClientId;

function avatars() {
	return [...page.getByTestId('presence').element().querySelectorAll('li')];
}

describe('PresenceList', () => {
	it('renders nothing when nobody is on the board', async () => {
		const { container } = render(PresenceList, { participants: [], selfClientId: ME });

		// Not an empty list: an empty <ul> would still take layout space in the
		// header beside the board title.
		expect(container.querySelector('[data-testid="presence"]')).toBeNull();
	});

	it('shows one avatar per person, with their initials', async () => {
		render(PresenceList, {
			participants: [person(), person({ userId: 'user-2' as UserId, displayName: 'Ada Lovelace' })],
			selfClientId: ME
		});

		expect(avatars().map((li) => li.textContent?.trim())).toEqual(['BL', 'AL']);
	});

	it('names the person on the label, since initials alone are a guess', async () => {
		render(PresenceList, { participants: [person()], selfClientId: ME });

		expect(avatars()[0]).toHaveAttribute('aria-label', 'Bob Lindqvist');
	});

	describe('recognising the viewer', () => {
		it('marks the viewer as themselves', async () => {
			render(PresenceList, {
				participants: [person({ clientIds: [ME] })],
				selfClientId: ME
			});

			expect(avatars()[0]).toHaveAttribute('aria-label', 'Bob Lindqvist (you)');
		});

		it('recognises the viewer by any of their open tabs', async () => {
			// The regression this check exists for. Presence carries one entry per
			// person with all their client ids; matching only the first meant a
			// second window showed its own account as a stranger.
			render(PresenceList, {
				participants: [person({ clientIds: ['tab-1' as ClientId, ME] })],
				selfClientId: ME
			});

			expect(avatars()[0]).toHaveAttribute('aria-label', 'Bob Lindqvist (you)');
		});

		it('lists the viewer first, wherever they arrived in the list', async () => {
			// A list you have to search for yourself in reads as a list of other
			// people with a stranger in it.
			render(PresenceList, {
				participants: [
					person({ userId: 'user-2' as UserId, displayName: 'Ada Lovelace' }),
					person({ clientIds: [ME] })
				],
				selfClientId: ME
			});

			expect(avatars().map((li) => li.getAttribute('aria-label'))).toEqual([
				'Bob Lindqvist (you)',
				'Ada Lovelace'
			]);
		});

		it('marks nobody when the viewer is not in the list', async () => {
			render(PresenceList, { participants: [person()], selfClientId: ME });

			expect(avatars()[0].getAttribute('aria-label')).not.toContain('(you)');
		});
	});

	it('colours the avatar by person, not by tab, so it matches their cursor', async () => {
		const byPerson = participantColour('user-7');
		const byTab = participantColour('tab-1');
		// Guard the guard: with eight palette entries the two keys can collide,
		// and this test would then pass whichever one the component used.
		expect(byPerson.bg).not.toBe(byTab.bg);

		render(PresenceList, { participants: [person()], selfClientId: ME });

		expect(avatars()[0].className).toContain(byPerson.bg);
	});

	it('shows one avatar for a person with two windows open', async () => {
		// Presence is per person; the client ids are only there to recognise the
		// viewer and to match cursors.
		render(PresenceList, {
			participants: [person({ clientIds: ['tab-1' as ClientId, 'tab-2' as ClientId] })],
			selfClientId: ME
		});

		expect(avatars()).toHaveLength(1);
	});
});

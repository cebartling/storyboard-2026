import { describe, expect, it } from 'vitest';
import { STORY_STATUSES } from '$lib/domain/story-map';
import {
	STORY_STATUS_OPTIONS,
	STORY_STATUS_PRESENTATION,
	type StoryStatusPresentation
} from './story-status';

describe('story status presentation', () => {
	it('covers every declared status', () => {
		// `Record<StoryStatus, …>` already makes a missing key a compile error.
		// This is the other half: a *sixth* key, left behind after a status is
		// renamed, which the type would happily accept.
		expect(Object.keys(STORY_STATUS_PRESENTATION).sort()).toEqual([...STORY_STATUSES].sort());
	});

	it('gives every status a distinct label', () => {
		const labels = STORY_STATUSES.map((s) => STORY_STATUS_PRESENTATION[s].label);
		expect(new Set(labels).size).toBe(labels.length);
	});

	it('names a distinct colour per status, written out in full', () => {
		// Tailwind scans source text for whole class names, so an assembled class
		// produces no CSS and the card renders untinted with nothing failing.
		// Two statuses sharing a token would be the quieter version of the same
		// bug: cards that are indistinguishable at a glance.
		const tints = STORY_STATUSES.map((s) => STORY_STATUS_PRESENTATION[s].card);
		expect(new Set(tints).size).toBe(tints.length);
		for (const status of STORY_STATUSES) {
			const { card, chip }: StoryStatusPresentation = STORY_STATUS_PRESENTATION[status];
			expect(card).toContain(`bg-status-${status}/8`);
			expect(chip).toContain(`text-status-${status}`);
		}
	});

	it('offers the options in workflow order', () => {
		expect(STORY_STATUS_OPTIONS.map((o) => o.value)).toEqual([...STORY_STATUSES]);
		expect(STORY_STATUS_OPTIONS[0].label).toBe('Backlog');
	});
});

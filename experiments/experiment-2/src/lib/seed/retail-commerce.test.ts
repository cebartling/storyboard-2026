import { describe, expect, it } from 'vitest';
import {
	buildRetailCommerceMap,
	retailCommerceBlueprint,
	retailCommerceSliceNames,
	storyDescription
} from './retail-commerce';
import type { Story, StoryMap } from '$lib/domain/story-map';

function sortByRank<T extends { rank: string }>(items: T[]): T[] {
	return [...items].sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
}

function storiesForStep(map: StoryMap, stepId: string): Story[] {
	return sortByRank(map.stories.filter((s) => s.stepId === stepId));
}

describe('retailCommerceBlueprint', () => {
	// Pinned rather than a "big enough" floor because README.md, CLAUDE.md and
	// this module's header all quote these counts. If you change the
	// blueprint, this test is the reminder to change them too.
	it('has the activity, step, slice and story counts the docs quote', () => {
		const stepCount = retailCommerceBlueprint.reduce((n, a) => n + a.steps.length, 0);
		const storyCount = retailCommerceBlueprint.reduce(
			(n, a) => n + a.steps.reduce((m, s) => m + s.stories.length, 0),
			0
		);
		expect(retailCommerceBlueprint.length).toBe(12);
		expect(stepCount).toBe(43);
		expect(retailCommerceSliceNames.length).toBe(3);
		expect(storyCount).toBe(157);
	});

	it('names every activity, step and story uniquely enough to identify on the board', () => {
		const activityNames = retailCommerceBlueprint.map((a) => a.name);
		expect(new Set(activityNames).size).toBe(activityNames.length);

		for (const activity of retailCommerceBlueprint) {
			const stepNames = activity.steps.map((s) => s.name);
			expect(new Set(stepNames).size).toBe(stepNames.length);
			for (const step of activity.steps) {
				const titles = step.stories.map((s) => s.title);
				expect(new Set(titles).size).toBe(titles.length);
			}
		}
	});

	it('only references slices it declares, and leaves some stories unsliced', () => {
		const declared = new Set<string | null>([...retailCommerceSliceNames, null]);
		const used = new Set<string | null>();
		for (const activity of retailCommerceBlueprint) {
			for (const step of activity.steps) {
				for (const story of step.stories) {
					expect(declared.has(story.slice)).toBe(true);
					used.add(story.slice);
				}
			}
		}
		expect(used.has(null)).toBe(true);
		for (const name of retailCommerceSliceNames) {
			expect(used.has(name)).toBe(true);
		}
	});
});

describe('buildRetailCommerceMap', () => {
	it('builds one story map named for the sample domain', () => {
		const map = buildRetailCommerceMap();
		expect(map.name).toBe('Retail Commerce Platform');
		expect(map.version).toBe(0);
	});

	it('keeps the created date it is given', () => {
		const createdAt = new Date('2026-01-15T09:00:00.000Z');
		expect(buildRetailCommerceMap(createdAt).createdAt).toEqual(createdAt);
	});

	it('lays activities, steps and slices out in blueprint order', () => {
		const map = buildRetailCommerceMap();

		expect(sortByRank(map.activities).map((a) => a.name)).toEqual(
			retailCommerceBlueprint.map((a) => a.name)
		);
		expect(sortByRank(map.slices).map((s) => s.name)).toEqual([...retailCommerceSliceNames]);

		for (const [index, activity] of sortByRank(map.activities).entries()) {
			expect(sortByRank(activity.steps).map((s) => s.name)).toEqual(
				retailCommerceBlueprint[index].steps.map((s) => s.name)
			);
		}
	});

	it('attaches every blueprint story to its step, slice and description', () => {
		const map = buildRetailCommerceMap();
		const sliceNameById = new Map(map.slices.map((s) => [s.id as string, s.name]));

		for (const [activityIndex, activity] of sortByRank(map.activities).entries()) {
			for (const [stepIndex, step] of sortByRank(activity.steps).entries()) {
				const expected = retailCommerceBlueprint[activityIndex].steps[stepIndex].stories;
				const actual = storiesForStep(map, step.id);
				expect(actual.map((s) => s.title).sort()).toEqual(expected.map((s) => s.title).sort());
				for (const story of actual) {
					const blueprint = expected.find((s) => s.title === story.title)!;
					expect(story.description).toBe(storyDescription(blueprint));
					expect(story.sliceId === null ? null : sliceNameById.get(story.sliceId)).toBe(
						blueprint.slice
					);
				}
			}
		}
	});

	// The builder's only real behaviour: `addStory` appends with a rank scoped
	// to (stepId, sliceId) (ADR 0005), so each band of a step must come out in
	// blueprint order. The test above deliberately compares sorted titles —
	// it is about membership — which would not catch an ordering regression.
	it('orders stories within each (step, slice) scope in blueprint order', () => {
		const map = buildRetailCommerceMap();
		const sliceIdByName = new Map(map.slices.map((s) => [s.name, s.id as string]));

		for (const [activityIndex, activity] of sortByRank(map.activities).entries()) {
			for (const [stepIndex, step] of sortByRank(activity.steps).entries()) {
				const expected = retailCommerceBlueprint[activityIndex].steps[stepIndex].stories;

				for (const sliceName of [null, ...retailCommerceSliceNames]) {
					const sliceId = sliceName === null ? null : sliceIdByName.get(sliceName)!;
					const band = sortByRank(
						map.stories.filter((s) => s.stepId === step.id && s.sliceId === sliceId)
					);
					expect(band.map((s) => s.title)).toEqual(
						expected.filter((s) => s.slice === sliceName).map((s) => s.title)
					);
				}
			}
		}
	});

	it('gives every entity a distinct id', () => {
		const map = buildRetailCommerceMap();
		const ids = [
			...map.activities.map((a) => a.id as string),
			...map.activities.flatMap((a) => a.steps.map((s) => s.id as string)),
			...map.slices.map((s) => s.id as string),
			...map.stories.map((s) => s.id as string)
		];
		expect(new Set(ids).size).toBe(ids.length);
	});

	// The seed is the only realistic corpus this app has for the description
	// renderer (ADR 0018), so its shape is worth pinning: a description that
	// quietly lost its criteria would still look fine on the board.
	describe('composed descriptions', () => {
		const stories = retailCommerceBlueprint.flatMap((a) => a.steps.flatMap((s) => s.stories));

		it('gives every story a narrative and at least one criterion', () => {
			for (const story of stories) {
				expect(story.narrative.length, story.title).toBeGreaterThan(0);
				expect(story.criteria.length, story.title).toBeGreaterThan(0);
			}
		});

		it('renders criteria as a GFM task list under a heading', () => {
			const description = storyDescription({
				title: 'x',
				slice: null,
				narrative: 'As a shopper I **do a thing** so that it happens.',
				criteria: [
					['already true', true],
					['not yet', false]
				]
			});

			expect(description).toBe(
				'As a shopper I **do a thing** so that it happens.\n\n' +
					'## Acceptance criteria\n\n' +
					'- [x] already true\n' +
					'- [ ] not yet'
			);
		});

		it('appends a note as a trailing block when there is one', () => {
			const description = storyDescription({
				title: 'x',
				slice: null,
				narrative: 'n',
				criteria: [['c', false]],
				note: '> a caveat'
			});

			expect(description.endsWith('\n\n> a caveat')).toBe(true);
		});

		// Every construct the renderer supports should appear somewhere in the
		// corpus, or the seed stops being useful for exercising it.
		it('exercises the renderer across the corpus', () => {
			const all = stories.map(storyDescription).join('\n');

			expect(all).toContain('**');
			expect(all).toContain('## Acceptance criteria');
			expect(all).toContain('- [x] ');
			expect(all).toContain('- [ ] ');
			expect(all).toContain('`');
			expect(all).toContain('| --- |');
			expect(all).toContain('> ');
			expect(all).toContain('](https://');
		});
	});
});

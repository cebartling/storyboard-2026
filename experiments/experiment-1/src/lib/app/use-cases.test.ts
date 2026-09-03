import { describe, expect, it } from 'vitest';
import { InMemoryStoryMapRepository } from './in-memory-story-map-repository';
import * as useCases from './use-cases';
import { suggestStoriesForStep } from './use-cases';
import type { AiAssistant, StepSnapshot, StorySuggestion } from '$lib/domain/ports';
import type { ActivityId, MapId, SliceId, StepId, StoryId } from '$lib/domain/ids';
import { addActivity, addSlice, addStep, addStory, createStoryMap } from '$lib/domain/story-map';
import { InvariantError } from '$lib/domain/errors';

/**
 * Records what the use case handed the port. The point of ADR 0007's contract
 * is the *shape* of that call — a domain snapshot in, structured suggestions
 * out — so the double captures the snapshot rather than just counting calls.
 */
class RecordingAssistant implements AiAssistant {
	readonly calls: StepSnapshot[] = [];

	constructor(private readonly reply: StorySuggestion[] = []) {}

	async suggestStoriesForStep(snapshot: StepSnapshot): Promise<StorySuggestion[]> {
		this.calls.push(snapshot);
		return this.reply;
	}
}

function mapWithAStep() {
	let map = createStoryMap('Retail');
	const activity = addActivity(map, 'Browse');
	map = activity.map;
	const step = addStep(map, activity.activity.id, 'Search products');
	map = step.map;
	const other = addStep(map, activity.activity.id, 'Compare products');
	map = other.map;

	map = addStory(map, step.step.id, 'Keyword search').map;
	map = addStory(map, step.step.id, 'Filter by category').map;
	// A story on a different step, to prove the snapshot is scoped.
	map = addStory(map, other.step.id, 'Side-by-side compare').map;

	return { map, stepId: step.step.id, activityName: activity.activity.name };
}

describe('suggestStoriesForStep', () => {
	it('builds the snapshot from the aggregate and returns what the assistant suggests', async () => {
		const { map, stepId, activityName } = mapWithAStep();
		const repository = new InMemoryStoryMapRepository([map]);
		const assistant = new RecordingAssistant([
			{ title: 'Search by SKU', description: null, confidence: 0.8 }
		]);

		const suggestions = await suggestStoriesForStep(repository, assistant, map.id, stepId);

		expect(assistant.calls).toEqual([
			{
				stepName: 'Search products',
				activityName,
				existingStoryTitles: ['Keyword search', 'Filter by category']
			}
		]);
		expect(suggestions).toEqual([{ title: 'Search by SKU', description: null, confidence: 0.8 }]);
	});

	it('suggests nothing rather than failing when the assistant has nothing', async () => {
		const { map, stepId } = mapWithAStep();
		const repository = new InMemoryStoryMapRepository([map]);

		const suggestions = await suggestStoriesForStep(
			repository,
			new RecordingAssistant(),
			map.id,
			stepId
		);

		expect(suggestions).toEqual([]);
	});

	// Suggesting is read-only: it must not bump the version and so must not
	// make a concurrent editor's in-flight save conflict.
	it('does not write, so it cannot make a concurrent edit conflict', async () => {
		const { map, stepId } = mapWithAStep();
		const repository = new InMemoryStoryMapRepository([map]);
		const before = (await repository.load(map.id))!.version;

		await suggestStoriesForStep(repository, new RecordingAssistant(), map.id, stepId);

		expect((await repository.load(map.id))!.version).toBe(before);
	});

	it('rejects a step that is not in the map', async () => {
		const { map } = mapWithAStep();
		const repository = new InMemoryStoryMapRepository([map]);

		await expect(
			suggestStoriesForStep(repository, new RecordingAssistant(), map.id, 'no-such-step' as StepId)
		).rejects.toThrow(InvariantError);
	});
});

/**
 * Every mutating use case is the same three lines — load, call the domain,
 * save — so what is worth testing is the property they share rather than
 * eleven near-identical scripts. Two things can go wrong in that shape and
 * both are silent: forgetting the `save`, which makes the call a no-op the
 * caller cannot detect, and threading a version other than the loaded one,
 * which would defeat the lost-update guard.
 */
describe('mutating use cases', () => {
	async function seeded() {
		let map = createStoryMap('Retail');
		const activity = addActivity(map, 'Browse');
		map = activity.map;
		const step = addStep(map, activity.activity.id, 'Search products');
		map = step.map;
		const slice = addSlice(map, 'Release 1');
		map = slice.map;
		const story = addStory(map, step.step.id, 'Keyword search');
		map = story.map;

		const repository = new InMemoryStoryMapRepository([map]);
		return {
			repository,
			mapId: map.id,
			activityId: activity.activity.id as ActivityId,
			stepId: step.step.id as StepId,
			sliceId: slice.slice.id as SliceId,
			storyId: story.story.id as StoryId,
			version: map.version
		};
	}

	type Case = { name: string; run: (ctx: Awaited<ReturnType<typeof seeded>>) => Promise<unknown> };

	const cases: Case[] = [
		{ name: 'addActivity', run: (c) => useCases.addActivity(c.repository, c.mapId, 'Checkout') },
		{ name: 'addStep', run: (c) => useCases.addStep(c.repository, c.mapId, c.activityId, 'Pay') },
		{ name: 'createSlice', run: (c) => useCases.createSlice(c.repository, c.mapId, 'Release 2') },
		{ name: 'addStory', run: (c) => useCases.addStory(c.repository, c.mapId, c.stepId, 'Filter') },
		{
			name: 'renameActivity',
			run: (c) => useCases.renameActivity(c.repository, c.mapId, c.activityId, 'Discover')
		},
		{
			name: 'renameStep',
			run: (c) => useCases.renameStep(c.repository, c.mapId, c.stepId, 'Find')
		},
		{
			name: 'renameSlice',
			run: (c) => useCases.renameSlice(c.repository, c.mapId, c.sliceId, 'MVP')
		},
		{
			name: 'editStory',
			run: (c) => useCases.editStory(c.repository, c.mapId, c.storyId, { title: 'Search by SKU' })
		},
		{
			name: 'deleteActivity',
			run: (c) => useCases.deleteActivity(c.repository, c.mapId, c.activityId)
		},
		{ name: 'deleteStep', run: (c) => useCases.deleteStep(c.repository, c.mapId, c.stepId) },
		{ name: 'deleteSlice', run: (c) => useCases.deleteSlice(c.repository, c.mapId, c.sliceId) },
		{ name: 'deleteStory', run: (c) => useCases.deleteStory(c.repository, c.mapId, c.storyId) },
		{
			name: 'moveStory',
			run: (c) =>
				useCases.moveStory(c.repository, c.mapId, c.storyId, c.stepId, c.sliceId, null, null)
		}
	];

	for (const { name, run } of cases) {
		it(`${name} persists its change`, async () => {
			const ctx = await seeded();

			await run(ctx);

			// The version only moves when `save` is reached, so this catches a
			// use case that computed a new aggregate and dropped it.
			const after = (await ctx.repository.load(ctx.mapId))!;
			expect(after.version).toBe(ctx.version + 1);
		});

		it(`${name} refuses a map that does not exist`, async () => {
			const ctx = await seeded();

			await expect(run({ ...ctx, mapId: 'missing-map' as MapId })).rejects.toThrow(InvariantError);
		});
	}

	// The one use case with logic of its own beyond delegation: a partial edit
	// must leave the untouched field alone, and `null` has to clear a
	// description where `undefined` means "not supplied".
	it('editStory applies only the fields it was given', async () => {
		const ctx = await seeded();
		await useCases.editStory(ctx.repository, ctx.mapId, ctx.storyId, {
			description: 'Accepts partial words'
		});

		const after = (await ctx.repository.load(ctx.mapId))!;
		const story = after.stories.find((s) => s.id === ctx.storyId)!;
		expect(story.title).toBe('Keyword search');
		expect(story.description).toBe('Accepts partial words');
	});
});

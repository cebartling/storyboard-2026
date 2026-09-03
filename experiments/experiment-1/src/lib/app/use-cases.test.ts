import { describe, expect, it } from 'vitest';
import { InMemoryStoryMapRepository } from './in-memory-story-map-repository';
import { suggestStoriesForStep } from './use-cases';
import type { AiAssistant, StepSnapshot, StorySuggestion } from '$lib/domain/ports';
import type { StepId } from '$lib/domain/ids';
import { addActivity, addStep, addStory, createStoryMap } from '$lib/domain/story-map';
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

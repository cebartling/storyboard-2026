import { describe, expect, it } from 'vitest';
import { InMemoryStoryMapRepository } from './in-memory-story-map-repository';
import * as useCases from './use-cases';
import { suggestStoriesForStep } from './use-cases';
import type {
	AiAssistant,
	Caller,
	MapAccess,
	StepSnapshot,
	StoryMapRepository,
	StorySuggestion
} from '$lib/domain/ports';

/** Every use case now acts as somebody (ADR 0015). */
import {
	type ActivityId,
	type MapId,
	type SliceId,
	type StepId,
	type StoryId,
	type UserId
} from '$lib/domain/ids';
import { addActivity, addSlice, addStep, addStory, createStoryMap } from '$lib/domain/story-map';
import { ConflictError, InvariantError } from '$lib/domain/errors';

/** Every use case now acts as somebody (ADR 0015). */
const caller: Caller = { userId: 'test-caller' as UserId };

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
		const repository = new InMemoryStoryMapRepository([{ map: map, owner: caller.userId }]);
		const assistant = new RecordingAssistant([
			{ title: 'Search by SKU', description: null, confidence: 0.8 }
		]);

		const suggestions = await suggestStoriesForStep(repository, assistant, caller, map.id, stepId);

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
		const repository = new InMemoryStoryMapRepository([{ map: map, owner: caller.userId }]);

		const suggestions = await suggestStoriesForStep(
			repository,
			new RecordingAssistant(),
			caller,
			map.id,
			stepId
		);

		expect(suggestions).toEqual([]);
	});

	// Suggesting is read-only: it must not bump the version and so must not
	// make a concurrent editor's in-flight save conflict.
	it('does not write, so it cannot make a concurrent edit conflict', async () => {
		const { map, stepId } = mapWithAStep();
		const repository = new InMemoryStoryMapRepository([{ map: map, owner: caller.userId }]);
		const before = (await repository.load(caller, map.id))!.map.version;

		await suggestStoriesForStep(repository, new RecordingAssistant(), caller, map.id, stepId);

		expect((await repository.load(caller, map.id))!.map.version).toBe(before);
	});

	it('rejects a step that is not in the map', async () => {
		const { map } = mapWithAStep();
		const repository = new InMemoryStoryMapRepository([{ map: map, owner: caller.userId }]);

		await expect(
			suggestStoriesForStep(
				repository,
				new RecordingAssistant(),
				caller,
				map.id,
				'no-such-step' as StepId
			)
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

		const repository = new InMemoryStoryMapRepository([{ map: map, owner: caller.userId }]);
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
		{
			name: 'addActivity',
			run: (c) => useCases.addActivity(c.repository, caller, c.mapId, c.version, 'Checkout')
		},
		{
			name: 'addStep',
			run: (c) => useCases.addStep(c.repository, caller, c.mapId, c.version, c.activityId, 'Pay')
		},
		{
			name: 'createSlice',
			run: (c) => useCases.createSlice(c.repository, caller, c.mapId, c.version, 'Release 2')
		},
		{
			name: 'addStory',
			run: (c) => useCases.addStory(c.repository, caller, c.mapId, c.version, c.stepId, 'Filter')
		},
		{
			name: 'renameActivity',
			run: (c) =>
				useCases.renameActivity(c.repository, caller, c.mapId, c.version, c.activityId, 'Discover')
		},
		{
			name: 'renameStep',
			run: (c) => useCases.renameStep(c.repository, caller, c.mapId, c.version, c.stepId, 'Find')
		},
		{
			name: 'renameSlice',
			run: (c) => useCases.renameSlice(c.repository, caller, c.mapId, c.version, c.sliceId, 'MVP')
		},
		{
			name: 'editStory',
			run: (c) =>
				useCases.editStory(c.repository, caller, c.mapId, c.version, c.storyId, {
					title: 'Search by SKU'
				})
		},
		{
			name: 'deleteActivity',
			run: (c) => useCases.deleteActivity(c.repository, caller, c.mapId, c.version, c.activityId)
		},
		{
			name: 'deleteStep',
			run: (c) => useCases.deleteStep(c.repository, caller, c.mapId, c.version, c.stepId)
		},
		{
			name: 'deleteSlice',
			run: (c) => useCases.deleteSlice(c.repository, caller, c.mapId, c.version, c.sliceId)
		},
		{
			name: 'deleteStory',
			run: (c) => useCases.deleteStory(c.repository, caller, c.mapId, c.version, c.storyId)
		},
		{
			name: 'moveStory',
			run: (c) =>
				useCases.moveStory(
					c.repository,
					caller,
					c.mapId,
					c.version,
					c.storyId,
					c.stepId,
					c.sliceId,
					null,
					null
				)
		}
	];

	for (const { name, run } of cases) {
		it(`${name} persists its change`, async () => {
			const ctx = await seeded();

			await run(ctx);

			// The version only moves when `save` is reached, so this catches a
			// use case that computed a new aggregate and dropped it.
			const after = (await ctx.repository.load(caller, ctx.mapId))!.map;
			expect(after.version).toBe(ctx.version + 1);
		});

		it(`${name} refuses a map that does not exist`, async () => {
			const ctx = await seeded();

			await expect(run({ ...ctx, mapId: 'missing-map' as MapId })).rejects.toThrow(InvariantError);
		});

		it(`${name} rejects a stale version and writes nothing`, async () => {
			// The client sends the version its editor was opened at. If the board
			// has moved on since, this is the stale-editor case ADR 0014 §3 exists
			// for: refuse it rather than let it overwrite whoever got there first.
			const ctx = await seeded();

			await expect(run({ ...ctx, version: ctx.version + 1 })).rejects.toThrow(ConflictError);

			const after = (await ctx.repository.load(caller, ctx.mapId))!.map;
			expect(after.version).toBe(ctx.version);
		});
	}

	// The one use case with logic of its own beyond delegation: a partial edit
	// must leave the untouched field alone, and `null` has to clear a
	// description where `undefined` means "not supplied".
	it('editStory applies only the fields it was given', async () => {
		const ctx = await seeded();
		await useCases.editStory(ctx.repository, caller, ctx.mapId, ctx.version, ctx.storyId, {
			description: 'Accepts partial words'
		});

		const after = (await ctx.repository.load(caller, ctx.mapId))!.map;
		const story = after.stories.find((s) => s.id === ctx.storyId)!;
		expect(story.title).toBe('Keyword search');
		expect(story.description).toBe('Accepts partial words');
	});
});

describe('deleteMap', () => {
	async function seededMap() {
		let map = createStoryMap('Retail');
		const activity = addActivity(map, 'Browse');
		map = activity.map;
		const step = addStep(map, activity.activity.id, 'Search products');
		map = step.map;
		map = addStory(map, step.step.id, 'Keyword search').map;
		return {
			repository: new InMemoryStoryMapRepository([{ map: map, owner: caller.userId }]),
			mapId: map.id
		};
	}

	it('removes the map so it can no longer be loaded or listed', async () => {
		const { repository, mapId } = await seededMap();

		await useCases.deleteMap(repository, caller, mapId);

		expect(await repository.load(caller, mapId)).toBeNull();
		expect(await repository.listSummaries(caller)).toEqual([]);
	});

	// Deleting is the one destructive action reachable from the map list, and
	// the list is built from ids the page just rendered — so a missing map means
	// someone else deleted it first, not a malformed request. Succeeding
	// silently is the right answer: the caller wanted it gone and it is gone.
	it('is idempotent, so a double submit is not an error', async () => {
		const { repository, mapId } = await seededMap();

		await useCases.deleteMap(repository, caller, mapId);

		await expect(useCases.deleteMap(repository, caller, mapId)).resolves.toBeUndefined();
	});
});

describe('concurrent writers', () => {
	/**
	 * Wraps a repository so `load()` can be held open, which is what lets a test
	 * interleave two writers deterministically rather than hoping the event loop
	 * cooperates.
	 */
	class GatedRepository implements StoryMapRepository {
		private gates: Array<() => void> = [];
		private inFlightLoads = 0;
		/** How many times a load began while another was still open. */
		overlappingLoads = 0;

		constructor(private readonly inner: StoryMapRepository) {}

		/** Releases every load currently waiting, in the order they arrived. */
		openGates(): void {
			const waiting = this.gates;
			this.gates = [];
			for (const open of waiting) open();
		}

		get waiting(): number {
			return this.gates.length;
		}

		async load(caller: Caller, id: MapId): Promise<MapAccess | null> {
			if (this.inFlightLoads > 0) this.overlappingLoads += 1;
			this.inFlightLoads += 1;
			try {
				await new Promise<void>((resolve) => this.gates.push(resolve));
				return await this.inner.load(caller, id);
			} finally {
				this.inFlightLoads -= 1;
			}
		}
		save: StoryMapRepository['save'] = (...args) => this.inner.save(...args);
		listSummaries: StoryMapRepository['listSummaries'] = (...args) =>
			this.inner.listSummaries(...args);
		delete: StoryMapRepository['delete'] = (...args) => this.inner.delete(...args);
		addMember: StoryMapRepository['addMember'] = (...args) => this.inner.addMember(...args);
		roleOf: StoryMapRepository['roleOf'] = (...args) => this.inner.roleOf(...args);
	}

	async function seededMap() {
		const map = createStoryMap('Retail');
		const repository = new InMemoryStoryMapRepository([{ map: map, owner: caller.userId }]);
		return { repository, mapId: map.id };
	}

	it('rejects the second of two concurrent writers rather than letting either overwrite the other', async () => {
		// Both callers hold the version the board had when their editor opened.
		// The lock makes them sequential; the version check then decides who wins,
		// and the loser gets a ConflictError instead of silently clobbering the
		// winner. Two editors on one board conflicting even when they touch
		// different cards is the known cost of a single whole-map version
		// (ADR 0014); ADR 0014 §5's notify-and-refetch is what keeps the loser's
		// next attempt from being stale for long.
		const { repository, mapId } = await seededMap();
		const gated = new GatedRepository(repository);

		const first = useCases.addActivity(gated, caller, mapId, 0, 'Browse');
		const second = useCases.addActivity(gated, caller, mapId, 0, 'Checkout');

		const outcomes = Promise.allSettled([first, second]);
		let settled = false;
		void outcomes.then(() => (settled = true));
		while (!settled) {
			gated.openGates();
			await new Promise((resolve) => setTimeout(resolve, 0));
		}

		const results = await outcomes;
		const rejected = results.filter((r) => r.status === 'rejected');
		expect(rejected).toHaveLength(1);
		expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);

		// Exactly one activity landed, and the map advanced exactly one version.
		const saved = (await repository.load(caller, mapId))?.map;
		expect(saved?.activities).toHaveLength(1);
		expect(saved?.version).toBe(1);
	});

	it('serialises writers, so no two ever compute a rank against the same state', async () => {
		// The lock is what stops both callers reaching the domain's rank maths
		// concurrently. `rank.ts` wraps generateKeyBetween, which is deterministic
		// and carries no actor entropy, so two inserts computed against identical
		// state produce byte-identical keys — and the unique indexes turn a leaked
		// duplicate into a 500 rather than a merge (ADR 0014, "Fractional ranks
		// collide"). Sequencing them means the survivor always reads committed
		// state, whichever one that is.
		const { repository, mapId } = await seededMap();
		const gated = new GatedRepository(repository);

		const first = useCases.addActivity(gated, caller, mapId, 0, 'Browse');
		const second = useCases.addActivity(gated, caller, mapId, 0, 'Checkout');
		const outcomes = Promise.allSettled([first, second]);
		let settled = false;
		void outcomes.then(() => (settled = true));
		while (!settled) {
			gated.openGates();
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
		await outcomes;

		// The two loads never overlapped: the second began only after the first
		// had saved, which is the property the lock exists to provide.
		expect(gated.overlappingLoads).toBe(0);
	});
});

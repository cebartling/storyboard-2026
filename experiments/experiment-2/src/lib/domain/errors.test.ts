import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, InvariantError } from './errors';
import {
	addActivity,
	addSlice,
	addStep,
	addStory,
	createStoryMap,
	deleteActivity,
	editStory,
	moveStory,
	renameStep
} from './story-map';
import type { ActivityId, StepId, StoryId } from './ids';

/**
 * The route layer distinguishes a caller's mistake (400) from a lost-update
 * conflict (409) from a server fault (500) by error type, never by message
 * text — so the domain has to actually throw the typed errors.
 */
describe('domain error types', () => {
	it('throws InvariantError for an unknown activity id', () => {
		const map = createStoryMap('Test map');
		expect(() => deleteActivity(map, 'nope' as ActivityId)).toThrow(InvariantError);
	});

	it('throws InvariantError for an unknown step id', () => {
		const map = createStoryMap('Test map');
		expect(() => renameStep(map, 'nope' as StepId, 'New name')).toThrow(InvariantError);
	});

	it('throws InvariantError when adding a story to a step that does not exist', () => {
		const map = createStoryMap('Test map');
		expect(() => addStory(map, 'nope' as StepId, 'A story')).toThrow(InvariantError);
	});

	it('throws InvariantError when moving a story that does not exist', () => {
		const map = createStoryMap('Test map');
		expect(() => moveStory(map, 'nope' as StoryId, 'nope' as StepId, null, null, null)).toThrow(
			InvariantError
		);
	});

	it('keeps InvariantError and ConflictError distinguishable', () => {
		expect(new InvariantError('x')).toBeInstanceOf(Error);
		expect(new ConflictError('x')).toBeInstanceOf(Error);
		expect(new ConflictError('x')).not.toBeInstanceOf(InvariantError);
		expect(new InvariantError('x').name).toBe('InvariantError');
		expect(new ConflictError('x').name).toBe('ConflictError');
	});

	it('rejects an ambiguous move: no neighbours given for a non-empty scope', () => {
		let map = createStoryMap('Test map');
		const activity = addActivity(map, 'Find groceries');
		map = activity.map;
		const step = addStep(map, activity.activity.id, 'Search');
		map = step.map;
		const first = addStory(map, step.step.id, 'Keyword search');
		map = first.map;
		const second = addStory(map, step.step.id, 'Browse');
		map = second.map;

		// Dropping into a populated cell always has at least one neighbour, so
		// a payload with neither can only mean the client got them wrong.
		expect(() => moveStory(map, second.story.id, step.step.id, null, null, null)).toThrow(
			InvariantError
		);
	});

	it('still appends when the target scope is genuinely empty', () => {
		let map = createStoryMap('Test map');
		const activity = addActivity(map, 'Find groceries');
		map = activity.map;
		const step = addStep(map, activity.activity.id, 'Search');
		map = step.map;
		const slice = addSlice(map, 'Release 1');
		map = slice.map;
		const story = addStory(map, step.step.id, 'Keyword search');
		map = story.map;

		// Moving into the empty Release 1 band: no neighbours is correct here.
		const moved = moveStory(map, story.story.id, step.step.id, slice.slice.id, null, null);
		expect(moved.stories[0].sliceId).toBe(slice.slice.id);
	});
});

describe('editStory field handling', () => {
	it('does not blank a field when a change is explicitly undefined', () => {
		let map = createStoryMap('Test map');
		const activity = addActivity(map, 'Find groceries');
		map = activity.map;
		const step = addStep(map, activity.activity.id, 'Search');
		map = step.map;
		const story = addStory(map, step.step.id, 'Keyword search', { description: 'original' });
		map = story.map;

		const edited = editStory(map, story.story.id, { title: undefined });

		expect(edited.stories[0].title).toBe('Keyword search');
		expect(edited.stories[0].description).toBe('original');
	});

	it('still clears a description set explicitly to null', () => {
		let map = createStoryMap('Test map');
		const activity = addActivity(map, 'Find groceries');
		map = activity.map;
		const step = addStep(map, activity.activity.id, 'Search');
		map = step.map;
		const story = addStory(map, step.step.id, 'Keyword search', { description: 'original' });
		map = story.map;

		const edited = editStory(map, story.story.id, { description: null });

		expect(edited.stories[0].description).toBeNull();
	});
});

/**
 * `ForbiddenError` is the third of the three (ADR 0016). It is not a variant of
 * InvariantError: "you may not do this" and "this request does not make sense"
 * map to different statuses and different remedies, and the route layer
 * dispatches on type rather than message text.
 */
describe('ForbiddenError', () => {
	it('is distinguishable from the other domain errors', () => {
		const forbidden = new ForbiddenError('Only the owner can delete this map.');

		expect(forbidden).toBeInstanceOf(ForbiddenError);
		expect(forbidden).not.toBeInstanceOf(InvariantError);
		expect(forbidden).not.toBeInstanceOf(ConflictError);
		expect(forbidden.name).toBe('ForbiddenError');
	});

	it('keeps a message written for the person who made the request', () => {
		expect(new ForbiddenError('Only the owner can delete this map.').message).toBe(
			'Only the owner can delete this map.'
		);
	});
});

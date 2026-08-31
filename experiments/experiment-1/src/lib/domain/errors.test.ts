import { describe, expect, it } from 'vitest';
import { ConflictError, InvariantError } from './errors';
import { addStory, createStoryMap, deleteActivity, moveStory, renameStep } from './story-map';
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
});

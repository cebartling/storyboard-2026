import { describe, expect, it, vi, afterEach } from 'vitest';
import { runAction } from './run-action';
import { ConflictError, ForbiddenError, InvariantError } from '$lib/domain/errors';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('runAction', () => {
	it('returns undefined when the action succeeds', async () => {
		await expect(runAction('addActivity', async () => {})).resolves.toBeUndefined();
	});

	it('maps InvariantError to a 400 carrying the message', async () => {
		const result = await runAction('addActivity', async () => {
			throw new InvariantError('Activity name is required.');
		});

		expect(result).toMatchObject({
			status: 400,
			data: { error: 'Activity name is required.' }
		});
	});

	it('maps ConflictError to a 409 with a message the user can act on', async () => {
		const result = await runAction('moveStory', async () => {
			throw new ConflictError('Story map m1 changed since it was loaded (expected 3, current 4)');
		});

		expect(result).toMatchObject({ status: 409 });
		const message = (result as { data: { error: string } }).data.error;
		// The internal version numbers are an operator detail, not something to
		// put in front of the user — but the remedy has to be stated.
		expect(message).not.toMatch(/version|\b3\b|\b4\b/i);
		// And the remedy is no longer "reload": the client refreshes the board
		// itself and keeps what the user typed, so telling them to reload would
		// be telling them to throw their own edit away (ADR 0014 §3, and §5 once
		// the board refreshes on its own).
		expect(message).not.toMatch(/reload/i);
		expect(message).toMatch(/refreshed.*save again/i);
	});

	it('maps an unexpected fault to a 500 with a generic message', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const result = await runAction('addStory', async () => {
			throw new Error('MongoNetworkError: connection 1 to 127.0.0.1:27017 closed');
		});

		expect(result).toMatchObject({ status: 500 });
		expect((result as { data: { error: string } }).data.error).not.toMatch(
			/MongoNetworkError|27017/
		);
	});

	it('logs the unexpected fault server-side with its action label', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const fault = new Error('MongoNetworkError: connection 1 to 127.0.0.1:27017 closed');

		await runAction('addStory', async () => {
			throw fault;
		});

		expect(consoleError).toHaveBeenCalledWith('action addStory failed', fault);
	});

	it('does not log expected client errors', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		await runAction('addActivity', async () => {
			throw new InvariantError('Activity name is required.');
		});

		expect(consoleError).not.toHaveBeenCalled();
	});

	it('maps ForbiddenError to a 403 with the message it was given', async () => {
		// A 403, not a redirect: the caller is logged in and the answer is "not
		// yours", which the dialog already knows how to render. Unlike the 500
		// path, this message is written for the person who made the request, so
		// it is safe — and useful — to show (ADR 0015).
		const result = await runAction('deleteMap', async () => {
			throw new ForbiddenError('Only the owner can delete this map.');
		});

		expect(result).toMatchObject({ status: 403 });
		expect((result as { data: { error: string } }).data.error).toBe(
			'Only the owner can delete this map.'
		);
	});
});

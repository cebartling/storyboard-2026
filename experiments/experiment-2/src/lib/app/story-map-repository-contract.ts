import { expect, describe, it } from 'vitest';
import type { Caller, StoryMapRepository } from '$lib/domain/ports';
import type { MapId, UserId } from '$lib/domain/ids';
import { ConflictError, ForbiddenError } from '$lib/domain/errors';
import { addActivity, createStoryMap, moveActivity } from '$lib/domain/story-map';

/**
 * The authorisation rules every `StoryMapRepository` must obey, run against
 * both implementations.
 *
 * ADR 0003 puts enforcement in the adapters, because they are what hold the
 * membership rows. The honest cost of that choice is drift: a rule could end up
 * in the MongoDB adapter and not the in-memory double, and every use-case test
 * would keep passing while production behaved differently. This file is the
 * price paid for the choice — a rule that is not here is not enforced anywhere,
 * and a rule that is here cannot exist in only one implementation.
 *
 * Two cases below were added when this contract was run against a third
 * implementation. Experiment-1's two adapters already disagreed on both — the
 * order of the authorisation and version checks, and whether `listSummaries` is
 * sorted — and nothing caught it, because the contract did not ask. Drift that a
 * contract test does not cover is drift the contract test was supposed to be
 * preventing.
 */
export interface ContractHarness {
	/** A repository with no maps in it. */
	repository: StoryMapRepository;
	/** Registers a user the repository will accept as a caller, and returns it. */
	createUser(): Promise<Caller>;
}

export function describeStoryMapRepositoryContract(
	name: string,
	createHarness: () => Promise<ContractHarness>
): void {
	describe(`${name} (StoryMapRepository contract)`, () => {
		async function ownedMap(harness: ContractHarness) {
			const owner = await harness.createUser();
			const saved = await harness.repository.save(owner, createStoryMap('Retail'));
			return { owner, map: saved };
		}

		it('makes the caller who first saves a map its owner', async () => {
			const harness = await createHarness();
			const { owner, map } = await ownedMap(harness);

			const access = await harness.repository.load(owner, map.id);
			expect(access?.role).toBe('owner');
		});

		it('hides a map from someone who is not a member', async () => {
			const harness = await createHarness();
			const { map } = await ownedMap(harness);
			const stranger = await harness.createUser();

			// Null rather than a ForbiddenError: telling a stranger that a map
			// exists but is not theirs would let them enumerate other people's ids.
			expect(await harness.repository.load(stranger, map.id)).toBeNull();
		});

		it('returns null for a map that does not exist, exactly as for one that is not yours', async () => {
			const harness = await createHarness();
			const caller = await harness.createUser();

			expect(await harness.repository.load(caller, 'no-such-map' as MapId)).toBeNull();
		});

		it('lists only the maps the caller belongs to, with their role', async () => {
			const harness = await createHarness();
			const { owner, map } = await ownedMap(harness);
			const other = await harness.createUser();
			await harness.repository.save(other, createStoryMap("Someone else's"));

			const summaries = await harness.repository.listSummaries(owner);
			expect(summaries.map((s) => s.id)).toEqual([map.id]);
			expect(summaries[0].role).toBe('owner');
		});

		it('loads a map with its collections in rank order, not the order things were made', async () => {
			// Under SQLite every read was an `ORDER BY rank`, so this was true for
			// free and nothing in the app sorts. A store that returns what it was
			// given renders the board in creation order instead, and every drag
			// looks like it did nothing.
			const harness = await createHarness();
			const owner = await harness.createUser();
			const first = addActivity(createStoryMap('Retail'), 'Browse');
			const second = addActivity(first.map, 'Buy');
			const moved = moveActivity(second.map, second.activity.id, null, first.activity.id);
			const saved = await harness.repository.save(owner, moved);

			const access = await harness.repository.load(owner, saved.id);
			expect(access!.map.activities.map((a) => a.name)).toEqual(['Buy', 'Browse']);
		});

		it('lists the most recently created map first', async () => {
			// The order the map list is rendered in. Distinct `createdAt` values
			// rather than whatever the store happens to return, because "newest
			// first" is the promise and insertion order only coincides with it.
			const harness = await createHarness();
			const owner = await harness.createUser();
			const older = await harness.repository.save(
				owner,
				createStoryMap('Older', new Date('2026-01-01T00:00:00Z'))
			);
			const newer = await harness.repository.save(
				owner,
				createStoryMap('Newer', new Date('2026-06-01T00:00:00Z'))
			);

			const summaries = await harness.repository.listSummaries(owner);
			expect(summaries.map((s) => s.id)).toEqual([newer.id, older.id]);
		});

		it('refuses a save from someone who is not a member', async () => {
			const harness = await createHarness();
			const { map } = await ownedMap(harness);
			const stranger = await harness.createUser();

			await expect(harness.repository.save(stranger, { ...map, name: 'Hijacked' })).rejects.toThrow(
				ForbiddenError
			);
		});

		it('tells a stranger they are a stranger even when their copy is also stale', async () => {
			// Both checks fail, so the adapter's ordering decides the answer — and
			// "your copy is out of date" would be actively misleading advice for
			// someone who may not touch the map at all. Untested in experiment-1,
			// where the two implementations genuinely disagreed.
			const harness = await createHarness();
			const { owner, map } = await ownedMap(harness);
			await harness.repository.save(owner, { ...map, name: 'Moved on' });
			const stranger = await harness.createUser();

			await expect(harness.repository.save(stranger, { ...map, name: 'Hijacked' })).rejects.toThrow(
				ForbiddenError
			);
		});

		it('does not let a stale tab resurrect a map that has been deleted', async () => {
			// Deleting a map takes its memberships with it, so the save is refused
			// as a stranger's — which is the right answer, and is not what happens
			// if an implementation decides "new or existing?" by looking for the
			// map instead of at the version. That reading recreates it, silently,
			// owned by whoever still had it open.
			const harness = await createHarness();
			const { owner, map } = await ownedMap(harness);
			await harness.repository.delete(owner, map.id);

			await expect(harness.repository.save(owner, { ...map, name: 'Back' })).rejects.toThrow();
			expect(await harness.repository.load(owner, map.id)).toBeNull();
		});

		it('still enforces optimistic concurrency for a member', async () => {
			const harness = await createHarness();
			const { owner, map } = await ownedMap(harness);
			await harness.repository.save(owner, { ...map, name: 'First' });

			// Authorisation does not replace the version check; both apply.
			await expect(harness.repository.save(owner, { ...map, name: 'Stale' })).rejects.toThrow(
				ConflictError
			);
		});

		describe('roleOf', () => {
			it("reports the caller's role without loading the board", async () => {
				const harness = await createHarness();
				const { owner, map } = await ownedMap(harness);

				expect(await harness.repository.roleOf(owner, map.id)).toBe('owner');
			});

			it('reports an editor as an editor', async () => {
				const harness = await createHarness();
				const { owner, map } = await ownedMap(harness);
				const editor = await harness.createUser();
				await harness.repository.addMember(owner, map.id, editor.userId, 'editor');

				expect(await harness.repository.roleOf(editor, map.id)).toBe('editor');
			});

			it('is null for a non-member, exactly as for a map that does not exist', async () => {
				// Same conflation `load` makes: an outsider must not be able to tell
				// the two apart.
				const harness = await createHarness();
				const { map } = await ownedMap(harness);
				const stranger = await harness.createUser();

				expect(await harness.repository.roleOf(stranger, map.id)).toBeNull();
				expect(await harness.repository.roleOf(stranger, 'no-such-map' as MapId)).toBeNull();
			});
		});

		describe('membership', () => {
			it('lets an owner add an editor, who can then load and save', async () => {
				const harness = await createHarness();
				const { owner, map } = await ownedMap(harness);
				const editor = await harness.createUser();

				await harness.repository.addMember(owner, map.id, editor.userId, 'editor');

				const access = await harness.repository.load(editor, map.id);
				expect(access?.role).toBe('editor');
				await expect(
					harness.repository.save(editor, addActivity(access!.map, 'Browse').map)
				).resolves.toBeDefined();
			});

			it('is idempotent for someone who is already a member', async () => {
				const harness = await createHarness();
				const { owner, map } = await ownedMap(harness);
				const editor = await harness.createUser();

				await harness.repository.addMember(owner, map.id, editor.userId, 'editor');
				await expect(
					harness.repository.addMember(owner, map.id, editor.userId, 'editor')
				).resolves.toBeUndefined();
			});

			it('refuses an editor who tries to share the map on', async () => {
				const harness = await createHarness();
				const { owner, map } = await ownedMap(harness);
				const editor = await harness.createUser();
				const third = await harness.createUser();
				await harness.repository.addMember(owner, map.id, editor.userId, 'editor');

				await expect(
					harness.repository.addMember(editor, map.id, third.userId, 'editor')
				).rejects.toThrow(ForbiddenError);
			});

			it('refuses a stranger who tries to add themselves', async () => {
				const harness = await createHarness();
				const { map } = await ownedMap(harness);
				const stranger = await harness.createUser();

				await expect(
					harness.repository.addMember(stranger, map.id, stranger.userId, 'editor')
				).rejects.toThrow(ForbiddenError);
			});
		});

		describe('delete', () => {
			it('lets the owner delete the map', async () => {
				const harness = await createHarness();
				const { owner, map } = await ownedMap(harness);

				await harness.repository.delete(owner, map.id);

				expect(await harness.repository.load(owner, map.id)).toBeNull();
			});

			it('refuses an editor, who may edit the board but not destroy it', async () => {
				const harness = await createHarness();
				const { owner, map } = await ownedMap(harness);
				const editor = await harness.createUser();
				await harness.repository.addMember(owner, map.id, editor.userId, 'editor');

				await expect(harness.repository.delete(editor, map.id)).rejects.toThrow(ForbiddenError);
				expect(await harness.repository.load(owner, map.id)).not.toBeNull();
			});

			it('is a silent no-op for a non-member, who must not learn the map exists', async () => {
				const harness = await createHarness();
				const { owner, map } = await ownedMap(harness);
				const stranger = await harness.createUser();

				await expect(harness.repository.delete(stranger, map.id)).resolves.toBeUndefined();
				expect(await harness.repository.load(owner, map.id)).not.toBeNull();
			});

			it('is a no-op for a map that never existed', async () => {
				const harness = await createHarness();
				const caller = await harness.createUser();

				await expect(
					harness.repository.delete(caller, 'no-such-map' as MapId)
				).resolves.toBeUndefined();
			});
		});
	});
}

/** Ids for test users, so a harness need not invent its own scheme. */
export function testUserId(n: number): UserId {
	return `user-${n}` as UserId;
}

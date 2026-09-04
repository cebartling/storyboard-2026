import { expect, describe, it } from 'vitest';
import type { Caller, StoryMapRepository } from '$lib/domain/ports';
import type { MapId, UserId } from '$lib/domain/ids';
import { ConflictError, ForbiddenError } from '$lib/domain/errors';
import { addActivity, createStoryMap } from '$lib/domain/story-map';

/**
 * The authorisation rules every `StoryMapRepository` must obey, run against
 * both implementations.
 *
 * ADR 0016 puts enforcement in the adapters, because they are what hold the
 * membership rows. The honest cost of that choice is drift: a rule could end up
 * in the Drizzle adapter and not the in-memory double, and every use-case test
 * would keep passing while production behaved differently. This file is the
 * price paid for the choice — a rule that is not here is not enforced anywhere,
 * and a rule that is here cannot exist in only one implementation.
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

		it('refuses a save from someone who is not a member', async () => {
			const harness = await createHarness();
			const { map } = await ownedMap(harness);
			const stranger = await harness.createUser();

			await expect(harness.repository.save(stranger, { ...map, name: 'Hijacked' })).rejects.toThrow(
				ForbiddenError
			);
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

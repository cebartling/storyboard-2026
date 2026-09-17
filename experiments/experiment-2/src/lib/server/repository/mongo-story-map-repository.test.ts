import { beforeEach, describe, expect, it } from 'vitest';
import type { Db, MongoClient } from 'mongodb';
import { ConflictError, ForbiddenError } from '$lib/domain/errors';
import { newId, type UserId } from '$lib/domain/ids';
import { addActivity, addStep, addStory, createStoryMap } from '$lib/domain/story-map';
import { describeStoryMapRepositoryContract } from '$lib/app/story-map-repository-contract';
import { collections } from '../db/collections';
import { freshDatabase } from '../test-support/mongo';
import { MongoStoryMapRepository } from './mongo-story-map-repository';

// The same contract the in-memory double is held to, unchanged. That it passes
// against a completely different store is the point of the port (ADR 0006).
describeStoryMapRepositoryContract('MongoStoryMapRepository', async () => {
	const { db, client } = await freshDatabase();
	return {
		repository: new MongoStoryMapRepository(db, client),
		// Nothing to insert: this adapter authorises from `mapMembers`, never from
		// `users`, so a caller is just an id. There is no foreign key to satisfy —
		// which is exactly the constraint MongoDB does not give us, and the reason
		// the seed script checks the account exists itself.
		createUser: async () => ({ userId: newId<UserId>() })
	};
});

describe('MongoStoryMapRepository (storage-specific)', () => {
	let db: Db;
	let client: MongoClient;
	let repository: MongoStoryMapRepository;
	const caller = { userId: newId<UserId>() };

	beforeEach(async () => {
		({ db, client } = await freshDatabase());
		repository = new MongoStoryMapRepository(db, client);
	});

	it('stores a whole map as exactly one document', async () => {
		// The claim the document model rests on. Under SQLite the seed-sized map
		// was ~215 rows across five tables, rewritten on every save.
		const { map } = addActivity(createStoryMap('Retail'), 'Browse');
		await repository.save(caller, map);

		expect(await collections(db).maps.countDocuments()).toBe(1);
	});

	it('creates the owner membership in the same breath as the map', async () => {
		// Not two writes that usually both land: a map with no members is
		// unreachable through the UI and unfixable through it. This is the one
		// place a transaction is needed, and the whole reason compose.yaml runs a
		// replica set rather than a standalone.
		const saved = await repository.save(caller, createStoryMap('Retail'));

		const member = await collections(db).mapMembers.findOne({ mapId: saved.id });
		expect(member).toMatchObject({ userId: caller.userId, role: 'owner' });
	});

	it('lets exactly one of two concurrent saves win, and tells the loser why', async () => {
		// This replaces experiment-1's two `worker_threads` tests, which held a
		// SQLite write lock and asserted the next writer *waited*. There is no
		// analogue here and there does not need to be: the property those tests
		// were protecting is that a lost update is impossible, and the
		// compare-and-set is what provides it. Both callers start from the same
		// version, so one `findOneAndUpdate` matches and the other cannot.
		const base = await repository.save(caller, createStoryMap('Retail'));

		const results = await Promise.allSettled([
			repository.save(caller, addActivity(base, 'Browse').map),
			repository.save(caller, addActivity(base, 'Buy').map)
		]);

		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		const rejection = results.find((r) => r.status === 'rejected');
		expect(rejection?.reason).toBeInstanceOf(ConflictError);
		// And the surviving write is intact — neither a merge nor a half-write.
		const after = await repository.load(caller, base.id);
		expect(after!.map.activities).toHaveLength(1);
		expect(after!.map.version).toBe(base.version + 1);
	});

	it('refuses a save against a deleted map before it ever reaches the version check', async () => {
		// `delete` removes the membership rows with the map, so the membership
		// check answers first and the caller is told they have no access — not
		// that their copy is stale, which would invite them to refresh a map that
		// is gone.
		//
		// `save`'s "no longer exists" conflict is therefore not reachable this
		// way. It covers the narrow race where a delete commits between this
		// caller's membership lookup and its conditional update, which is real but
		// cannot be provoked deterministically from here.
		const saved = await repository.save(caller, createStoryMap('Retail'));
		await repository.delete(caller, saved.id);

		await expect(repository.save(caller, { ...saved, name: 'Renamed' })).rejects.toThrow(
			ForbiddenError
		);
	});

	it('removes a map’s membership rows when the map is deleted', async () => {
		// Under SQLite this was ON DELETE CASCADE. Here it is two writes in a
		// transaction, and leaving the rows behind would show a deleted map in its
		// members' lists forever.
		const saved = await repository.save(caller, createStoryMap('Retail'));
		const editor = { userId: newId<UserId>() };
		await repository.addMember(caller, saved.id, editor.userId, 'editor');

		await repository.delete(caller, saved.id);

		expect(await collections(db).mapMembers.countDocuments({ mapId: saved.id })).toBe(0);
	});

	it('writes an unsliced story’s sliceId as an explicit null, and reads it back', async () => {
		// MongoDB distinguishes a missing field from a null one, and the unsliced
		// band is where every new story starts — so this is the common case, not
		// an edge one. A story that came back with `sliceId` undefined would sit in
		// no band at all.
		const activity = addActivity(createStoryMap('Retail'), 'Browse');
		const step = addStep(activity.map, activity.activity.id, 'Search');
		const story = addStory(step.map, step.step.id, 'Filter by size');
		const saved = await repository.save(caller, story.map);

		const doc = await collections(db).maps.findOne({ _id: saved.id });
		expect(doc!.stories[0]).toHaveProperty('sliceId', null);

		const loaded = await repository.load(caller, saved.id);
		expect(loaded!.map.stories[0].sliceId).toBeNull();
	});

	it('round-trips the nested shape the board renders from', async () => {
		// One document, but the domain still sees steps under activities. If the
		// embedding lost that nesting the board would render empty columns.
		const activity = addActivity(createStoryMap('Retail'), 'Browse');
		const step = addStep(activity.map, activity.activity.id, 'Search');
		const saved = await repository.save(caller, step.map);

		const loaded = await repository.load(caller, saved.id);
		expect(loaded!.map.activities[0].steps.map((s) => s.name)).toEqual(['Search']);
	});

	it('defaults dependencies to [] for a document written before the field existed', async () => {
		// There are no migrations here (ADR 0003), so every map created before
		// dependencies shipped has no such key. A cast in `toDomain` would
		// typecheck and hand the domain `undefined`, and the first thing to touch
		// it is `deleteStory` — so the symptom would be a 500 deleting a story
		// from an ordinary pre-existing map, not a missing feature.
		//
		// Written with the driver rather than through `save`, because `save` always
		// writes the field: this shape cannot be produced through the repository.
		const { map } = addActivity(createStoryMap('Legacy'), 'Browse');
		const saved = await repository.save(caller, map);
		await collections(db).maps.updateOne({ _id: saved.id }, { $unset: { dependencies: '' } });

		const access = await repository.load(caller, saved.id);

		expect(access!.map.dependencies).toEqual([]);
	});

	it('defaults a story’s status for a document written before the field existed', async () => {
		// The `status` counterpart of the case above, and the quieter of the two:
		// a story that came back with `status` undefined would render an untinted
		// card and an empty chip rather than throwing, so nothing else in the
		// suite would notice.
		//
		// Same technique — `$unset` through the driver, because `save` always
		// writes the field and this shape is unreachable through the repository.
		const activity = addActivity(createStoryMap('Legacy'), 'Browse');
		const step = addStep(activity.map, activity.activity.id, 'Search');
		const story = addStory(step.map, step.step.id, 'Filter by size', { status: 'done' });
		const saved = await repository.save(caller, story.map);
		await collections(db).maps.updateOne({ _id: saved.id }, { $unset: { 'stories.0.status': '' } });

		const access = await repository.load(caller, saved.id);

		expect(access!.map.stories[0].status).toBe('todo');
	});

	it('defaults a story’s status when the stored value is not one of the five', async () => {
		// Not a hypothetical: `story-status.test.ts` guards against a *renamed*
		// status, and with no migrations and no schema (ADR 0003) a rename leaves
		// every existing document holding the old string. Passed through, it has
		// no entry in `STORY_STATUS_PRESENTATION` and the card throws on
		// `.card` — so the whole board 500s rather than drawing one story wrong.
		const activity = addActivity(createStoryMap('Legacy'), 'Browse');
		const step = addStep(activity.map, activity.activity.id, 'Search');
		const story = addStory(step.map, step.step.id, 'Filter by size');
		const saved = await repository.save(caller, story.map);
		await collections(db).maps.updateOne(
			{ _id: saved.id },
			{ $set: { 'stories.0.status': 'shipped' } }
		);

		const access = await repository.load(caller, saved.id);

		expect(access!.map.stories[0].status).toBe('todo');
	});
});

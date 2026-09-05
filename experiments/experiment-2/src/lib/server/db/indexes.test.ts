import { beforeEach, describe, expect, it } from 'vitest';
import { MongoServerError, type Db } from 'mongodb';
import type { MapId, UserId } from '$lib/domain/ids';
import { collections, memberId, type Collections } from './collections';
import { freshDatabase } from '../test-support/mongo';

/**
 * The three constraints that were foreign keys and unique indexes under SQLite
 * and are now application configuration.
 *
 * Worth testing directly rather than only through the code that depends on
 * them: nothing in `src/lib/domain/` knows `mapMembers` exists, so a missing
 * index here is invisible until two owners do. The behaviour tests would keep
 * passing.
 */
describe('ensureIndexes', () => {
	let db: Db;
	let c: Collections;
	const mapId = 'map-1' as MapId;

	const member = (userId: string, role: 'owner' | 'editor') => ({
		_id: memberId(mapId, userId as UserId),
		mapId,
		userId: userId as UserId,
		role
	});

	beforeEach(async () => {
		({ db } = await freshDatabase());
		c = collections(db);
	});

	it('allows at most one owner per map', async () => {
		await c.mapMembers.insertOne(member('ada', 'owner'));

		await expect(c.mapMembers.insertOne(member('bob', 'owner'))).rejects.toThrow(MongoServerError);
	});

	it('still allows any number of editors on that map', async () => {
		// The half that proves the index is *partial*. A plain unique index on
		// `mapId` would pass the test above and quietly make sharing impossible —
		// and it would fail here rather than in the constraint it was protecting.
		await c.mapMembers.insertOne(member('ada', 'owner'));

		await c.mapMembers.insertOne(member('bob', 'editor'));
		await c.mapMembers.insertOne(member('cleo', 'editor'));

		expect(await c.mapMembers.countDocuments({ mapId })).toBe(3);
	});

	it('allows the same person to own a different map', async () => {
		// The filter is on `role`, but the key is `mapId` — one owner *per map*,
		// not one map per owner.
		await c.mapMembers.insertOne(member('ada', 'owner'));

		await c.mapMembers.insertOne({
			_id: memberId('map-2' as MapId, 'ada' as UserId),
			mapId: 'map-2' as MapId,
			userId: 'ada' as UserId,
			role: 'owner'
		});

		expect(await c.mapMembers.countDocuments({ userId: 'ada' as UserId })).toBe(2);
	});

	it('refuses a second account for one email address', async () => {
		const user = {
			email: 'ada@example.test',
			displayName: 'Ada',
			passwordHash: 'x',
			createdAt: new Date()
		};
		await c.users.insertOne({ _id: 'u1' as UserId, ...user });

		await expect(c.users.insertOne({ _id: 'u2' as UserId, ...user })).rejects.toThrow(
			MongoServerError
		);
	});
});

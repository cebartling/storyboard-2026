import { MongoServerError, type Db, type MongoClient } from 'mongodb';
import { ConflictError, ForbiddenError } from '$lib/domain/errors';
import type { MapId, UserId } from '$lib/domain/ids';
import type { Caller, MapAccess, MapSummary, Role, StoryMapRepository } from '$lib/domain/ports';
import { inRankOrder, type StoryMap } from '$lib/domain/story-map';
import { collections, memberId, type Collections, type MapDoc } from '../db/collections';

/** MongoDB's duplicate-key error, the one the unique indexes raise. */
const DUPLICATE_KEY = 11000;

/**
 * `StoryMapRepository` over MongoDB, storing each map as a single document
 * (ADR 0003).
 *
 * The port is unchanged from experiment-1 — same six methods, same `Caller`
 * argument, same shared contract test. That is deliberate: whether this file
 * could be written without touching anything above it is the experiment.
 *
 * Authorisation is enforced here rather than in the app layer, for the reason
 * ADR 0015 gives: this is what holds the membership rows, so one
 * lookup answers "does it exist" and "may they" together, and a non-member gets
 * the same `null` as someone asking for a map that was never there.
 */
export class MongoStoryMapRepository implements StoryMapRepository {
	constructor(
		private readonly db: Db,
		/** Needed only for the one multi-document transaction — see `save`. */
		private readonly client: MongoClient
	) {}

	// Resolved per call rather than in the constructor, so constructing this
	// touches nothing. `vite build` imports the server graph to analyse it, and
	// `deps.ts` builds this at module scope — see `db/index.ts` for why that
	// import must not need a running database.
	private get c(): Collections {
		return collections(this.db);
	}

	private async roleFor(mapId: MapId, userId: UserId): Promise<Role | null> {
		const row = await this.c.mapMembers.findOne({ mapId, userId }, { projection: { role: 1 } });
		return row?.role ?? null;
	}

	async roleOf(caller: Caller, id: MapId): Promise<Role | null> {
		// One indexed point lookup. The cursor endpoint calls this at pointer
		// rate, which is why it does not go anywhere near the map document.
		return this.roleFor(id, caller.userId);
	}

	async load(caller: Caller, id: MapId): Promise<MapAccess | null> {
		const role = await this.roleFor(id, caller.userId);
		// A non-member is told exactly what someone asking for a nonexistent map
		// is told, so ids cannot be probed for.
		if (!role) return null;

		const doc = await this.c.maps.findOne({ _id: id });
		// Membership can outlive its map only if something deleted the map
		// without its members; `delete` removes both.
		return doc ? { map: toDomain(doc), role } : null;
	}

	async save(caller: Caller, map: StoryMap): Promise<StoryMap> {
		const nextVersion = map.version + 1;
		const doc = toDocument(map, nextVersion);

		if (map.version === 0) {
			await this.create(caller, doc);
			return { ...map, version: nextVersion };
		}

		// Membership before version, matching the in-memory double. Experiment-1's
		// two adapters disagreed here and its contract test never pinned it; the
		// contract now has a case for it.
		if (!(await this.roleFor(map.id, caller.userId))) {
			throw new ForbiddenError('You do not have access to this story map.');
		}

		// The compare-and-set (ADR 0016), and the reason this is nicer than it
		// was: one atomic conditional update. Experiment-1 had to read the version and
		// then write, which was correct only because the transaction took the
		// write lock at BEGIN. There is no such subtlety here.
		const result = await this.c.maps.findOneAndUpdate(
			{ _id: map.id, version: map.version },
			{ $set: doc },
			{ returnDocument: 'after' }
		);
		if (result) return { ...map, version: nextVersion };

		// It matched nothing: either the map moved on, or it is gone. One extra
		// read distinguishes them, and only on the failure path.
		const current = await this.c.maps.findOne({ _id: map.id }, { projection: { version: 1 } });
		if (!current) throw new ConflictError(`Story map ${map.id} no longer exists`);
		throw new ConflictError(
			`Story map ${map.id} changed since it was loaded (expected version ${map.version}, current version ${current.version})`
		);
	}

	/**
	 * A map and its owner row, together or not at all.
	 *
	 * This is the only place the app needs a multi-document transaction, and the
	 * only reason `compose.yaml` runs a replica set. Without it there is an
	 * instant where a map exists that nobody can reach — invisible in the UI,
	 * and unfixable through it.
	 */
	private async create(caller: Caller, doc: MapDoc): Promise<void> {
		const session = this.client.startSession();
		try {
			await session.withTransaction(async () => {
				await this.c.maps.insertOne(doc, { session });
				await this.c.mapMembers.insertOne(
					{
						_id: memberId(doc._id, caller.userId),
						mapId: doc._id,
						userId: caller.userId,
						role: 'owner'
					},
					{ session }
				);
			});
		} catch (error) {
			// A version of 0 means "never saved", so an id that is already taken is
			// not a conflict the caller can resolve by refreshing — but it is still
			// a conflict, and it must not reach the route as a raw driver error.
			// Unreachable today: ids are minted by `createStoryMap`.
			if (error instanceof MongoServerError && error.code === DUPLICATE_KEY) {
				throw new ConflictError(`Story map ${doc._id} already exists`);
			}
			throw error;
		} finally {
			await session.endSession();
		}
	}

	async listSummaries(caller: Caller): Promise<MapSummary[]> {
		const memberships = await this.c.mapMembers.find({ userId: caller.userId }).toArray();
		if (memberships.length === 0) return [];

		const roleByMap = new Map(memberships.map((m) => [m.mapId, m.role]));
		// Sorted in the query rather than in JS — experiment-1's two adapters
		// disagreed on this and nothing caught it, because the contract test
		// never had more than one map in a result.
		const docs = await this.c.maps
			.find({ _id: { $in: [...roleByMap.keys()] } }, { projection: { name: 1, createdAt: 1 } })
			.sort({ createdAt: -1 })
			.toArray();

		return docs.map((d) => ({
			id: d._id,
			name: d.name,
			createdAt: d.createdAt,
			role: roleByMap.get(d._id)!
		}));
	}

	async delete(caller: Caller, id: MapId): Promise<void> {
		const role = await this.roleFor(id, caller.userId);
		// Silent for a non-member: they must not be able to tell a map they
		// cannot see from one that was never there.
		if (!role) return;
		if (role !== 'owner') {
			throw new ForbiddenError('Only the owner can delete this story map.');
		}

		// No cascade to lean on any more. The map's children are inside its
		// document, so they go with it; the membership rows are not, and must be
		// removed explicitly.
		const session = this.client.startSession();
		try {
			await session.withTransaction(async () => {
				await this.c.maps.deleteOne({ _id: id }, { session });
				await this.c.mapMembers.deleteMany({ mapId: id }, { session });
			});
		} finally {
			await session.endSession();
		}
	}

	async addMember(caller: Caller, id: MapId, userId: UserId, role: 'editor'): Promise<void> {
		if ((await this.roleFor(id, caller.userId)) !== 'owner') {
			// Deliberately the same answer for an editor and for a stranger:
			// neither may share the map on, and telling them apart would confirm
			// the map exists.
			throw new ForbiddenError('Only the owner can share this story map.');
		}
		// Idempotent — re-sharing with someone already on the map is a thing
		// people do, and it is not an error.
		try {
			await this.c.mapMembers.updateOne(
				{ mapId: id, userId },
				{ $setOnInsert: { _id: memberId(id, userId), mapId: id, userId, role } },
				{ upsert: true }
			);
		} catch (error) {
			// An upsert is not atomic against a second upsert with the same filter:
			// both can find nothing and one insert then loses to the (map, user)
			// unique index. A double-submitted share form is enough. The index
			// having stopped the duplicate *is* the outcome this method promises,
			// so it is a success, not a 500.
			if (!(error instanceof MongoServerError) || error.code !== DUPLICATE_KEY) throw error;
		}
	}
}

/**
 * Document → domain. The casts mirror the branded-id casts the SQLite adapter
 * made against its rows; nothing validates the shape at runtime in either.
 */
function toDomain(doc: MapDoc): StoryMap {
	// `inRankOrder` is the read-path guarantee SQLite's `ORDER BY rank` used to
	// make. Arrays come back exactly as they were written, and a move changes a
	// rank rather than a position, so without this the board renders the order
	// the cards were *created* in and every drag appears to do nothing.
	return inRankOrder({
		id: doc._id,
		name: doc.name,
		createdAt: doc.createdAt,
		version: doc.version,
		activities: doc.activities as StoryMap['activities'],
		slices: doc.slices as StoryMap['slices'],
		stories: doc.stories as StoryMap['stories']
	});
}

/** Domain → document, at the version being written. */
function toDocument(map: StoryMap, version: number): MapDoc {
	return {
		_id: map.id,
		name: map.name,
		createdAt: map.createdAt,
		version,
		activities: map.activities,
		slices: map.slices,
		// `sliceId` is written explicitly as `null` for the unsliced band rather
		// than omitted: Mongo distinguishes a missing field from a null one, and
		// the unsliced band is where every new story starts.
		stories: map.stories.map((s) => ({ ...s, sliceId: s.sliceId ?? null }))
	};
}

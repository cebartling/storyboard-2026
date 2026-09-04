/**
 * A `StoryMapRepository` backed by a `Map`, for driving use cases without a
 * database. It exists because `src/lib/app/` had no way to be tested at all:
 * the use cases take a repository as a parameter, but the only implementation
 * was Drizzle-backed, and importing the composition root boots SQLite and runs
 * migrations (finding A6 of `documentation/review-2026-09-02.md`).
 *
 * It enforces the same optimistic-concurrency rule as the real adapter — a save
 * whose `version` is stale is rejected rather than silently winning — and, since
 * ADR 0016, the same membership rules. A double that is more permissive than
 * production turns a passing test into a false negative on exactly the
 * behaviour worth protecting, which is why both are held to the shared contract
 * in `story-map-repository-contract.ts`.
 *
 * Not a production adapter: nothing here persists, and it is deliberately not
 * wired in `src/lib/server/deps.ts`.
 */

import type { MapId, UserId } from '$lib/domain/ids';
import type { Caller, MapAccess, MapSummary, Role, StoryMapRepository } from '$lib/domain/ports';
import type { StoryMap } from '$lib/domain/story-map';
import { ConflictError, ForbiddenError } from '$lib/domain/errors';

export class InMemoryStoryMapRepository implements StoryMapRepository {
	private readonly maps = new Map<MapId, StoryMap>();
	private readonly members = new Map<MapId, Map<UserId, Role>>();

	constructor(seed: { map: StoryMap; owner: UserId }[] = []) {
		for (const { map, owner } of seed) {
			this.maps.set(map.id, map);
			this.members.set(map.id, new Map([[owner, 'owner']]));
		}
	}

	private memberRole(mapId: MapId, userId: UserId): Role | null {
		return this.members.get(mapId)?.get(userId) ?? null;
	}

	async roleOf(caller: Caller, id: MapId): Promise<Role | null> {
		// Null for a map that does not exist as well as for one that is not the
		// caller's — the same conflation `load` makes.
		return this.maps.has(id) ? this.memberRole(id, caller.userId) : null;
	}

	async load(caller: Caller, id: MapId): Promise<MapAccess | null> {
		const map = this.maps.get(id);
		if (!map) return null;
		const role = this.memberRole(id, caller.userId);
		// A non-member gets the same answer as for a map that does not exist.
		if (!role) return null;
		// A copy, so a caller mutating what it loaded cannot reach back into
		// the store — the Drizzle adapter rebuilds from rows and so cannot be
		// aliased either.
		return { map: structuredClone(map), role };
	}

	async save(caller: Caller, map: StoryMap): Promise<StoryMap> {
		const current = this.maps.get(map.id);
		if (current) {
			if (!this.memberRole(map.id, caller.userId)) {
				throw new ForbiddenError('You do not have access to this story map.');
			}
			if (current.version !== map.version) {
				throw new ConflictError(`Story map ${map.id} changed since it was loaded`);
			}
		}
		const saved: StoryMap = { ...structuredClone(map), version: map.version + 1 };
		this.maps.set(map.id, saved);
		// First save of a map makes its author the owner, in the same step, so
		// there is never a map nobody can reach.
		if (!current) {
			this.members.set(map.id, new Map([[caller.userId, 'owner']]));
		}
		return structuredClone(saved);
	}

	async listSummaries(caller: Caller): Promise<MapSummary[]> {
		return [...this.maps.values()].flatMap((map) => {
			const role = this.memberRole(map.id, caller.userId);
			return role ? [{ id: map.id, name: map.name, createdAt: map.createdAt, role }] : [];
		});
	}

	async delete(caller: Caller, id: MapId): Promise<void> {
		const role = this.memberRole(id, caller.userId);
		// Silent for a non-member: the operation is idempotent for a caller who
		// cannot tell whether the map was ever there.
		if (!role) return;
		if (role !== 'owner') {
			throw new ForbiddenError('Only the owner can delete this story map.');
		}
		this.maps.delete(id);
		this.members.delete(id);
	}

	async addMember(caller: Caller, id: MapId, userId: UserId, role: 'editor'): Promise<void> {
		if (this.memberRole(id, caller.userId) !== 'owner') {
			throw new ForbiddenError('Only the owner can share this story map.');
		}
		const members = this.members.get(id);
		if (!members) return;
		if (!members.has(userId)) members.set(userId, role);
	}
}

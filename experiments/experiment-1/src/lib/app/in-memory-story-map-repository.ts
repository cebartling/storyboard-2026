/**
 * A `StoryMapRepository` backed by a `Map`, for driving use cases without a
 * database. It exists because `src/lib/app/` had no way to be tested at all:
 * the use cases take a repository as a parameter, but the only implementation
 * was Drizzle-backed, and importing the composition root boots SQLite and runs
 * migrations (finding A6 of `documentation/review-2026-09-02.md`).
 *
 * It enforces the same optimistic-concurrency rule as the real adapter — a save
 * whose `version` is stale is rejected rather than silently winning — because a
 * double that is more permissive than production turns a passing test into a
 * false negative on exactly the behaviour worth protecting.
 *
 * Not a production adapter: nothing here persists, and it is deliberately not
 * wired in `src/lib/server/deps.ts`.
 */

import type { MapId } from '$lib/domain/ids';
import type { StoryMapRepository } from '$lib/domain/ports';
import type { StoryMap } from '$lib/domain/story-map';
import { ConflictError } from '$lib/domain/errors';

export class InMemoryStoryMapRepository implements StoryMapRepository {
	private readonly maps = new Map<MapId, StoryMap>();

	constructor(seed: StoryMap[] = []) {
		for (const map of seed) this.maps.set(map.id, map);
	}

	async load(id: MapId): Promise<StoryMap | null> {
		const map = this.maps.get(id);
		// A copy, so a caller mutating what it loaded cannot reach back into
		// the store — the Drizzle adapter rebuilds from rows and so cannot be
		// aliased either.
		return map ? structuredClone(map) : null;
	}

	async save(map: StoryMap): Promise<StoryMap> {
		const current = this.maps.get(map.id);
		if (current && current.version !== map.version) {
			throw new ConflictError(`Story map ${map.id} changed since it was loaded`);
		}
		const saved: StoryMap = { ...structuredClone(map), version: map.version + 1 };
		this.maps.set(map.id, saved);
		return structuredClone(saved);
	}

	async listSummaries(): Promise<{ id: MapId; name: string; createdAt: Date }[]> {
		return [...this.maps.values()].map(({ id, name, createdAt }) => ({ id, name, createdAt }));
	}

	async delete(id: MapId): Promise<void> {
		this.maps.delete(id);
	}
}

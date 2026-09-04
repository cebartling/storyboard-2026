import { newId, type UserId } from '$lib/domain/ids';
import { InMemoryStoryMapRepository } from './in-memory-story-map-repository';
import { describeStoryMapRepositoryContract } from './story-map-repository-contract';

// The double is held to exactly the same contract as the Drizzle adapter, so a
// rule cannot quietly exist in one and not the other (ADR 0016).
describeStoryMapRepositoryContract('InMemoryStoryMapRepository', async () => ({
	repository: new InMemoryStoryMapRepository(),
	// Nothing to register: the in-memory store has no user table, so any id is
	// a usable caller. The Drizzle harness really does insert a row.
	createUser: async () => ({ userId: newId<UserId>() })
}));

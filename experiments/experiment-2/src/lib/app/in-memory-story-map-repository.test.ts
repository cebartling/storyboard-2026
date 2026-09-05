import { newId, type UserId } from '$lib/domain/ids';
import { InMemoryStoryMapRepository } from './in-memory-story-map-repository';
import { describeStoryMapRepositoryContract } from './story-map-repository-contract';

// The double is held to exactly the same contract as the MongoDB adapter, so a
// rule cannot quietly exist in one and not the other (ADR 0015).
describeStoryMapRepositoryContract('InMemoryStoryMapRepository', async () => ({
	repository: new InMemoryStoryMapRepository(),
	// Nothing to register, and the same is true of the MongoDB harness: both
	// authorise from membership rows rather than from a users collection, so a
	// caller is just an id. (experiment-1's Drizzle harness did insert a row —
	// there was a foreign key to satisfy.)
	createUser: async () => ({ userId: newId<UserId>() })
}));

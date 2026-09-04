import { newId, type UserId } from '$lib/domain/ids';
import { InMemoryStoryMapRepository } from './in-memory-story-map-repository';
import { describeStoryMapRepositoryContract } from './story-map-repository-contract';

// The double is held to exactly the same contract as the MongoDB adapter, so a
// rule cannot quietly exist in one and not the other (ADR 0003).
describeStoryMapRepositoryContract('InMemoryStoryMapRepository', async () => ({
	repository: new InMemoryStoryMapRepository(),
	// Nothing to register: the in-memory store has no users collection, so any id
	// is a usable caller. The MongoDB harness really does insert a document.
	createUser: async () => ({ userId: newId<UserId>() })
}));

/**
 * Composition root (see documentation/architecture.md). This is the only
 * place that wires concrete adapters to the two outbound ports — routes and
 * `src/lib/app/` use cases import from here, never from `db/`, `repository/`,
 * or `ai/` directly.
 *
 * A module-level singleton is right for MongoDB: the driver's `MongoClient` is
 * a connection *pool*, meant to be created once and shared, and creating one
 * per request would defeat pooling entirely. SvelteKit runs this module once
 * per server process, which is exactly that lifetime — and it is why the client
 * has to be closed on the way out rather than left to the process exiting.
 */

import type { AiAssistant } from '$lib/domain/ports';
import type { StoryMapRepository } from '$lib/domain/ports';
import { client, db } from './db';
import { Auth } from './auth/auth';
import { CollabHubs } from './collab/map-hub';
import { registerShutdown } from './collab/shutdown';
import { NullAiAssistant } from './ai/null-assistant';
import { MongoStoryMapRepository } from './repository/mongo-story-map-repository';

export interface Deps {
	storyMapRepository: StoryMapRepository;
	aiAssistant: AiAssistant;
	/**
	 * Accounts and sessions (ADR 0003). Not an outbound port — see the docblock
	 * on `Auth` for why — but it is process-scoped state wired once, which is
	 * what this module is for.
	 */
	auth: Auth;
	/**
	 * Per-map event fan-out (ADR 0015). Not an outbound port — nothing in
	 * `src/lib/domain/` or `src/lib/app/` knows it exists — but it is
	 * process-scoped state wired once, which is what this module is for. Its
	 * being a single instance is the same single-process assumption the write
	 * lock rests on.
	 */
	collab: CollabHubs;
}

export const deps: Deps = {
	storyMapRepository: new MongoStoryMapRepository(db, client),
	aiAssistant: new NullAiAssistant(),
	auth: new Auth(db),
	collab: new CollabHubs()
};

// Streams have to be closed on the way out, or adapter-node waits out its
// 30-second force-kill timeout on every restart; the client's pool holds live
// handles for the same reason.
registerShutdown(() => client.close());

/**
 * Composition root (see documentation/architecture.md). This is the only
 * place that wires concrete adapters to the two outbound ports — routes and
 * `src/lib/app/` use cases import from here, never from `db/`, `repository/`,
 * or `ai/` directly.
 *
 * A module-level singleton is fine for a file-backed SQLite DB: better-sqlite3
 * holds one connection per process, and SvelteKit runs this module once per
 * server process (not per-request), so there is nothing per-request to scope
 * this to.
 */

import type { AiAssistant } from '$lib/domain/ports';
import type { StoryMapRepository } from '$lib/domain/ports';
import { db } from './db';
import { Auth } from './auth/auth';
import { CollabHubs } from './collab/map-hub';
import { registerStreamShutdown } from './collab/shutdown';
import { NullAiAssistant } from './ai/null-assistant';
import { DrizzleStoryMapRepository } from './repository/drizzle-story-map-repository';

export interface Deps {
	storyMapRepository: StoryMapRepository;
	aiAssistant: AiAssistant;
	/**
	 * Accounts and sessions (ADR 0016). Not an outbound port — see the docblock
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
	storyMapRepository: new DrizzleStoryMapRepository(db),
	aiAssistant: new NullAiAssistant(),
	auth: new Auth(db),
	collab: new CollabHubs()
};

// Streams have to be closed on the way out, or adapter-node waits out its
// 30-second force-kill timeout on every restart.
registerStreamShutdown();

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
import { NullAiAssistant } from './ai/null-assistant';
import { DrizzleStoryMapRepository } from './repository/drizzle-story-map-repository';

export interface Deps {
	storyMapRepository: StoryMapRepository;
	aiAssistant: AiAssistant;
}

export const deps: Deps = {
	storyMapRepository: new DrizzleStoryMapRepository(db),
	aiAssistant: new NullAiAssistant()
};

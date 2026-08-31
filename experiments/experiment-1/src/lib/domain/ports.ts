/**
 * The two outbound ports. See ADR 0006 for why these are the only ports
 * (no inbound ports, no `Clock`/`Id` ports) and ADR 0007 for the
 * `AiAssistant` contract-style commitment.
 */

import type { MapId } from './ids';
import type { StoryMap } from './story-map';

/**
 * Loads and saves a whole `StoryMap` aggregate. This is the port that keeps
 * the domain layer's rank math and move/slice semantics free of Drizzle
 * types, so `src/lib/domain/` unit-tests with zero database (see ADR 0004).
 * Start coarse (whole-map `save()`); revisit only if drags feel slow.
 */
export interface StoryMapRepository {
	load(id: MapId): Promise<StoryMap | null>;
	/** Saves only when `map.version` is still current, then returns the new version. */
	save(map: StoryMap): Promise<StoryMap>;
	listSummaries(): Promise<{ id: MapId; name: string; createdAt: Date }[]>;
	delete(id: MapId): Promise<void>;
}

/**
 * The user-mandated AI seam (ADR 0007). The method list below is
 * provisional — expected to change once a real AI feature is scoped — but
 * the contract style is locked in regardless of which methods change:
 * inputs are domain snapshots (plain data derived from `StoryMap`), never
 * free text or a raw prompt string; outputs are structured suggestions the
 * caller can apply or discard, never free-form text the UI has to parse.
 */
export interface AiAssistant {
	/**
	 * Given a snapshot of a step (its name, and its existing stories' titles),
	 * suggests additional candidate stories for that step. Returns an empty
	 * array rather than throwing when it has nothing to suggest.
	 */
	suggestStoriesForStep(snapshot: StepSnapshot): Promise<StorySuggestion[]>;
}

export interface StepSnapshot {
	stepName: string;
	activityName: string;
	existingStoryTitles: string[];
}

export interface StorySuggestion {
	title: string;
	description: string | null;
	/** 0-1: the assistant's own confidence, for the UI to sort/filter by. */
	confidence: number;
}

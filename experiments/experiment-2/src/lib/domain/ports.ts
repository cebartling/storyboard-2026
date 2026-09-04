/**
 * The two outbound ports. See ADR 0006 for why these are the only ports
 * (no inbound ports, no `Clock`/`Id` ports) and ADR 0007 for the
 * `AiAssistant` contract-style commitment.
 */

import type { MapId, UserId } from './ids';
import type { StoryMap } from './story-map';

/**
 * Loads and saves a whole `StoryMap` aggregate. This is the port that keeps
 * the domain layer's rank math and move/slice semantics free of Drizzle
 * types, so `src/lib/domain/` unit-tests with zero database (see ADR 0004).
 * Start coarse (whole-map `save()`); revisit only if drags feel slow.
 *
 * Every method takes a `Caller`, which is the port-signature change ADR 0006
 * priced (finding A10) and ADR 0015 pays. Authorisation is enforced in the
 * adapters rather than the app layer because the adapters are what hold the
 * membership rows: one query answers "does this exist" and "may they" together,
 * and a non-member simply gets null. The cost of policy living in two
 * implementations is drift, which is why both are held to one shared contract
 * test (`src/lib/app/story-map-repository-contract.ts`).
 */
export type Role = 'owner' | 'editor';

/**
 * Who is making the request. A value, not a service — the app layer never sees
 * a user record, only this (ADR 0015).
 */
export interface Caller {
	readonly userId: UserId;
}

/** A map the caller may see, and what they are allowed to do with it. */
export interface MapAccess {
	map: StoryMap;
	role: Role;
}

export interface MapSummary {
	id: MapId;
	name: string;
	createdAt: Date;
	role: Role;
}

export interface StoryMapRepository {
	/**
	 * Returns null when the map does not exist **or** the caller is not a member.
	 * The two are deliberately indistinguishable: a caller who could tell them
	 * apart could enumerate other people's map ids.
	 */
	load(caller: Caller, id: MapId): Promise<MapAccess | null>;
	/**
	 * Saves only when `map.version` is still current, then returns the new
	 * version. A map the store has never seen is created with `caller` as its
	 * owner, in the same transaction — there is no window in which a map exists
	 * with nobody able to reach it.
	 */
	save(caller: Caller, map: StoryMap): Promise<StoryMap>;
	listSummaries(caller: Caller): Promise<MapSummary[]>;
	/**
	 * The caller's role on a map, or null if the map is missing or they are not a
	 * member — the same conflation `load` makes, and for the same reason.
	 *
	 * Exists because authorising an action does not always need the aggregate.
	 * The cursor endpoint fires up to twenty times a second per tab and wants
	 * only a yes or no; going through `load` for that rebuilds the whole board
	 * from five queries to throw it away.
	 */
	roleOf(caller: Caller, id: MapId): Promise<Role | null>;
	/** Owner only. A no-op when the map is missing or the caller is not a member. */
	delete(caller: Caller, id: MapId): Promise<void>;
	/** Owner only, and idempotent for someone who is already a member. */
	addMember(caller: Caller, id: MapId, userId: UserId, role: 'editor'): Promise<void>;
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

import type { Collection, Db } from 'mongodb';
import type { MapId, UserId } from '$lib/domain/ids';
import type { Role } from '$lib/domain/ports';

/**
 * The shapes actually stored, and typed accessors for the four collections.
 *
 * These are *documents*, not domain types. The mapping between them lives in
 * the repository — keeping it there is what stops MongoDB's vocabulary (`_id`,
 * `null` versus absent) leaking into `src/lib/domain/`.
 */

/**
 * A whole story map, as one document (ADR 0003).
 *
 * The aggregate boundary was already drawn here — ADR 0004 chose
 * a single whole-map aggregate loaded and saved as a unit, and then spent a
 * five-query id ladder and a delete-and-reinsert-every-row `save()` taking it
 * apart to fit five tables. Embedded, `load()` is a `findOne` and `save()` is
 * one atomic update.
 *
 * `_id` is the domain's own UUIDv7 string. Deliberately not an `ObjectId`: ids
 * are minted in the domain (`newId()`), are branded strings there, and travel
 * to the client in URLs.
 */
export interface MapDoc {
	_id: MapId;
	name: string;
	createdAt: Date;
	version: number;
	activities: {
		id: string;
		mapId: string;
		name: string;
		rank: string;
		steps: { id: string; activityId: string; name: string; rank: string }[];
	}[];
	slices: { id: string; mapId: string; name: string; rank: string }[];
	/**
	 * Flat, matching the domain shape rather than nesting under steps. A story's
	 * `sliceId` is `null` for the unsliced band — written explicitly rather than
	 * omitted, because Mongo distinguishes a missing field from a null one and
	 * the unsliced band is the *default* for every new story.
	 */
	stories: {
		id: string;
		stepId: string;
		title: string;
		description: string | null;
		sliceId: string | null;
		rank: string;
	}[];
}

export interface UserDoc {
	_id: UserId;
	/** Stored lowercased and trimmed, so uniqueness means what a person expects. */
	email: string;
	displayName: string;
	/** `scrypt$<salt>$<hash>`, both base64url. See `auth/password.ts`. */
	passwordHash: string;
	createdAt: Date;
}

/** `_id` is the SHA-256 of the token; the raw token exists only in the cookie. */
export interface SessionDoc {
	_id: string;
	userId: UserId;
	expiresAt: Date;
}

/**
 * Membership is its own collection rather than a field on the map, for the
 * reason ADR 0015 gives: sharing and editing are different
 * operations that should not contend. Embedded here, adding an editor would
 * bump the map's version and lose a race against someone dragging a card.
 */
export interface MapMemberDoc {
	_id: string;
	mapId: MapId;
	userId: UserId;
	role: Role;
}

export interface Collections {
	maps: Collection<MapDoc>;
	users: Collection<UserDoc>;
	sessions: Collection<SessionDoc>;
	mapMembers: Collection<MapMemberDoc>;
}

export function collections(db: Db): Collections {
	return {
		maps: db.collection<MapDoc>('maps'),
		users: db.collection<UserDoc>('users'),
		sessions: db.collection<SessionDoc>('sessions'),
		mapMembers: db.collection<MapMemberDoc>('mapMembers')
	};
}

/** A membership row's id, derived so that (map, user) can only appear once. */
export function memberId(mapId: MapId, userId: UserId): string {
	return `${mapId}:${userId}`;
}

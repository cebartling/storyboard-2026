import { createHash, randomBytes } from 'node:crypto';
import { MongoServerError, type Db, type MongoClient } from 'mongodb';
import { InvariantError } from '$lib/domain/errors';
import { newId, type UserId } from '$lib/domain/ids';
import { collections, type Collections, type UserDoc } from '../db/collections';
import { hashPassword, verifyPassword } from './password';

/**
 * Accounts and sessions (ADR 0015).
 *
 * Deliberately not behind a port. ADR 0006 admits exactly two outbound ports
 * and gives the test for adding one: a port earns its place when it buys
 * testability or a second implementation. This has one implementation, one
 * consumer (the auth routes and the hook), and is testable against an in-memory
 * MongoDB — so a `UserRepository` would be ceremony.
 *
 * Nothing here reaches `src/lib/domain/` or `src/lib/app/`: those layers see a
 * `Caller`, which is a value, and never a user record.
 *
 * Every method is now `async`. Under SQLite these were synchronous, because
 * better-sqlite3 is; the driver is what decided that, not the design.
 */

export interface AuthenticatedUser {
	id: UserId;
	email: string;
	displayName: string;
}

export interface Session {
	token: string;
	expiresAt: Date;
}

/** 30 days, fixed. No sliding renewal — nothing yet needs it. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** MongoDB's duplicate-key error. The one thing standing between two
 *  simultaneous registrations of the same address and two accounts. */
const DUPLICATE_KEY = 11000;

/**
 * The row key for a session token. Storing the digest rather than the token
 * means a leaked database does not hand over live sessions — the raw value
 * exists only in the user's cookie.
 */
function tokenDigest(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/** Emails compare and store lowercased and trimmed, so uniqueness means what a
 *  person expects it to mean. */
export function normaliseEmail(email: string): string {
	return email.trim().toLowerCase();
}

/**
 * A hash of a random password, computed once per process and reused. Only ever
 * compared against, so that a login for an address with no account costs the
 * same as one with — see `login`.
 */
let decoy: Promise<string> | null = null;
function decoyHash(): Promise<string> {
	decoy ??= hashPassword(randomBytes(32).toString('base64url'));
	return decoy;
}

export class Auth {
	constructor(
		private readonly db: Db,
		/** Needed only by `deleteUser`, which is the one operation here that spans
		 *  more than one collection. */
		private readonly client: MongoClient
	) {}

	// Per call, not in the constructor — see the note on
	// `MongoStoryMapRepository`'s equivalent, and `db/index.ts`.
	private get c(): Collections {
		return collections(this.db);
	}

	async register(email: string, displayName: string, password: string): Promise<AuthenticatedUser> {
		const normalised = normaliseEmail(email);
		if (!normalised.includes('@')) {
			throw new InvariantError('Enter an email address.');
		}
		if (displayName.trim().length === 0) {
			throw new InvariantError('Enter a display name.');
		}
		if (password.length < 8) {
			throw new InvariantError('Use a password of at least 8 characters.');
		}
		// Checked here so the form can say something useful, but this is not what
		// makes it safe — see the catch below.
		if (await this.findByEmail(normalised)) {
			throw new InvariantError('That email address is already registered.');
		}

		const user: UserDoc = {
			_id: newId<UserId>(),
			email: normalised,
			displayName: displayName.trim(),
			passwordHash: await hashPassword(password),
			createdAt: new Date()
		};
		try {
			await this.c.users.insertOne(user);
		} catch (error) {
			// The check above is a read and the insert is a write, so two
			// simultaneous registrations can both pass it. The unique index is what
			// actually closes that race; this turns its error into the same message
			// the check gives, so the form reads the same either way.
			if (error instanceof MongoServerError && error.code === DUPLICATE_KEY) {
				throw new InvariantError('That email address is already registered.');
			}
			throw error;
		}
		return { id: user._id, email: user.email, displayName: user.displayName };
	}

	private findByEmail(normalisedEmail: string): Promise<UserDoc | null> {
		return this.c.users.findOne({ email: normalisedEmail });
	}

	/**
	 * Returns null for both an unknown email and a wrong password, and takes the
	 * same time doing it.
	 *
	 * Returning early for an unknown address would leave a timing channel that
	 * says which addresses have accounts — and a wide one, since scrypt at the
	 * cost ADR 0015 requires takes on the order of a tenth of a second. So a
	 * missing user is verified against a fixed hash whose password nobody knows,
	 * purely to spend the same time.
	 *
	 * This closes the channel *here*. It does not make accounts unenumerable:
	 * `/register` still answers "That email address is already registered",
	 * which is the honest trade for a usable signup form.
	 */
	async login(
		email: string,
		password: string
	): Promise<{ user: AuthenticatedUser; session: Session } | null> {
		const row = await this.findByEmail(normaliseEmail(email));
		if (!row) {
			await verifyPassword(password, await decoyHash());
			return null;
		}
		if (!(await verifyPassword(password, row.passwordHash))) return null;

		return {
			user: { id: row._id, email: row.email, displayName: row.displayName },
			session: await this.createSession(row._id)
		};
	}

	async createSession(userId: UserId): Promise<Session> {
		const token = randomBytes(32).toString('base64url');
		const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
		await this.c.sessions.insertOne({ _id: tokenDigest(token), userId, expiresAt });
		return { token, expiresAt };
	}

	/** The user behind a cookie, or null if the token is unknown or expired. */
	async validateSession(token: string): Promise<AuthenticatedUser | null> {
		const id = tokenDigest(token);
		// Two point lookups rather than the `$lookup` that would replace the old
		// join. At one call per request, the join is not worth the aggregation
		// pipeline, and the second lookup only happens for a live session.
		const session = await this.c.sessions.findOne({ _id: id });
		if (!session) return null;
		if (session.expiresAt.getTime() <= Date.now()) {
			// Expired sessions are cleared on the way past rather than by a sweep:
			// there is no scheduler here, and this is the only code that looks at
			// them.
			await this.c.sessions.deleteOne({ _id: id });
			return null;
		}

		const user = await this.c.users.findOne({ _id: session.userId });
		// Reachable now in a way it was not under SQLite, where a foreign key
		// removed the session with the user. `deleteUser` does that job instead,
		// and this is the backstop if anything ever bypasses it.
		if (!user) {
			await this.c.sessions.deleteOne({ _id: id });
			return null;
		}
		return { id: user._id, email: user.email, displayName: user.displayName };
	}

	async logout(token: string): Promise<void> {
		await this.c.sessions.deleteOne({ _id: tokenDigest(token) });
	}

	/** Used by sharing: find the account someone typed an email address for. */
	async findUserByEmail(email: string): Promise<AuthenticatedUser | null> {
		const row = await this.findByEmail(normaliseEmail(email));
		return row ? { id: row._id, email: row.email, displayName: row.displayName } : null;
	}

	/**
	 * A user, their sessions, and their memberships — together.
	 *
	 * Two foreign keys hung off `users.id` in experiment-1, both
	 * `ON DELETE CASCADE`: `sessions.user_id` and `map_members.user_id`. MongoDB
	 * has neither, so this is application code or it is nothing.
	 *
	 * "Nothing" is worse than it sounds for the second one. A leftover membership
	 * row does not just linger: if the deleted account **owned** a map, the
	 * partial unique index that allows one owner per map means that orphaned row
	 * blocks any future owner forever, and there is no screen that can clear it.
	 * The sessions half is the more obvious hazard — a deleted account keeps
	 * working until its cookie expires — but the membership half is the one that
	 * cannot be undone.
	 *
	 * In a transaction, because a half-applied delete is exactly the state
	 * described above.
	 *
	 * **What this deliberately does not do is decide what happens to maps the
	 * account owned.** Deleting them would destroy other members' work; handing
	 * them on would pick a new owner arbitrarily. Nothing in the app deletes an
	 * account yet, so the question is not answered here rather than answered
	 * badly — but it must be answered before one does.
	 */
	async deleteUser(userId: UserId): Promise<void> {
		const session = this.client.startSession();
		try {
			await session.withTransaction(async () => {
				await this.c.users.deleteOne({ _id: userId }, { session });
				await this.c.sessions.deleteMany({ userId }, { session });
				await this.c.mapMembers.deleteMany({ userId }, { session });
			});
		} finally {
			await session.endSession();
		}
	}

	/** Housekeeping, exposed for tests and a future sweep. */
	async deleteExpiredSessions(now = new Date()): Promise<void> {
		await this.c.sessions.deleteMany({ expiresAt: { $lt: now } });
	}
}

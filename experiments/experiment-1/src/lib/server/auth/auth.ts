import { createHash, randomBytes } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { InvariantError } from '$lib/domain/errors';
import { newId, type UserId } from '$lib/domain/ids';
import * as schema from '../db/schema';
import { hashPassword, verifyPassword } from './password';

/**
 * Accounts and sessions (ADR 0016).
 *
 * Deliberately not behind a port. ADR 0006 admits exactly two outbound ports
 * and gives the test for adding one: a port earns its place when it buys
 * testability or a second implementation. This has one implementation, one
 * consumer (the auth routes and the hook), and is already testable against a
 * temp SQLite file — so a `UserRepository` would be ceremony.
 *
 * Nothing here reaches `src/lib/domain/` or `src/lib/app/`: those layers see a
 * `Caller`, which is a value, and never a user record.
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

export class Auth {
	constructor(private readonly db: BetterSQLite3Database<typeof schema>) {}

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
		if (this.findByEmail(normalised)) {
			throw new InvariantError('That email address is already registered.');
		}

		const user = {
			id: newId<UserId>(),
			email: normalised,
			displayName: displayName.trim(),
			passwordHash: await hashPassword(password)
		};
		this.db.insert(schema.users).values(user).run();
		return { id: user.id, email: user.email, displayName: user.displayName };
	}

	private findByEmail(normalisedEmail: string) {
		return this.db.select().from(schema.users).where(eq(schema.users.email, normalisedEmail)).get();
	}

	/** Returns null for both an unknown email and a wrong password: telling them
	 *  apart would confirm which addresses have accounts. */
	async login(
		email: string,
		password: string
	): Promise<{ user: AuthenticatedUser; session: Session } | null> {
		const row = this.findByEmail(normaliseEmail(email));
		if (!row) return null;
		if (!(await verifyPassword(password, row.passwordHash))) return null;

		return {
			user: { id: row.id as UserId, email: row.email, displayName: row.displayName },
			session: this.createSession(row.id as UserId)
		};
	}

	createSession(userId: UserId): Session {
		const token = randomBytes(32).toString('base64url');
		const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
		this.db
			.insert(schema.sessions)
			.values({ id: tokenDigest(token), userId, expiresAt })
			.run();
		return { token, expiresAt };
	}

	/** The user behind a cookie, or null if the token is unknown or expired. */
	validateSession(token: string): AuthenticatedUser | null {
		const row = this.db
			.select({
				id: schema.users.id,
				email: schema.users.email,
				displayName: schema.users.displayName,
				expiresAt: schema.sessions.expiresAt
			})
			.from(schema.sessions)
			.innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
			.where(eq(schema.sessions.id, tokenDigest(token)))
			.get();

		if (!row) return null;
		if (row.expiresAt.getTime() <= Date.now()) {
			// Expired sessions are cleared on the way past rather than by a sweep:
			// there is no scheduler here, and this is the only code that looks at
			// them.
			this.db
				.delete(schema.sessions)
				.where(eq(schema.sessions.id, tokenDigest(token)))
				.run();
			return null;
		}
		return { id: row.id as UserId, email: row.email, displayName: row.displayName };
	}

	logout(token: string): void {
		this.db
			.delete(schema.sessions)
			.where(eq(schema.sessions.id, tokenDigest(token)))
			.run();
	}

	/** Used by sharing: find the account someone typed an email address for. */
	findUserByEmail(email: string): AuthenticatedUser | null {
		const row = this.findByEmail(normaliseEmail(email));
		return row ? { id: row.id as UserId, email: row.email, displayName: row.displayName } : null;
	}

	/** Housekeeping, exposed for tests and a future sweep. */
	deleteExpiredSessions(now = new Date()): void {
		this.db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, now)).run();
	}
}

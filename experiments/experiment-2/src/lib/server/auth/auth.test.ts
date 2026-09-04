import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from 'mongodb';
import { InvariantError } from '$lib/domain/errors';
import { collections, type Collections } from '../db/collections';
import { freshDatabase } from '../test-support/mongo';
import { Auth, SESSION_TTL_MS } from './auth';

describe('Auth', () => {
	let db: Db;
	let c: Collections;
	let auth: Auth;

	beforeEach(async () => {
		// A fresh database per test, indexes and all. The unique index on
		// `users.email` is not decoration here — it is what `register` relies on to
		// close its check-then-insert race.
		({ db } = await freshDatabase());
		c = collections(db);
		auth = new Auth(db);
	});

	describe('register', () => {
		it('stores the email lowercased and trimmed', async () => {
			const user = await auth.register('  Ada@Example.TEST  ', 'Ada', 'hunter2hunter2');

			expect(user.email).toBe('ada@example.test');
		});

		it('never stores the password', async () => {
			await auth.register('ada@example.test', 'Ada', 'hunter2hunter2');

			const row = (await c.users.findOne({}))!;
			expect(row.passwordHash).not.toContain('hunter2');
		});

		it('rejects a duplicate email, including one that differs only in case', async () => {
			await auth.register('ada@example.test', 'Ada', 'hunter2hunter2');

			await expect(
				auth.register('ADA@example.test', 'Ada again', 'hunter2hunter2')
			).rejects.toThrow(InvariantError);
		});

		it('lets only one of two simultaneous registrations of an address through', async () => {
			// The `findByEmail` check in `register` is a read followed by a write, so
			// both of these get past it. The unique index is the only thing that
			// stops two accounts existing for one address — this test fails if that
			// index is ever dropped from `ensureIndexes`.
			const results = await Promise.allSettled([
				auth.register('ada@example.test', 'Ada', 'hunter2hunter2'),
				auth.register('ada@example.test', 'Ada', 'hunter2hunter2')
			]);

			expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
			expect(await c.users.countDocuments()).toBe(1);
			const rejection = results.find((r) => r.status === 'rejected');
			// And it fails the way the form expects, not with a raw driver error.
			expect(rejection?.reason).toBeInstanceOf(InvariantError);
		});

		it.each([
			['no-at-sign', 'Ada', 'hunter2hunter2'],
			['ada@example.test', '   ', 'hunter2hunter2'],
			['ada@example.test', 'Ada', 'short']
		])('rejects (%p, %p, %p) with a message the person can act on', async (email, name, pw) => {
			await expect(auth.register(email, name, pw)).rejects.toThrow(InvariantError);
		});
	});

	describe('login', () => {
		it('returns a user and a session for the right password', async () => {
			await auth.register('ada@example.test', 'Ada', 'hunter2hunter2');

			const result = await auth.login('ada@example.test', 'hunter2hunter2');

			expect(result?.user.displayName).toBe('Ada');
			expect(result?.session.token).toBeTruthy();
		});

		it('returns null for a wrong password', async () => {
			await auth.register('ada@example.test', 'Ada', 'hunter2hunter2');

			expect(await auth.login('ada@example.test', 'wrong-password')).toBeNull();
		});

		it('returns null for an unknown email, indistinguishably from a wrong password', async () => {
			// Same answer both ways, so login cannot be used to discover which
			// addresses have accounts.
			expect(await auth.login('nobody@example.test', 'hunter2hunter2')).toBeNull();
		});

		it('takes as long to refuse an unknown address as a wrong password', async () => {
			// Returning early for a missing user would answer "does this address
			// have an account" by the clock — and loudly, since scrypt at the cost
			// ADR 0015 requires takes on the order of a tenth of a second.
			await auth.register('ada@example.test', 'Ada', 'hunter2hunter2');
			// Warm the decoy hash, which is computed once per process.
			await auth.login('nobody@example.test', 'x');

			const wrongPasswordAt = Date.now();
			await auth.login('ada@example.test', 'wrong-password');
			const wrongPassword = Date.now() - wrongPasswordAt;

			const unknownAt = Date.now();
			await auth.login('nobody@example.test', 'wrong-password');
			const unknown = Date.now() - unknownAt;

			// Both do real work; neither is an early return. Generous bounds — this
			// is about orders of magnitude, not microseconds.
			expect(unknown).toBeGreaterThan(wrongPassword / 4);
			expect(wrongPassword).toBeGreaterThan(unknown / 4);
		});
	});

	describe('sessions', () => {
		it('stores the digest of the token, never the token itself', async () => {
			await auth.register('ada@example.test', 'Ada', 'hunter2hunter2');
			const { session } = (await auth.login('ada@example.test', 'hunter2hunter2'))!;

			const row = (await c.sessions.findOne({}))!;
			expect(row._id).not.toBe(session.token);
			expect(row._id).toMatch(/^[0-9a-f]{64}$/);
		});

		it('resolves a live token to its user', async () => {
			await auth.register('ada@example.test', 'Ada', 'hunter2hunter2');
			const { session } = (await auth.login('ada@example.test', 'hunter2hunter2'))!;

			expect((await auth.validateSession(session.token))?.email).toBe('ada@example.test');
		});

		it('rejects an unknown token', async () => {
			expect(await auth.validateSession('not-a-real-token')).toBeNull();
		});

		it('rejects an expired token and clears the row on the way past', async () => {
			const user = await auth.register('ada@example.test', 'Ada', 'hunter2hunter2');
			const session = await auth.createSession(user.id);
			await c.sessions.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });

			expect(await auth.validateSession(session.token)).toBeNull();
			expect(await c.sessions.countDocuments()).toBe(0);
		});

		it('expires 30 days out', async () => {
			const user = await auth.register('ada@example.test', 'Ada', 'hunter2hunter2');

			const session = await auth.createSession(user.id);

			const expected = Date.now() + SESSION_TTL_MS;
			expect(Math.abs(session.expiresAt.getTime() - expected)).toBeLessThan(5000);
		});

		it('logout deletes the session, which is what a signed cookie could not do', async () => {
			await auth.register('ada@example.test', 'Ada', 'hunter2hunter2');
			const { session } = (await auth.login('ada@example.test', 'hunter2hunter2'))!;

			await auth.logout(session.token);

			expect(await auth.validateSession(session.token)).toBeNull();
		});

		it('deleting a user takes their sessions with them', async () => {
			// Under SQLite this was a foreign key with ON DELETE CASCADE, and the
			// test could delete the row directly. MongoDB has no such thing, so the
			// cascade is `deleteUser` — application code, and therefore something
			// that can be forgotten. Hence this test, unchanged in intent.
			const user = await auth.register('ada@example.test', 'Ada', 'hunter2hunter2');
			await auth.createSession(user.id);

			await auth.deleteUser(user.id);

			expect(await c.sessions.countDocuments()).toBe(0);
		});

		it('refuses a session whose user is gone even if something bypasses deleteUser', async () => {
			// The cascade above is the intended path; this is the backstop. Deleting
			// the user row directly is exactly what a future admin script, or a
			// second code path added later, would do without knowing about
			// `deleteUser` — and a live cookie must not survive it.
			const user = await auth.register('ada@example.test', 'Ada', 'hunter2hunter2');
			const session = await auth.createSession(user.id);

			await c.users.deleteOne({ _id: user.id });

			expect(await auth.validateSession(session.token)).toBeNull();
			expect(await c.sessions.countDocuments()).toBe(0);
		});
	});

	describe('findUserByEmail', () => {
		it('finds an account by an address typed in any case, for sharing', async () => {
			await auth.register('ada@example.test', 'Ada', 'hunter2hunter2');

			expect((await auth.findUserByEmail('  ADA@Example.test '))?.displayName).toBe('Ada');
		});

		it('returns null for an address with no account', async () => {
			expect(await auth.findUserByEmail('nobody@example.test')).toBeNull();
		});
	});
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InvariantError } from '$lib/domain/errors';
import * as schema from '../db/schema';
import { openDatabase } from '../db/open';
import { Auth, SESSION_TTL_MS } from './auth';

const migrationsFolder = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../../../drizzle'
);

describe('Auth', () => {
	let tmpDir: string;
	let client: ReturnType<typeof openDatabase>;
	let db: BetterSQLite3Database<typeof schema>;
	let auth: Auth;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-test-'));
		client = openDatabase(path.join(tmpDir, 'test.db'));
		db = drizzle(client, { schema });
		migrate(db, { migrationsFolder });
		auth = new Auth(db);
	});

	afterEach(() => {
		client.close();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	describe('register', () => {
		it('stores the email lowercased and trimmed', async () => {
			const user = await auth.register('  Ada@Example.TEST  ', 'Ada', 'hunter2hunter2');

			expect(user.email).toBe('ada@example.test');
		});

		it('never stores the password', async () => {
			await auth.register('ada@example.test', 'Ada', 'hunter2hunter2');

			const row = db.select().from(schema.users).get()!;
			expect(row.passwordHash).not.toContain('hunter2');
		});

		it('rejects a duplicate email, including one that differs only in case', async () => {
			await auth.register('ada@example.test', 'Ada', 'hunter2hunter2');

			await expect(
				auth.register('ADA@example.test', 'Ada again', 'hunter2hunter2')
			).rejects.toThrow(InvariantError);
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
			// ADR 0016 requires takes on the order of a tenth of a second.
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

			const row = db.select().from(schema.sessions).get()!;
			expect(row.id).not.toBe(session.token);
			expect(row.id).toMatch(/^[0-9a-f]{64}$/);
		});

		it('resolves a live token to its user', async () => {
			await auth.register('ada@example.test', 'Ada', 'hunter2hunter2');
			const { session } = (await auth.login('ada@example.test', 'hunter2hunter2'))!;

			expect(auth.validateSession(session.token)?.email).toBe('ada@example.test');
		});

		it('rejects an unknown token', () => {
			expect(auth.validateSession('not-a-real-token')).toBeNull();
		});

		it('rejects an expired token and clears the row on the way past', async () => {
			const user = await auth.register('ada@example.test', 'Ada', 'hunter2hunter2');
			const session = auth.createSession(user.id);
			db.update(schema.sessions)
				.set({ expiresAt: new Date(Date.now() - 1000) })
				.run();

			expect(auth.validateSession(session.token)).toBeNull();
			expect(db.select().from(schema.sessions).all()).toHaveLength(0);
		});

		it('expires 30 days out', async () => {
			const user = await auth.register('ada@example.test', 'Ada', 'hunter2hunter2');

			const session = auth.createSession(user.id);

			const expected = Date.now() + SESSION_TTL_MS;
			expect(Math.abs(session.expiresAt.getTime() - expected)).toBeLessThan(5000);
		});

		it('logout deletes the session, which is what a signed cookie could not do', async () => {
			await auth.register('ada@example.test', 'Ada', 'hunter2hunter2');
			const { session } = (await auth.login('ada@example.test', 'hunter2hunter2'))!;

			auth.logout(session.token);

			expect(auth.validateSession(session.token)).toBeNull();
		});

		it('deleting a user takes their sessions with them', async () => {
			const user = await auth.register('ada@example.test', 'Ada', 'hunter2hunter2');
			auth.createSession(user.id);

			db.delete(schema.users).where(eq(schema.users.id, user.id)).run();

			expect(db.select().from(schema.sessions).all()).toHaveLength(0);
		});
	});

	describe('findUserByEmail', () => {
		it('finds an account by an address typed in any case, for sharing', async () => {
			await auth.register('ada@example.test', 'Ada', 'hunter2hunter2');

			expect(auth.findUserByEmail('  ADA@Example.test ')?.displayName).toBe('Ada');
		});

		it('returns null for an address with no account', () => {
			expect(auth.findUserByEmail('nobody@example.test')).toBeNull();
		});
	});
});

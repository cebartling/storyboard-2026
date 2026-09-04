import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type Database from 'better-sqlite3';
import { BUSY_TIMEOUT_MS, openDatabase } from './open';

// Unit test for the connection pragmas ADR 0015 Stage 0 requires. Separate
// from `index.ts` on purpose: that module reads `$env/dynamic/private` and
// runs migrations at import time, neither of which a pragma test needs.

/**
 * Holds a write lock on `file` from another thread, so the busy-timeout
 * behaviour can be observed. A worker rather than a timer because
 * better-sqlite3 is synchronous: its busy wait blocks this thread's event
 * loop entirely, so a `setTimeout` here would never fire to release the lock.
 */
function holdWriteLock(file: string, holdMs: number): { locked: Promise<void>; worker: Worker } {
	const worker = new Worker(
		`
		const { parentPort, workerData } = require('node:worker_threads');
		const Database = require('better-sqlite3');
		const db = new Database(workerData.file);
		db.exec('BEGIN IMMEDIATE');
		parentPort.postMessage('locked');
		// Block this worker thread for the hold duration, then release.
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, workerData.holdMs);
		db.exec('COMMIT');
		db.close();
		`,
		{ eval: true, workerData: { file, holdMs } }
	);

	const locked = new Promise<void>((resolve, reject) => {
		worker.once('message', (message) => {
			if (message === 'locked') resolve();
			else reject(new Error(`unexpected first message: ${message}`));
		});
		worker.once('error', reject);
	});

	return { locked, worker };
}

describe('openDatabase', () => {
	let tmpDir: string;
	let file: string;
	let client: Database.Database | null;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-db-test-'));
		file = path.join(tmpDir, 'test.db');
		client = null;
	});

	afterEach(() => {
		client?.close();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('opens the database in WAL journal mode', () => {
		client = openDatabase(file);

		expect(client.pragma('journal_mode', { simple: true })).toBe('wal');
	});

	it('sets a busy timeout so a contended write waits instead of throwing', () => {
		client = openDatabase(file);

		expect(client.pragma('busy_timeout', { simple: true })).toBe(BUSY_TIMEOUT_MS);
	});

	it('enforces foreign keys, which SQLite leaves off per connection', () => {
		client = openDatabase(file);

		expect(client.pragma('foreign_keys', { simple: true })).toBe(1);
	});

	it('waits for another connection to release its write lock instead of throwing SQLITE_BUSY', async () => {
		// Create the file and switch it to WAL first, so the worker and this
		// connection agree on the journal mode before either takes a lock.
		client = openDatabase(file);
		client.exec('CREATE TABLE seed (x)');

		const holdMs = 300;
		const { locked, worker } = holdWriteLock(file, holdMs);
		await locked;

		const startedAt = Date.now();
		expect(() => client!.exec('CREATE TABLE t (x)')).not.toThrow();
		const elapsed = Date.now() - startedAt;

		// It must have actually blocked on the other writer, not raced past it.
		expect(elapsed).toBeGreaterThanOrEqual(holdMs * 0.8);
		await worker.terminate();
	});
});

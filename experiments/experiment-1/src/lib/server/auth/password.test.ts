import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
	it('verifies the password it hashed', async () => {
		const stored = await hashPassword('correct horse battery staple');

		expect(await verifyPassword('correct horse battery staple', stored)).toBe(true);
	});

	it('rejects a wrong password', async () => {
		const stored = await hashPassword('correct horse battery staple');

		expect(await verifyPassword('Correct horse battery staple', stored)).toBe(false);
	});

	it('never stores the password itself', async () => {
		const stored = await hashPassword('hunter2');

		expect(stored).not.toContain('hunter2');
	});

	it('salts, so the same password hashes differently every time', async () => {
		const [a, b] = await Promise.all([hashPassword('hunter2'), hashPassword('hunter2')]);

		expect(a).not.toBe(b);
		// ...and both still verify, which is what makes the salt harmless.
		expect(await verifyPassword('hunter2', a)).toBe(true);
		expect(await verifyPassword('hunter2', b)).toBe(true);
	});

	it('records which algorithm produced it, so a later one can be swapped in', async () => {
		expect(await hashPassword('hunter2')).toMatch(/^scrypt\$[\w-]+\$[\w-]+$/);
	});

	it.each(['', 'not-a-hash', 'scrypt$only-one-part', 'argon2$c2FsdA$aGFzaA'])(
		'fails the login rather than the request for stored value %p',
		async (stored) => {
			await expect(verifyPassword('hunter2', stored)).resolves.toBe(false);
		}
	);
});

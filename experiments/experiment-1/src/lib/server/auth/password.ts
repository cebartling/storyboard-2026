import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
	password: string,
	salt: Buffer,
	keylen: number
) => Promise<Buffer>;

const SALT_BYTES = 16;
const KEY_BYTES = 64;
const PREFIX = 'scrypt';

/**
 * Password hashing on `node:crypto` alone (ADR 0016).
 *
 * No dependency: Node 24+ ships `scrypt`, `randomBytes` and `timingSafeEqual`,
 * which is everything the `sv add lucia` add-on installs three packages to
 * provide. OWASP lists scrypt beside argon2id as an acceptable choice.
 *
 * The stored form carries its algorithm — `scrypt$<salt>$<hash>`, both
 * base64url — so moving to argon2 later is a new prefix and a rehash on next
 * login, rather than a migration that has to invalidate every password at once.
 */
export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(SALT_BYTES);
	const key = await scryptAsync(password, salt, KEY_BYTES);
	return `${PREFIX}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

/**
 * Returns false rather than throwing for a malformed stored hash: a corrupt row
 * should fail the login, not the request.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [algorithm, saltPart, keyPart] = stored.split('$');
	if (algorithm !== PREFIX || !saltPart || !keyPart) return false;

	let salt: Buffer;
	let expected: Buffer;
	try {
		salt = Buffer.from(saltPart, 'base64url');
		expected = Buffer.from(keyPart, 'base64url');
	} catch {
		return false;
	}
	if (expected.length !== KEY_BYTES) return false;

	const actual = await scryptAsync(password, salt, KEY_BYTES);
	// Constant-time: a length-independent early return would leak how much of
	// the hash matched.
	return timingSafeEqual(actual, expected);
}

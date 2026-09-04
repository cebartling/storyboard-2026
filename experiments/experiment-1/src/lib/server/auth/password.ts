import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
	password: string,
	salt: Buffer,
	keylen: number,
	options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

const SALT_BYTES = 16;
const KEY_BYTES = 64;
const PREFIX = 'scrypt';

/**
 * OWASP's minimum for scrypt, which is the standard ADR 0016 cites to justify
 * choosing it. Node's own default is N=2^14 — eight times cheaper for an
 * attacker working offline against a leaked `users` table — so it has to be
 * given explicitly rather than relied upon.
 *
 * `maxmem` must be raised alongside `N`: the default 32MB ceiling is below what
 * N=2^17 needs (roughly 128 × N × r bytes), and scrypt throws rather than
 * quietly using less.
 */
const COST = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 } as const;

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
 * The cost parameters are not in the stored string: changing them is the same
 * kind of change, and would be handled the same way.
 */
export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(SALT_BYTES);
	const key = await scryptAsync(password, salt, KEY_BYTES, COST);
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

	const actual = await scryptAsync(password, salt, KEY_BYTES, COST);
	// Constant-time: a length-independent early return would leak how much of
	// the hash matched.
	return timingSafeEqual(actual, expected);
}

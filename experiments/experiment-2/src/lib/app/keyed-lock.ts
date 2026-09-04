/**
 * Serialises async work per key: two calls with the same key run one after the
 * other, calls with different keys run concurrently.
 *
 * This exists for ADR 0015 §2. The critical section is a use case's whole
 * `load → mutate → save`, not a single repository call, which is why it lives
 * here rather than as a decorator on `StoryMapRepository` — no port method
 * spans that section. It is also not in `deps.ts`: that wires concrete adapters
 * to ports, and a lock is neither an adapter nor a port.
 *
 * **Single-process only.** Two server instances would each have their own lock
 * and serialise nothing. ADR 0015 §2 promotes the single-process deployment
 * from an incidental fact to a correctness requirement precisely because of
 * this, and because the fractional ranks in `rank.ts` carry no actor entropy:
 * two genuinely concurrent inserts at one position produce byte-identical keys,
 * and serialised writers are what stop that from ever materialising.
 */
export class KeyedLock<K> {
	/**
	 * The tail of each key's queue. A tail only ever *resolves*, never rejects,
	 * so a caller whose work throws cannot poison the chain for everyone behind
	 * it — the rejection goes to that caller alone.
	 */
	private readonly tails = new Map<K, Promise<void>>();

	async run<T>(key: K, work: () => Promise<T>): Promise<T> {
		const previous = this.tails.get(key) ?? Promise.resolve();

		let release!: () => void;
		const finished = new Promise<void>((resolve) => {
			release = resolve;
		});

		const tail = previous.then(() => finished);
		this.tails.set(key, tail);

		await previous;
		try {
			return await work();
		} finally {
			release();
			// Only drop the entry if nobody queued behind us in the meantime.
			// Comparing identity rather than just deleting is what keeps this both
			// leak-free and correct: a blind delete would strand a later caller's
			// tail and let a third caller run alongside it.
			if (this.tails.get(key) === tail) {
				this.tails.delete(key);
			}
		}
	}

	/** How many keys are currently locked. For tests asserting no leak. */
	get held(): number {
		return this.tails.size;
	}
}

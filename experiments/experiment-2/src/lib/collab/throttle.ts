/**
 * Calls `fn` at most once per `intervalMs`, always with the most recent
 * argument, and always eventually delivering the last one.
 *
 * Trailing rather than leading-only: for a cursor, the position that matters is
 * where the pointer *stopped*, and a leading-only throttle drops exactly that.
 */
export function trailingThrottle<T>(
	fn: (value: T) => void,
	intervalMs: number
): { (value: T): void; cancel(): void } {
	let last = 0;
	let pending: { value: T } | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;

	function flush() {
		timer = null;
		if (!pending) return;
		const { value } = pending;
		pending = null;
		last = Date.now();
		fn(value);
	}

	const throttled = (value: T) => {
		pending = { value };
		if (timer) return;
		const wait = Math.max(0, intervalMs - (Date.now() - last));
		timer = setTimeout(flush, wait);
	};

	throttled.cancel = () => {
		if (timer) clearTimeout(timer);
		timer = null;
		pending = null;
	};

	return throttled;
}

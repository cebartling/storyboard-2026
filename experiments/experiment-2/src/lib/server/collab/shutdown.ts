import { building } from '$app/environment';
import { closeAllStreams } from './sse';

/**
 * Ends every open event stream when the process is asked to stop, and runs
 * anything else that has to be released with them.
 *
 * ADR 0014 §4 says to hang this on `sveltekit:shutdown`. That cannot work:
 * `@sveltejs/adapter-node` emits that event inside the callback of
 * `httpServer.close()`, and Node runs that callback only once every connection
 * has ended. An open SSE stream *is* a live connection, so the event arrives no
 * earlier than `closeAllConnections()` at the 30-second `SHUTDOWN_TIMEOUT` —
 * the very deadline closing the streams was meant to avoid.
 *
 * The signal handlers are therefore what matter. They run beside the adapter's
 * own, close the streams, and let `close()` complete promptly; the
 * `sveltekit:shutdown` listener stays as belt-and-braces for a host that stops
 * the server some other way.
 *
 * `alsoClose` exists because the MongoDB client has the same problem the
 * streams do: its connection pool holds live handles, so leaving it open keeps
 * the event loop alive past the point everything else has finished. Closing it
 * belongs on the same signal, not on a second set of handlers racing these.
 */
export function registerShutdown(alsoClose: () => void | Promise<void> = () => {}): void {
	// `vite build` imports modules to analyse them. Registering process handlers
	// during a build would leak listeners into the build process.
	if (building) return;

	const close = () => {
		closeAllStreams();
		// Deliberately not awaited: these run from signal handlers, and a hung
		// close must not be what stops the process from exiting.
		void alsoClose();
	};
	process.once('SIGTERM', close);
	process.once('SIGINT', close);
	process.on('sveltekit:shutdown', close);
}

import { building } from '$app/environment';
import { closeAllStreams } from './sse';

/**
 * Ends every open event stream when the process is asked to stop.
 *
 * ADR 0015 §4 says to hang this on `sveltekit:shutdown`. That cannot work:
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
 */
export function registerStreamShutdown(): void {
	// `vite build` imports modules to analyse them. Registering process handlers
	// during a build would leak listeners into the build process.
	if (building) return;

	const close = () => closeAllStreams();
	process.once('SIGTERM', close);
	process.once('SIGINT', close);
	process.on('sveltekit:shutdown', close);
}

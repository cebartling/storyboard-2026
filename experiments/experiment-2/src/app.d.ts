// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			/**
			 * The signed-in account, or null for an anonymous request (ADR 0015).
			 *
			 * This is the *authentication* identity, and the only thing a `Caller`
			 * is ever built from — see `requireCaller`. ADR 0014 §6's presence
			 * identity is deliberately not here: a viewer's per-connection client id
			 * arrives as a query parameter on the event stream, carries its own
			 * brand, and must never be admitted to `Locals`, or the distinction
			 * between "who is this" and "which tab is this" quietly disappears.
			 */
			user: import('$lib/server/auth/auth').AuthenticatedUser | null;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};

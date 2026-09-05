# 0017: Node everywhere — the scripts do not run on Bun

## Status

Accepted, 2026-09-04. **Reverses the split experiment-1 arrived at**, where the demos and
the seed script ran on Bun and the app ran on Node.

## Context

experiment-1 ran its `demo/` and `scripts/` on Bun, because Bun runs TypeScript directly
and the alternative was a build step for two scripts. The app could not join them:
`better-sqlite3` is a native addon that segfaults Bun on construction, so the demo harness
had to spawn its preview server under Node and carry a comment warning nobody to
"simplify" it.

That reason is gone — MongoDB's driver is pure JavaScript
([ADR 0003](./0003-mongodb-one-document-per-map.md)) — so running everything on Bun was
worth trying.

## Decision

**Node for everything.** `scripts/` and `demo/` run through `tsx`.

Not a preference. **Bun cannot run this app at all**, and this was established by running
it rather than by reasoning about it:

- `vite build` panics with `NAPI FATAL ERROR` at "rendering chunks".
- `vite dev` starts and then panics on the first request.

Vite 8.2.2 is rolldown-based, and rolldown's native binding crashes Bun 1.4.0 **on use** —
the binding loads fine, so this is not a packaging problem or a missing install. It has
nothing to do with the database.

## Consequences

**One runtime, one TypeScript program, one `pnpm check`.** experiment-1 needed a second
program (`tsconfig.bun.json`) and a second `check` pass, because `bun-types` is a global
declaration file: pulled into the app's program it made `Bun.*` visible to code that runs
on Node, where it typechecks and then crashes at runtime. That whole apparatus is gone, and
`scripts/` and `demo/` are simply in the one program — which is stricter than before, not
looser, since they are now typechecked against the same config as the app.

**The demo harness loses its footgun.** The "the preview server must run under Node" rule
and the comment defending it are gone; the harness is a Node script spawning a Node server.

**`tsx` is a dependency where Bun needed none.** That is the price, and it is small: Node
26 executes TypeScript natively, but does not resolve extensionless relative imports, which
is what the existing sources use throughout.

**This is recorded so nobody retries it.** The Bun attempt looks obviously correct from the
outside — scripts, TypeScript, no native addon left — and fails in a way that reads like a
local install problem rather than a hard incompatibility.

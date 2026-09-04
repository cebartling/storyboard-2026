# 0015: Collaboration model — server-authoritative commands, SSE fan-out, notify-and-refetch

## Status

Accepted, 2026-09-03. **Supersedes [ADR 0014](./0014-collaboration-is-in-scope.md)**, which
recorded that collaboration is in scope, named the migration surface, and declined to
design anything until a real design existed. This is that design.

**Extended by [ADR 0016](./0016-accounts-sessions-and-map-membership.md), 2026-09-03**,
which supplies the identity §6 said did not exist and withdraws the anonymous cookie §6
proposed: a signed-in account makes it redundant, and §6's insistence that it must not
become the authentication identity is honoured by never creating it. Presence identity is
now `{ userId, displayName, clientId }`.

## Context

ADR 0014 established the decision (collaboration is in scope, not yet built) and the
constraint (a single whole-map aggregate with one version counter). Three product answers
now bound the design:

- **Single Node process.** One server, one SQLite file.
- **Brief disconnections should heal** — queue and replay. Not offline editing.
- **Scope:** live data sync, presence, and live selection/cursors. Not edit locking.

Reading the code to design against it turned up two things that change what has to be
built. The first contradicts ADR 0014 and is the more important of the two.

### There is no working concurrency control today

ADR 0014 states that two editors touching different cards conflict, and that the second is
rejected. That is true of the **repository**, and
`drizzle-story-map-repository.test.ts`'s "rejects a second editor who changed a different
story than the first" proves it — by holding two loads open explicitly.

**The HTTP layer never produces that scenario.** `buildBoardViewModel`
(`src/lib/board/board-view-model.ts`) drops `version` from what it sends the client, so the
client never holds one. Every form action does `load → mutate → save` inside a single
request (`src/lib/app/use-cases.ts`, `loadOrThrow`). The compare-and-set window is
therefore **one request's duration, not one editing session**.

The consequence: cross-user editing is **silently last-write-wins**. Alice opens the edit
dialog for a story, Bob renames it, Alice saves — Alice's stale value wins, no 409 is
raised, and nobody is told. The 409 path exists, is tested, is wired through
`run-action.ts`, and in practice essentially never fires.

ADR 0014's cost list is therefore wrong in one direction and right in the other: the
aggregate boundary is too coarse for _conflict reporting_, and simultaneously not actually
protecting anything at the session level.

### Fractional ranks collide under true concurrency

`rank.ts` wraps `generateKeyBetween`, which is deterministic and carries no actor entropy —
no site id, no jitter, no tie-break byte. Two concurrent inserts at the same position
produce **byte-identical** keys. `assertNeighboursBracketAGap`'s own comment
(`story-map.ts`) says as much: `generateKeyBetween(prev, null)` returns exactly what the
next appended sibling already holds.

The current defences are the whole-map compare-and-set, which serialises writers so the
collision cannot materialise, and the unique indexes, which turn a leaked duplicate into a 500. Neither is a merge.

**Fractional indexing gives convergent single-row reordering, not conflict-free
reordering.** Conflict-free would need an `(rank, actorId)` tie-break pair, which does not
exist here. So any design that removes the single-writer property has to add one — or keep
writes serialised.

## Decision

**Server-authoritative commands, serialised per map, with in-process SSE fan-out and
notify-and-refetch as the apply mechanism.**

### 1. The client sends intent, never state

Unchanged from today, and now load-bearing: a move is `beforeId`/`afterId`, not a rank. The
server is the sole authority on ranks and ids. Ranks are still never sent to the client.

This is what makes the rank scheme safe without actor ids: clients cannot compute a rank, so
they cannot compute a colliding one.

### 2. Writes to one map are serialised

An in-process per-map async mutex wraps `load → mutate → save`. Two concurrent inserts at
the same position become two sequential inserts, and the second sees the first's rank.

**This is only sound because the deployment is a single process.** That assumption was
previously incidental — recorded only as a comment in `deps.ts` about why a module singleton
is acceptable. It is now a correctness requirement, and moving to multiple instances means
either a distributed lock or actor-id tie-breaks on ranks. Recorded here so nobody
discovers it by deploying two replicas.

### 3. Versions round-trip, so conflicts are real

`buildBoardViewModel` keeps `version`; the client sends it with every mutation; the use
case compares it against what it loaded and throws `ConflictError` when stale. This makes
the existing 409 path fire for the case it was written for, and the UI already renders it.

Without this, live sync would make silent overwrites _more_ likely rather than less —
concurrent editing goes from theoretical to routine.

### 4. SSE downstream, POST upstream

`@sveltejs/adapter-node@5.5.7` has **no WebSocket upgrade seam** — zero `upgrade` or
`WebSocket` references in its shipped files. Supporting WebSockets would mean replacing the
adapter's entry point with a custom server and wiring dev and built output separately.
Server-sent events work today through Kit 2.70.3's Node layer, under both `vite dev` and the
built output.

The direction split matches the model: SSE carries server→client push, ordinary POSTs carry
client→server intent. The one real cost is cursor traffic — a POST per pointer move is
wasteful — so cursor updates throttle and batch rather than sending per event.

Two consequences to design around: an open SSE stream is a never-closing request, so
`adapter-node`'s 30-second `SHUTDOWN_TIMEOUT` becomes the force-kill window unless streams
close on `sveltekit:shutdown`; and a heartbeat is needed to keep intermediaries from
dropping idle streams.

### 5. Sync by notify-and-refetch, not by diff

The broadcast carries a **sequence number, not a payload**. Clients react by calling
`invalidateAll()` — the sync path that already exists, is already tested, and already has
"server wins" semantics via `story-dnd-zone.svelte`'s writable-derived `localItems`.

This is the decision most worth defending, because the obvious alternative is to broadcast
deltas. It is chosen because:

- It requires **no domain changes at all**. ADR 0014's `{ map, change }` migration stays
  unpaid until something demands it.
- The apply path is the one the codebase has the most confidence in.
- A story map is tens to low hundreds of cards. A refetch is cheap at this size, and ADR
  0004 already accepted whole-map loads on exactly that reasoning.

It will be revisited if measurement shows refetch is too coarse — not before. See
"Deferred" below.

### 6. Presence and cursors are ephemeral

They ride the same stream on separate event types, are never persisted, never sequenced,
and never touch SQLite. Losing them on reconnect is correct behaviour, not data loss.

Presence needs identity and there is none: no auth, no `App.Locals`, no `hooks.server.ts`.
A new `hooks.server.ts` assigns an anonymous per-session id in a cookie, with a
user-settable display name. **This is explicitly not authentication** — it attributes a
cursor to a browser session, nothing more, and it must not become the thing auth is later
grafted onto (ADR 0006 records that auth changes the repository port's signature).

> **Superseded by ADR 0016.** The anonymous cookie is not built. Real accounts landed
> instead, so presence rides on `locals.user` plus a per-connection `clientId` the client
> mints. The paragraph's _requirement_ is unchanged and now enforced by types rather than
> discipline — see ADR 0016 §6.

### 7. Reconnection replays from a bounded buffer

Clients hold `lastSeq`. On reconnect they send it; the hub replays notifications from a
bounded ring buffer, or instructs a full refetch if the client has fallen too far behind.
Since notifications carry no payload, "replay" collapses to "you are behind, refetch" in
most cases — which is why the buffer can be small.

## Staging

Each stage is independently useful.

- **Stage 0 — safe concurrent writes.** Version round-trip, per-map write lock, WAL and
  `busy_timeout` on the SQLite connection (today the journal is legacy rollback and
  `busy_timeout` is 0, so contention throws `SQLITE_BUSY` immediately). No transport yet.
  This stage is a bug fix that stands on its own: it closes the silent lost update.
- **Stage 1 — transport and the collaborative feel.** SSE endpoint, per-map hub, anonymous
  session identity, notify-and-refetch, presence, cursors. Plus the two hazards live
  updates introduce: a remote refetch must not clobber `localItems` mid-drag, and an open
  dialog holding stale values must learn its subject changed.
- **Stage 2 — fine-grained effects.** Deferred; see below.

## Deferred, and why

**The `{ map, change }` refactor ADR 0014 declined stays declined.** Stage 1 delivers live
collaboration without it. If refetch proves too coarse, the effect shape then falls out of
a working consumer instead of a guess — which is precisely the lesson of review finding A4,
where ADR 0007's `AiAssistant` port, defined ahead of its consumer, constrained nothing.

One correction to ADR 0014's estimate, found while designing: effects would **not** require
changing all 14 domain functions. For every mutation except `deleteActivity`, `deleteStep`,
and `deleteSlice`, the use case already knows what changed — adds return the created entity,
renames and moves take the target's id. Only those three cascade or re-rank in ways the app
layer cannot reconstruct without diffing. The migration is three functions, not fourteen.

Also out of scope: authentication, offline editing, edit locking, multi-instance
deployment, and rank rebalancing (ADR 0005 defers that separately).

## Consequences

**What this buys.** Live collaboration on a single-process deployment, without touching the
domain layer, reusing the sync mechanism that already has the most test coverage in the
codebase. And a real fix for a silent data-loss bug that predates any of this work.

**What it costs.** A single-process assumption promoted from incidental to load-bearing. An
identity concept that is deliberately not auth and must not quietly become it. A refetch per
remote change, which is cheap at this board size and will not be at every board size.

**What would falsify it.** If refetch-per-change becomes visibly slow, or if the product
needs multiple server instances, this ADR should be superseded rather than amended — the
first invalidates §5, the second invalidates §2, and §2 is the one holding the rank scheme
together.

## Amendments, 2026-09-03

Found while implementing Stage 0, and recorded here rather than silently diverging.

**§4's "streams close on `sveltekit:shutdown`" cannot work as written.**
`@sveltejs/adapter-node@5.5.7` emits that event _inside_ the callback of
`httpServer.close()`, which Node runs only once every connection has ended. An open SSE
stream is a live connection, so the callback cannot fire until `closeAllConnections()` at
the 30-second `SHUTDOWN_TIMEOUT` — the event arrives after the very deadline it was meant to
avoid. Streams must be closed from a `SIGTERM`/`SIGINT` listener registered beside the
adapter's own, which lets `close()` complete; the `sveltekit:shutdown` listener stays as
belt-and-braces.

**§7's sequence number should be the persisted map version, not a hub-local counter.** A
counter resets when the process restarts and cannot be compared against anything `load()`
returned, which leaves a gap between a client's load and its subscription. With
`seq = version`, the client sends the version it already has and the gap closes
deterministically. The ring buffer stays, but is nearly vestigial.

**§5 does not say where the broadcast is published.** It is the route, after the action
succeeds, with `seq = expectedVersion + 1` — exact, under the write lock and the
compare-and-set. Publishing from the use case would need a third outbound port, which
ADR 0006 forbids.

**§2 slightly overstates what the write lock buys.** It says the second of two concurrent
inserts "sees the first's rank". Once §3's version round-trip is in place that cannot
happen: the second writer holds the version its editor was opened at and is refused before
it reaches the domain. What the lock actually guarantees — and this is still load-bearing —
is that no two writers ever compute ranks against the same state, and that a retry runs
against committed state rather than contending at the SQLite level. There is a test named
for each of the two properties.

Also noted, not fixed: **`deleteMap` has no broadcast story.** Subscribers of a deleted map
will refetch into a 404. Acceptable for Stage 1.

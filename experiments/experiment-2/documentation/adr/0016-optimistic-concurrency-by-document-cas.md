# 0016: Optimistic concurrency by document compare-and-set

## Status

Accepted, 2026-09-04. Refines [ADR 0014](./0014-collaboration-model.md) §3 (the version
round-trip) and Stage 0's storage-level half, which was written against SQLite.

## Context

A story map carries a `version`. A save that arrives holding a stale one must be refused
rather than silently winning — that is the lost update
[ADR 0014](./0014-collaboration-model.md) exists to close, and the 409 the board turns into
"the board refreshed; save again".

Under SQLite the check was a read of `version` followed by a conditional write, inside a
`{ behavior: 'immediate' }` transaction. It was correct, but only because of the
transaction mode: `IMMEDIATE` takes the write lock at `BEGIN`, so no other writer could
slip between the read and the write. The mode was itself a workaround — Drizzle types
`bun:sqlite`'s `.run()` as `void`, so the adapter could not ask how many rows it had
actually updated.

## Decision

**One conditional update, and the driver's answer decides.**

```ts
const result = await maps.findOneAndUpdate(
	{ _id: map.id, version: map.version },
	{ $set: { ...doc, version: map.version + 1 } },
	{ returnDocument: 'after' }
);
```

A `null` result means the filter matched nothing. A single follow-up `findOne` — on the
failure path only — separates "someone else moved it on" from "it is gone", so the caller
gets the right message rather than a guess.

**Authorisation is checked before the version.** Both can fail at once, and telling a
stranger their copy is out of date is advice they cannot act on for a map they may not
touch. experiment-1's two implementations genuinely disagreed about this and nothing caught
it; the port's contract test now has a case for it.

**"New or existing?" is decided by the version, not by looking for the map.** `version === 0`
means new. Deciding it by whether the map is present recreates a map that has been deleted,
silently, owned by whoever still had a tab open — which is what experiment-1's in-memory
double did, and what its contract test did not ask about.

## Consequences

**A paragraph of reasoning disappears.** There is no transaction mode to depend on, no
lock-acquisition timing to get right, and no driver-typing workaround. The operation is
atomic on its own.

**The `SQLITE_BUSY` family is gone with it**, along with WAL and `busy_timeout` — and so are
the two `worker_threads` tests that held a write lock and asserted the next writer waited.
There is no analogue, and there does not need to be: the property those tests protected is
that a lost update is impossible, and the compare-and-set is what provides it. One test
replaces them, starting two concurrent saves from the same version and asserting that
exactly one wins and the other gets a `ConflictError`.

**What is unchanged, and was never about SQLite:** the per-map `KeyedLock`
([ADR 0014](./0014-collaboration-model.md) §2), which serialises writers in-process so no
two compute ranks against the same state; the single-process assumption it rests on; and
the whole-map `version`, which means two editors touching different cards still conflict
([ADR 0004](./0004-single-aggregate.md)'s amendment).

**Still one counter for the whole aggregate.** Embedding did not make the conflict window
finer-grained — the document is the unit of the update, exactly as the aggregate is the unit
of the domain. That remains the known-temporary shape
[ADR 0004](./0004-single-aggregate.md) records.

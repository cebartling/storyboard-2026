# 0004: Single StoryMap aggregate; invariants in domain code

## Status

Accepted, 2026-08-31

## Context

A story map has several entity types (`Activity`, `Step`, `Slice`, `Story`) with
relationships and ordering rules between them (see `documentation/domain-model.md`).
Every invariant that matters — rank uniqueness within a scope, a story's slice belonging
to the same map, cascading/un-slicing on delete — spans more than one entity type and
often spans the whole map. A story map, for the scope of this experiment, is also small:
tens to low hundreds of cards, not thousands.

## Decision

Model the whole story map — its activities, steps, slices, and stories — as a single
aggregate, `StoryMap`, loaded and saved as a unit through `StoryMapRepository`. All
invariants (rank uniqueness per scope, slice/story consistency, cascade and un-slice
behavior) are enforced in domain code (`src/lib/domain/story-map.ts`), not left to the
database's foreign keys and constraints to catch, so they can be tested without a
database and so the rules are legible in one place.

## Consequences

Simplicity: one load, one save, one place invariants live and are tested. The cost is
coarse writes — the initial `StoryMapRepository` implementation persists with a whole-map
`save()` rather than per-operation methods (`moveStory`, `renameActivity`, etc. each
issuing their own targeted write). This is a deliberately deferred open question: whether
whole-map `save()` is fast enough in practice, versus per-operation repository methods
that write only the changed rows. The plan is to start coarse and only revisit if drag
latency is actually felt during use — this is not a decision made now, it's a decision
explicitly postponed until there's a real performance signal to act on.

## Amendment, 2026-09-02: the deferred question was the wrong one

The open question above is framed as throughput — _is whole-map `save()` fast enough?_ A
review asked the contention question instead, and it was measured rather than argued
(the repository contract's "rejects a second editor who changed a different story than the
first"):

**Two editors who touch entirely different stories still conflict.** `maps.version` is one
counter for the whole aggregate, so the second writer is rejected and their edit is lost
even though nothing they changed was touched by the first. Editing is single-writer by
construction, not by accident of implementation.

That is the correct behaviour for this design — it is what prevents a lost update, and the
409 it produces is honest. The point of recording it is the cost of changing it later:
every domain function returns a whole new `StoryMap` with no delta, command, or event, so
there is nothing to broadcast, diff, or merge. Real-time collaboration would mean
reshaping the domain's return types, the repository port, and the client's
`invalidateAll()` sync loop _together_, not adding a layer beside them.

No decision is reversed here. What changes is that the aggregate boundary is now known to
be a **collaboration** constraint rather than only a performance one, and the throughput
question remains open and unmeasured.

**Superseded in part by [ADR 0014](./0014-collaboration-model.md), 2026-09-03.**
Collaboration is now in scope, so the single-aggregate shape is known-temporary rather than
settled. The throughput question above is still open and still unmeasured; it is simply no
longer the one that decides the aggregate boundary.

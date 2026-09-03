# 0014: Real-time collaboration is in scope; the single aggregate is known-temporary

## Status

Accepted, 2026-09-03

## Context

`experiment-1` was built to test an architecture before committing a product to it, and it
deliberately excluded real-time collaboration (see `CLAUDE.md`'s "Not built"). ADR 0004
chose a single `StoryMap` aggregate, loaded and saved whole, and deferred one open
question: _is whole-map `save()` fast enough?_

The 2026-09-02 review (finding A1, `../review-2026-09-02.md`) asked a different question
and answered it by measurement rather than argument. The test lives in
`drizzle-story-map-repository.test.ts` as "rejects a second editor who changed a different
story than the first":

**Two editors who touch entirely different cards still conflict.** `maps.version` is one
counter for the whole aggregate, so the second writer is rejected and their edit is lost
even though nothing they changed was touched by the first.

That behaviour is correct for the current design — it is what prevents a lost update, and
the 409 it produces is honest. What was left open was whether it _matters_, which is a
product question, not a technical one.

It has now been answered: **multi-user real-time collaboration is in scope.** It is not
being built yet, and no design for it exists.

## Decision

Record that the single-aggregate shape is **known-temporary** rather than settled, and
name precisely what it costs, so the price stays visible and does not quietly grow.

Deliberately **do not** restructure anything yet. In particular, do not start returning
`{ map, change }` from domain mutations, which the review offered as the way to keep the
option open.

The reason is a lesson this codebase has already learned once. ADR 0007 defined the
`AiAssistant` port ahead of any consumer, on the same reasoning — get the seam in early so
the real feature slots in without reshaping the core. Review finding A4 found that the
resulting contract constrained nothing: it was a doc comment with no consumer, type, or
test holding it to anything, and ADR 0007's claim that the app was "wired against the port
today" had become false. A `change` type designed before a collaboration model exists is
the same bet with a larger blast radius — it would touch every domain function, and a
wrong guess has to be _migrated_ rather than merely deleted.

The shape of a change (event? command? patch? CRDT operation?) is not a detail that can be
filled in later. It is the entire content of the decision, and it follows from a
collaboration design that has not been done.

## What has to change when collaboration is built

Recorded now so the estimate is not re-derived, and so nobody makes it worse by accident:

- **14 domain functions in `src/lib/domain/story-map.ts`** return a whole new `StoryMap`
  (or `{ map, entity }`) with no description of what changed. There is nothing to
  broadcast, diff, or merge.
- **`maps.version` is one counter per map** (`schema.ts`), so conflict granularity is the
  whole board. Per-entity or per-operation versioning is a schema change plus a rewrite of
  `save()`'s compare-and-set.
- **`StoryMapRepository.save()` deletes and reinserts every child row**
  (`drizzle-story-map-repository.ts`). ADR 0005's stated payoff — single-row writes for
  drags — is unrealised at the write path for this reason (see its 2026-09-02 amendment).
- **The client sync loop is `invalidateAll()`** after every mutation: a full refetch, with
  no notion of receiving someone else's change.
- **There is no transport.** No websocket, no SSE, no presence.

These move together. Adding collaboration is a re-modelling job across the domain's return
types, the repository port, and the client loop — not a layer added beside them.

## Consequences

The honest cost: every domain mutation written between now and then is another one to
convert, and that is accepted. The alternative — guessing the `change` shape now — trades
a known, mechanical, well-tested conversion for an unknown migration, on a codebase with
257 unit tests that make the mechanical version cheap.

What this ADR _does_ buy immediately is that ADR 0004's open question is no longer
mis-framed. It defers throughput; the binding constraint is contention. Anyone reading
ADR 0004 alone would still plan for the wrong thing, so it carries a pointer here.

This ADR should be superseded by a collaboration design, not amended. When that design
exists, the `change` shape falls out of it.

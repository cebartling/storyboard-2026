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

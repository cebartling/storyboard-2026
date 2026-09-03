# 0005: Lexicographic fractional ranks; slice membership as nullable FK

## Status

Accepted, 2026-08-31

## Context

Drag-and-drop reordering is the interaction this experiment exists to exercise. Cards
need an ordering within a scope (activities within a map, steps within an activity,
stories within a `(step, slice)` cell), and dropping a card between two neighbours needs
to update that ordering. Two entities need positioning: siblings within a list (narrative
and priority order), and stories relative to slices (release assignment).

## Decision

**Ordering**: lexicographic fractional ranks, generated with the `fractional-indexing`
library's `generateKeyBetween`, stored as `TEXT`, one rank column per scoped list
(`Activity.rank` per map, `Step.rank` per activity, `Slice.rank` per map, `Story.rank` per
`(stepId, sliceId)`). Dropping a card between two neighbours computes
`rank = generateKeyBetween(prevRank, nextRank)` and writes that single row — no other
sibling's rank changes.

**Seriously considered and rejected**: integer `position` columns (0, 1, 2, ...). Simpler
to reason about and to read directly out of the database, but rejected because the
renumbering logic leaks into every move operation — inserting or moving a card requires
shifting the position of every sibling after the insertion point, which turns a
single-row drag into a multi-row (worst case, whole-list) write, and that renumbering
logic has to be gotten right in every code path that reorders anything.

**Slice membership**: a nullable foreign key (`Story.sliceId`) rather than containment.
A story always belongs to its `Step`; slice assignment is a separate, orthogonal
attribute that can be null (unsliced) or point at a `Slice` in the same map. This matches
Patton's physical wall more closely than it might first appear: on Patton's wall there is
one vertical (priority) order per user task, with tape lines drawn horizontally through it
to mark release boundaries — the tape doesn't move the cards into a different pile, it
partitions the one column in place. Our `(stepId, sliceId)`-scoped rank is the digital
equivalent: it's still one column per step conceptually, just partitioned by slice into
separate rank scopes so each band sorts independently, rather than being one long list
with a visual divider drawn through it. The tradeoff of the scoped-rank approach is that
"all stories under this step across every slice" is no longer one naturally sorted list —
reconstructing the full top-to-bottom column (as Patton's physical wall shows it) means
concatenating slice bands in slice order, not just reading one rank column.

## Consequences

Single-row writes for drags — the payoff this decision exists for, though only in the
domain so far: a drag changes exactly one story's rank and renumbers no siblings, which is
the property this scheme buys. It is _not_ yet realised at the write path. ADR 0004's
whole-map `save()` deletes and reinserts every child row, so a drag is an N-row write
regardless of rank scheme, and it stays that way until the per-operation repository
question in ADR 0004 is settled. The two ADRs read as contradicting each other on this
point; they do not, but the distinction was implicit and is now stated (finding A3 of
`../review-2026-09-02.md`). Costs: rank values are
opaque strings, not meaningful to read directly in the database; and there is a
theoretical key-growth problem under pathological repeated insertion at the same point
(e.g. always dropping between the same two neighbours many times), which is a known
characteristic of fractional-indexing schemes. Rank rebalancing (periodically
renumbering a scope to shrink key lengths) is a deferred open question — deliberately not
built for this experiment, since the scale involved (tens to low hundreds of cards) is far
below where key growth becomes a practical problem. If this pattern is carried into a
product, rebalancing should be revisited before it's carried past a prototype.

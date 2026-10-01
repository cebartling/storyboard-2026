# Domain model

One aggregate, `StoryMap`, owns everything below it. Every invariant that matters spans
the whole map (rank uniqueness within a scope, slice/story consistency), and a map is
small enough to load and hold in memory in one query, so there is no benefit to splitting
it into smaller aggregates. See ADR 0004.

## Entities

```
StoryMap {
  id: string
  name: string
  createdAt: Date
  version: number             // optimistic concurrency; see below
}

Activity {                    // backbone, narrative order
  id: string
  mapId: string
  name: string
  rank: string                // fractional rank, scoped to (mapId)
}

Step {                        // Patton's "user task" — see glossary.md
  id: string
  activityId: string
  name: string
  rank: string                // fractional rank, scoped to (activityId)
}

Slice {                       // release band, top-to-bottom
  id: string
  mapId: string
  name: string
  rank: string                // fractional rank, scoped to (mapId)
}

Story {
  id: string
  stepId: string
  title: string
  description: string | null
  sliceId: string | null      // null = unsliced band
  status: StoryStatus         // ADR 0021; 'todo' by default
  rank: string                // fractional rank, scoped to (stepId, sliceId)
  criteria: AcceptanceCriterion[]  // ADR 0024; empty by default, never absent
}

AcceptanceCriterion {         // ADR 0024
  id: string
  text: string                // plain text, never Markdown
  satisfied: boolean          // false by default
  rank: string                // fractional rank, scoped to (storyId)
}                             // nested in its Story: exactly one parent

StoryStatus =                 // ADR 0021
  'backlog' | 'todo' | 'in-progress' | 'in-review' | 'done'

Dependency {                  // ADR 0019
  blockerId: string           // the Story that must come first
  blockedId: string           // the Story that waits on it
}                             // no id (the pair is the identity), no rank

GlossaryEntry {               // ADR 0025
  id: string
  term: string                // plain text, unique per map ignoring case
  definition: string          // plain text, never Markdown
}                             // flat on StoryMap, no rank: read sorted by term
```

## Invariants

Enforced in domain code (`src/lib/domain/`), not left to the database to catch:

- Ranks are unique within their scope: `Activity.rank` unique per `mapId`, `Step.rank`
  unique per `activityId`, `Slice.rank` unique per `mapId`, `Story.rank` unique per
  `(stepId, sliceId)`, `AcceptanceCriterion.rank` unique per `storyId`.
- `Story.sliceId` is either `null` or references a `Slice` belonging to the same
  `StoryMap` as the story's `Step`/`Activity`. Cross-map slice assignment is invalid.
- `Story.status` is one of the five `StoryStatus` values and is never absent. A new story
  is `todo`, as is one loaded from a document written before the field existed — there are
  no migrations, so the repository defaults it on the way in (ADR 0021).
- An `AcceptanceCriterion` belongs to exactly one `Story` and is reachable only through it,
  so a criterion id from another story is rejected rather than found. Its `text` is
  non-blank and stored trimmed (ADR 0024).
- A `Story` cannot be set to `done` while any of its criteria is unsatisfied, and a `done`
  story that gains an unmet criterion — a tick undone, or a criterion added — drops to
  `in-review`. The reverse does not happen: satisfying the last criterion never promotes a
  story. A story with no criteria is unaffected. This is a **write-path** invariant: a
  stored document may hold `done` beside an unmet criterion, and the repository must load it
  rather than refuse it (ADR 0024).
- Deleting an `Activity` cascades to its `Step`s and their `Story`s.
- Deleting a `Slice` does **not** delete its `Story`s — it sets their `sliceId` to `null`
  (un-slicing), matching pulling a strip of tape off a physical wall.
- Moving a `Step` to a different `Activity` carries its `Story`s with it; their `sliceId`
  values are untouched (slice membership is orthogonal to which activity owns the step).
- A `Dependency` names two distinct `Story`s of the same `StoryMap`. A story cannot block
  itself, the same edge cannot be recorded twice in the same direction, and the edge set
  stays **acyclic** — adding `blocker → blocked` is refused when `blocked` already reaches
  `blocker`. The reverse of an existing edge is therefore a cycle, not a duplicate.
- Deleting a `Story` — directly, or through its `Step` or `Activity` — drops every
  `Dependency` naming it, in both directions. Deleting a `Slice` drops none: it un-slices
  stories rather than deleting them, and an edge is invariant under a slice or rank change.
- Deleting a `Story` — directly, or through its `Step` or `Activity` — takes its
  `AcceptanceCriterion`s with it, structurally rather than by a filter, because they are
  nested inside it. Deleting a `Slice` and moving a `Story` both keep them, for the same
  reason they keep dependencies: neither removes a story.
- A `GlossaryEntry`'s `term` and `definition` are non-blank and stored trimmed, and no two
  entries in one `StoryMap` share a term once case is ignored. Deleting an entry rewrites no
  description: a `glossary:<id>` link that no longer resolves renders as its plain words,
  and deleting stories, steps, activities or slices never touches the glossary (ADR 0025).

## Concurrency

`StoryMap.version` is a single counter for the whole aggregate. `StoryMapRepository.save()`
writes only if the row's version still matches the one that was loaded, and throws
`ConflictError` otherwise, which `run-action.ts` turns into a 409 telling the user to
reload. This is what stops a lost update: two people editing the same map cannot silently
overwrite each other.

Because the counter covers the whole map rather than an entity, **two editors who touch
entirely different cards still conflict** — the second one is rejected and their edit is
lost. That is measured rather than assumed
(the repository contract's "rejects a second editor who changed a different
story than the first"), and it is the constraint that makes real-time collaboration a
re-modelling job rather than an addition. See the amendment to ADR 0004, and ADR 0014 for the
decision that collaboration is in scope and this shape is therefore temporary.

**Fixed, 2026-09-03 (ADR 0014 §3).** This used to describe the repository rather than what a
user experienced: the client was never given a version, so every request loaded and saved
within itself and the compare-and-set window was one request rather than one editing
session. Two people editing the same board overwrote each other silently.

The version now round-trips. `buildBoardViewModel` carries it, every mutation sends back the
version its editor was _opened_ at, and the use case compares before calling the domain. A
stale editor gets a 409 that keeps what they typed and refreshes the board beneath them, so
their next save is a knowing overwrite.

Writes to one map are also serialised by an in-process lock (ADR 0014 §2), which is what
stops two writers computing fractional ranks against the same state — `rank.ts` is
deterministic and carries no actor entropy, so identical state yields identical keys. That
makes the single-process deployment a correctness requirement rather than an incidental
fact.

**Access is separate from concurrency.** Maps have members (ADR 0015), and membership is
deliberately _not_ part of the aggregate: `save()` rewrites every child row on each write,
so members stored inside it would be rewritten on every drag.

## Ordering model

Two independent axes, both implemented the same way (fractional ranks) but scoped
differently:

- **Narrative order (horizontal)** — `Activity.rank` within a map, `Step.rank` within an
  activity. Left-to-right sequence of the user's journey.
- **Priority order (vertical)** — `Story.rank` within a `(stepId, sliceId)` cell.
  Top-to-bottom priority of stories under one step, within one release band.

A third rank scope belongs to neither axis, because it is not on the board at all:
`AcceptanceCriterion.rank` within one `Story` (ADR 0024), read top-to-bottom inside the
story detail dialog. It is reordered with buttons rather than a drag, but the mechanism is
the same one — the client posts neighbour ids and the server derives the rank.

Ranks are lexicographic fractional strings (`fractional-indexing`'s `generateKeyBetween`),
stored as strings on the map document. Dropping a card between two existing cards computes a new rank strictly
between its neighbours' ranks — a single-row write, no renumbering of siblings. See ADR
0005 for why this was chosen over integer `position` columns.

### Worked example: dragging within a step

Step "Browse catalog" has three stories, ranked:

```
rank "a0"   Story "Search by keyword"
rank "a1"   Story "Filter by category"
rank "a2"   Story "Sort by price"
```

Drag "Sort by price" to between "Search by keyword" and "Filter by category". The client
sends `moveStory(storyId, beforeId="Search by keyword", afterId="Filter by category")`.
The server computes `rank = generateKeyBetween("a0", "a1")`, e.g. `"a05"`, and writes that
single row:

```
rank "a0"    Story "Search by keyword"
rank "a05"   Story "Sort by price"      <- new rank, only row touched
rank "a1"    Story "Filter by category"
rank "a2"    (now unused position, no other row changes)
```

No other story's rank changes. `stepId` and `sliceId` are untouched — this is a pure
reorder within the same `(stepId, sliceId)` cell.

### Worked example: dragging across a slice line

Same step, but now "Sort by price" is dragged out of the unsliced row and dropped into the
"Release 1" band, between two stories already sliced into that release:

```
Unsliced:      rank "a0"  "Search by keyword"
               rank "a05" "Sort by price"        <- being dragged
               rank "a1"  "Filter by category"

Release 1:     rank "b0"  "Add to cart"
               rank "b1"  "Checkout"
```

Dropped between "Add to cart" (`b0`) and "Checkout" (`b1`), this becomes a **slice
reassignment plus a re-rank**, both written together: `sliceId` changes from `null` to
`Release 1`'s id, and `rank = generateKeyBetween("b0", "b1")`, e.g. `"b05"`. The story
moves to a new `(stepId, sliceId)` scope and gets a rank valid in that scope — its old
rank (`"a05"`) is meaningless once the scope changes, so it's discarded rather than kept.

```
Unsliced:      rank "a0"  "Search by keyword"
               rank "a1"  "Filter by category"

Release 1:     rank "b0"  "Add to cart"
               rank "b05" "Sort by price"        <- reassigned + re-ranked
               rank "b1"  "Checkout"
```

This is why `moveStory` takes both a target scope (`stepId`, `sliceId`) and neighbour ids
(`beforeId`/`afterId`) rather than just neighbour ids alone — the scope can change on the
same drop that changes the rank.

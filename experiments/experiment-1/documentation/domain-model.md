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
  rank: string                // fractional rank, scoped to (stepId, sliceId)
}
```

## Invariants

Enforced in domain code (`src/lib/domain/`), not left to the database to catch:

- Ranks are unique within their scope: `Activity.rank` unique per `mapId`, `Step.rank`
  unique per `activityId`, `Slice.rank` unique per `mapId`, `Story.rank` unique per
  `(stepId, sliceId)`.
- `Story.sliceId` is either `null` or references a `Slice` belonging to the same
  `StoryMap` as the story's `Step`/`Activity`. Cross-map slice assignment is invalid.
- Deleting an `Activity` cascades to its `Step`s and their `Story`s.
- Deleting a `Slice` does **not** delete its `Story`s — it sets their `sliceId` to `null`
  (un-slicing), matching pulling a strip of tape off a physical wall.
- Moving a `Step` to a different `Activity` carries its `Story`s with it; their `sliceId`
  values are untouched (slice membership is orthogonal to which activity owns the step).

## Concurrency

`StoryMap.version` is a single counter for the whole aggregate. `StoryMapRepository.save()`
writes only if the row's version still matches the one that was loaded, and throws
`ConflictError` otherwise, which `run-action.ts` turns into a 409 telling the user to
reload. This is what stops a lost update: two people editing the same map cannot silently
overwrite each other.

Because the counter covers the whole map rather than an entity, **two editors who touch
entirely different cards still conflict** — the second one is rejected and their edit is
lost. That is measured rather than assumed
(`drizzle-story-map-repository.test.ts`, "rejects a second editor who changed a different
story than the first"), and it is the constraint that makes real-time collaboration a
re-modelling job rather than an addition. See the amendment to ADR 0004, and ADR 0014 for the
decision that collaboration is in scope and this shape is therefore temporary.

## Ordering model

Two independent axes, both implemented the same way (fractional ranks) but scoped
differently:

- **Narrative order (horizontal)** — `Activity.rank` within a map, `Step.rank` within an
  activity. Left-to-right sequence of the user's journey.
- **Priority order (vertical)** — `Story.rank` within a `(stepId, sliceId)` cell.
  Top-to-bottom priority of stories under one step, within one release band.

Ranks are lexicographic fractional strings (`fractional-indexing`'s `generateKeyBetween`),
stored as `TEXT`. Dropping a card between two existing cards computes a new rank strictly
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

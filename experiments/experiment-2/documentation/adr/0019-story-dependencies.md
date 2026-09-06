# 0019: Story dependencies are directional blocks-edges, edited in the story dialog

## Status

Accepted, 2026-09-05. Amends ADR 0018.

## Context

The board has two axes and both are spent. Horizontal is activity → step, the narrative
backbone. Vertical is the release slice. So "B needs A first" has nowhere on the grid to live:
it is not a position, it is a relationship between two positions, and every place a map could
express it is already saying something else.

That is a real gap rather than a missing nicety. Sequencing is a first-class question in
Patton's technique — the slices are an ordering claim already — and the reference
implementation (Cardboard) has the feature. Without it the map can say _when_ we intend to
build something and never _what has to exist first_.

Two constraints shape what can be done about it. The board grid renders read-only (ADR 0011):
every create, update and delete happens in a modal dialog. And a map is one aggregate (ADR 0004) in one document (ADR 0003), with no migrations.

## Decision

**A dependency is a directional "blocks" edge between two stories in the same map, stored on
the aggregate, edited in the story detail dialog, and shown on the board as a count badge.**

### The data

```ts
export interface Dependency {
	blockerId: StoryId;
	blockedId: StoryId;
}
```

Flat on `StoryMap` beside `stories`, not nested under `Story`. An edge belongs to neither
endpoint; nesting it under the blocker would make "what blocks me" a scan of every story, and
make the two prune directions structurally different.

**Directional, not undirected.** An ordering claim is the thing that can be validated, and the
thing a later feature can check against slice order. "Related to" is cheaper — no cycle rule —
but it does not answer the question a planner is asking.

**Same map only**, which falls out of ADR 0004 for free: a cross-map edge would need two
aggregates in one write, and ADR 0003 has no transaction spanning two documents outside map
creation. Nothing enforces this beyond `findStory` looking in one map, because nothing can
express it.

**No id.** The pair _is_ the identity, and that is exactly what the duplicate rule enforces.
An id would be a second identity to keep consistent with the first, and nothing addresses an
edge by id — the remove form renders from a resolved edge and posts both endpoints.

**No rank.** Every ranked collection in this aggregate is a layout scope the grid walks. Edges
are never laid out, there is no drop target that could produce the neighbour pair `resolveRank`
needs, and a rank would pull `dependencies` into `inRankOrder`, whose `byRank` would sort on a
field that is not there. The dialog sorts by title at render time instead.

**No `mapId`.** `Activity` and `Slice` carry one; `Step` and `Story` do not. The former is
vestigial from experiment-1's SQLite foreign-key columns and no domain function reads it. A new
type follows `Story`, not the vestige.

### The rules

All in the pure core (ADR 0006), all `InvariantError`:

- Both stories must exist. `findStory` doubles as the same-map check.
- A story cannot block itself.
- The same edge cannot be added twice — **in the same direction only**.
- **No cycles.** Adding `blocker → blocked` closes a loop exactly when `blocked` already
  reaches `blocker`, so the check walks forward from the blocked story looking for the blocker,
  by DFS over the edge set. It carries its path so the rejection can name the loop.

**The reverse of an existing edge is a cycle, not a duplicate.** The duplicate check is
direction-sensitive on purpose. "A already blocks B" would be a confusing answer to someone
asking for B to block A, and the shortest loop deserves the same message as a longer one.

The walk direction is the part worth pinning. Reversed — asking whether the blocker already
reaches the blocked story — the check accepts real two-story cycles and rejects a merely
redundant transitive edge. Both cases are tested: the reverse edge is refused, and `A → C` over
`A → B → C` is accepted.

Cycles are rejected up front rather than repaired later because nothing downstream has a use
for a cyclic graph, and there is no UI that could untangle one. Two editors cannot race into a
jointly-cyclic state: `mutate()` holds the per-map write lock and the second writer's version is
stale, so it is a 409 before the domain runs.

### Cascades

Edges are pruned by an extra filter in the same returned object literal as the delete that
removes the stories — the file's existing idiom. `deleteStory`, `deleteStep` and
`deleteActivity` all prune; there is no foreign key here to catch a miss (ADR 0003).

**`deleteSlice` prunes nothing, deliberately.** It deletes no stories — it un-slices them and
re-ranks them into the unsliced band. An edge names two story ids and is invariant under a slice
change and under a rank change, so nothing can dangle. The same argument covers every `move*`
and `editStory`. The trap is purely lexical, the word "delete" in the name, so both cases are
asserted executably rather than argued in a comment alone.

### Persistence

`MapDoc.dependencies` is **optional**, because there are no migrations and every document
written before this field has no such key. `toDomain` defaults it with `?? []` rather than
casting like its neighbours: they can cast because they were always written. A cast would
typecheck and hand the domain `undefined`, and the first thing to touch it is `deleteStory` —
so the symptom would be a 500 deleting a story from any pre-existing map, not a missing
feature. `save`'s whole-document `$set` backfills the field on a document's next write.

**No port change.** `save(caller, map)` takes the whole aggregate, so the new array flows
through `load`/`save` untouched — the same property ADR 0003 measured.

### The UI

**The card shows a count of blockers, and only that direction.** What a story blocks is legible
from the other card, and badging both ends of every edge would mark most of a linked board. The
useful signal is "this one is waiting on something". Its testid is `deps-badge-{id}` and
deliberately does not start with `story-`: `BoardViewport`'s `INTERACTIVE_SELECTOR` is
`'[data-testid^="story-"], button, a'`, so that prefix would make the pan handler treat the
badge as a card and refuse to pan from it.

**Everything else lives in the story detail dialog** — both lists, a remove per edge, and a
candidate picker collapsed behind an "Add dependency" button.

**This amends ADR 0018**, which recorded that `viewStory` "has no form and no version input:
this changes nothing, so it has no claim on the aggregate." It changes things now. Its forms
carry the version and the client id like every other editor, and two consequences follow that
are invisible until someone tries them:

- **It must not close on success.** Every other editor closes; removing a dependency that way
  would take the view the reader is standing in. So it re-snapshots the version and stays open.
- **Focus has to be placed.** The remove button that was clicked is gone from the DOM by then,
  so focus would fall to `<body>` inside an inerted page.

The picker is collapsed rather than rendered up front for the same reason: `Modal` focuses the
first non-hidden input when it opens, and a picker present at open would take focus off the
description the reader came to read.

**The candidate list is a filtered radio group**, matching on title or step name, capped at 50
with the untruncated total shown — a capped list that just stops reads as "there is nothing
else". Each row names the step and slice it sits in, because two stories can share a title.

**The client does not pre-exclude cycle-creating candidates.** That would duplicate a domain
rule outside the pure core and could not be enforced against a direct POST anyway. The server
refuses and the dialog shows the message, which names the loop.

### Rejected

- **SVG arrows between cards.** The clearest picture of the whole graph, and out of scope
  rather than deferred. The board is a CSS-`zoom` world (ADR 0010) whose track sizes are
  content-dependent, so arrow geometry cannot be computed from map data — it has to be measured
  after layout and re-measured on every zoom step, refetch, drag and reflow. And 157 stories
  draws a hairball nobody reads. The cost is real and named under Consequences.
- **Drag-to-link on the board.** ADR 0011 makes the grid read-only, and `svelte-dnd-action`
  already owns the card's pointer stream — there is no click-vs-drag threshold to split.
- **Selecting two cards and linking them.** Needs selection state on a read-only grid.
- **A separate `dependencies` collection.** Two documents per write with no transaction,
  buying nothing: edges are only ever read with their map.
- **Undirected "related to" edges.** No cycle rule to write, and no answer to the question.
- **Allowing cycles and flagging them.** Every reader would have to cope with a cyclic graph
  and no product behaviour needs one.
- **Cycle detection in the client only.** One rule, one place (ADR 0006).
- **A plain `<select>` of every story.** No search, no secondary label, no way to tell two
  identically-titled stories apart.
- **Denormalised counts on `Story`.** Two sources of truth for one fact; the view model derives
  them in a single pass.

## Consequences

**The view model gained two counts per story and a resolved edge list.** Counts are built in one
pass above the cell loop, not filtered inside it: `cells` is a full columns × rows cross product
and the builder re-runs on every refetch (ADR 0014), so a scan per card would be O(cells ×
edges) for a number obtainable in O(1). `CellVM.stories` grew two fields, which `DndStoryItem`
inherits — optional there, so existing fixtures still typecheck.

**Edges grow unbounded on a document with a 16MB limit.** An edge is about 100 bytes. The seed
map is 51 KiB with 157 stories; a dense edge set over it would add single-digit KiB. This is
headroom, not a guarantee, and it is the same headroom ADR 0003 already relies on.

**A dependency that contradicts slice order is stored and shown, not flagged.** Nothing stops a
blocker sitting in Release 2 while the story it blocks sits in Release 1. The data model
supports checking it — that is most of why the edges are directional — and it is deliberately
not built yet.

**There is no way to see the whole graph at once.** The direct cost of rejecting arrows: the
relationship is visible one story at a time, and a badge tells you that something blocks this
card without telling you what. A dependency list or an ordering view is the obvious follow-up.

**Fixing this exposed an unrelated pre-existing bug and it was fixed first.** The dialog that
stays open across a write is the only place a second write can be made from one open dialog, and
`openedAtVersion` was only ever re-snapshotted on a 409 — so the second add from one open
add-story dialog was already being refused as a conflict with nobody. Nothing caught it because
every existing path closes the dialog after a single add.

**The seed map carries five edges.** Enough that a seeded board shows a badge and two non-empty
lists; not so many that anyone has to maintain a model of the product's real sequencing.

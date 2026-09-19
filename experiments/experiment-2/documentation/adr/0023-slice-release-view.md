# 0023: A slice's release view is a read-only page in dependency order

## Status

Accepted, 2026-09-18. Builds on [0019](0019-story-dependencies.md).

## Context

PIN-220 asks for a release view of a slice's stories, in dependency order.

ADR 0019 made dependencies directional so that a later feature could check them against slice
order, and named the costs of stopping where it did:

- the graph is visible only one story at a time;
- a blocker in a later slice than the story it blocks is stored and shown, but not flagged.

A slice already answers "what is in this release". It does not answer "in what order do we
build it", and it gives no warning when the release waits on something planned after it.

## Decision

**`/maps/[mapId]/slices/[sliceId]` lists one slice's stories in dependency order.** Each slice's
row label on the board links to it.

### A page, not part of the board

- **Not a dialog.** A release can hold dozens of stories. A modal (ADR 0011) is the wrong shape
  for reading a long list, and a page gives the view a URL that can be shared.
- **Not a fourth slice density** (ADR 0022). A list cuts across the step columns, and the board
  is a CSS-`zoom` grid (ADR 0010) whose rows are laid out by step.
- **Read-only.** The page has no actions, so it carries no version and publishes nothing to the
  map's hub (ADR 0014). It is not live: a reload picks up changes. The board is where the map
  changes. This page reads it.

### The order

`buildReleaseViewModel` in `src/lib/board/release-view-model.ts` is pure and DB-free, like
`board-view-model.ts`, and is unit-tested the same way.

- **A topological sort (Kahn's algorithm).** When several stories are ready, it takes the one
  that comes first in reading order: activity rank, then step rank, then story rank. Stories no
  edge constrains read exactly as they do on the board, and the order is deterministic.
- **Constraints are transitive through the whole map.** Story B must come after story A when
  _any_ path of edges joins them, including one through a story in another slice
  (A → X → B, with X in Release 2). Looking only at edges between the slice's own stories
  would be simpler. It would also list B before A in exactly that case, which is a wrong
  answer to the question the page exists to answer. The walk is a DFS from each story in the
  slice. The seed map has 157 stories, so this is cheap.
- **Edges cannot form a cycle** (ADR 0019), so the sort always finishes. If it stalls, the view
  model throws an error naming the stuck stories rather than dropping them, because a stall
  means the domain's invariant has been broken somewhere.

### What blocks a story

Each row lists its **direct** blockers only. A chain decides the order, but is not spelled out:
listing it would repeat the graph one row at a time. This is the same direction as the card
badge (ADR 0019): what a story waits on, not what it blocks.

- **A blocker inside the slice** is shown by its position in the list (`#n`).
- **A blocker outside the slice** is shown with the name of its slice.
- **A blocker in a later slice or unsliced contradicts the release order.** It gets a warning
  icon, the danger colour, and text saying it is planned after this release. The text carries
  the meaning (WCAG 1.4.1). A blocker in an earlier slice is expected and is not flagged.

### Real slices only

The unsliced band gets no release view. It is not a release, and leaving it out keeps
`[sliceId]` a real `SliceId`. An unknown slice, or a slice from another map, is a 404. So is a
map you are not a member of, as it is on the board (ADR 0015).

## Rejected

- **Only edges between the slice's own stories.** Simpler, and wrong for a chain through
  another slice (see above).
- **A global topological order, filtered to the slice.** Respects every chain, but stories
  elsewhere in the map would disturb the tiebreak inside the slice, so two unrelated stories
  could swap order because of work in another release.
- **Flagging contradictions on the board card.** A second badge on a card that ADR 0021 already
  measured for height. It could come later. This page is where the question gets asked.

## Consequences

- **ADR 0019's two named gaps are now partly closed.** A slice's ordering can be seen as a
  whole, and contradictions are flagged, but only on this page and only from the side of the
  release that is waiting.
- **The page can go stale while open.** It reads the map once. A collaborator's edit shows up
  on reload, not live. Subscribing to the map's SSE stream is possible later if a read-only page
  turns out to need it.
- **The slice row label has a third control.** Edit slice and the release view link sit side by
  side under the density control. The link's testid starts with `release-view-link-`, not
  `story-`, so `BoardViewport` does not mistake it for a card.

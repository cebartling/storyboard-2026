# 0022: A slice has three densities, not two

## Status

Accepted, 2026-09-16. Extends [0020](0020-per-viewer-slice-collapse.md).

## Context

PIN-218 asks for a slice's stories as a condensed card deck.

ADR 0020 gave a slice row one bit: expanded, or collapsed to a story count. That bit is
blunt. Once a row is collapsed the viewer can no longer see _what_ is in it, only how much,
so the only way to check a later release is to expand it and lose the height again. The
board's whole reason for existing is that you can read it at a glance, and a row of numbers
is not a reading of anything.

The missing state is a middle one: the stories still legible, at a fraction of the height.

## Decision

A slice row carries a **density**, and one control cycles it:

```
expanded          condensed (deck)         collapsed
full cards        stacked deck + count     count only
add + drop zone   read-only, no drops      no drops
```

- **It is still this viewer's presentation state**, for every reason ADR 0020 gives. The key
  is now `storyboard:slice-density:v1:${mapId}` and the value a map of slice id → density;
  `src/lib/board/slice-density-storage.ts` replaces `slice-collapse-storage.ts` and keeps
  its discipline unchanged — a backend interface, validation of the parsed value, every
  access wrapped. `src/lib/board/slice-density.ts` holds the vocabulary and the cycle,
  beside `story-status.ts` and for the same reason.
- **Expanded is the absence of an entry.** Storing it would mean writing a row per slice on
  a board nobody has touched, and it makes "has this row been changed?" a `Map.has`.
- **The old key is not migrated.** A viewer's collapsed slices come back expanded once. A
  migration would be ten lines and a test to carry forever for one refresh of state that
  costs a click to restore.
- **A condensed band takes no drops and offers no "Add story"**, exactly as a collapsed one
  does not. The deck is the middle density, not a smaller drop target — ADR 0020's rule
  that nothing is dropped into a band the viewer is not really looking at still holds, and
  it is what lets both densities use an `auto` row track instead of the 140px an expanded
  band reserves.
- **Peeking fans the deck into an overlay, not into the flow.** Expanding the cell itself
  would push every row below the pointer down as the viewer scans, which is the opposite of
  what condensing it was for. The panel is `absolute … z-[5]` inside the cell, which works
  because the cell is `position: relative` with no `z-index` and so creates no stacking
  context of its own. The value sits deliberately between the cells it must cover — all
  `z-auto` — and every sticky part of the grid it must not: the row-label gutter at `z-10`,
  the step and activity headers at `z-20`, the corner at `z-30`. A panel sharing the
  headers' `z-20` would not tie with them; the cells are emitted after the header rows, so
  the later node would win and a deck peeked near the top of the board would paint over the
  headers.
- **The panel is `opacity-0 pointer-events-none`, never `hidden`.** Its buttons stay in the
  tab order, and reaching one is what opens the panel for a keyboard user. Reveal is a
  `$state` boolean driven by pointer _and_ focus _and_ a click on the stack, because a touch
  device never fires `:hover` — the trap `story-card.svelte` already guards its hover-
  revealed buttons against. **The stack's click opens; it never toggles.** In the open state
  the panel covers the stack, so a toggle is unreachable there anyway, and with a mouse it
  could only ever fire after `pointerenter` had already opened the panel — its one effect
  would be to shut what hovering just opened. Closing is `pointerleave`'s job, or
  `focusout`'s once a tap has focused the button.
- **The control carries no `aria-expanded`.** It is binary and would have to lie about one
  of three states. Its label names the state the next press moves to (`"Condense slice
Release 1"`), and the row exposes `data-density` for tests.
- **A deck card keeps its status chip**, not only its tint: ADR 0021 rules out colour as the
  only carrier of a status, and the fanned-out panel is where a condensed story is read.
- **Deck testids never start with `story-`.** `BoardViewport`'s `INTERACTIVE_SELECTOR` is
  `'[data-testid^="story-"], button, a'`, so that prefix would make the pan handler treat
  deck chrome as a card and refuse to pan from it.
- **The Unsliced band still has no control.** It is where every new story lands.

## Consequences

Cycling never writes to the server, never changes the map version, and never reaches a
collaborator's board — the e2e asserts `data-board-version` is unchanged across all three
states. State is per browser, not per account, so it does not follow a user to another
device.

ADR 0020's SSR caveat is unchanged and now covers both non-default densities: the server
render has no storage, so a condensed or collapsed slice paints expanded for a frame before
hydration applies it.

A deck cell's height is its own, so a row of decks is as tall as its fullest cell — the
stack is capped at three visible edges, which bounds that at roughly the height of one card.

Tested by `slice-density.test.ts`, `slice-density-storage.test.ts`,
`story-deck.svelte.spec.ts`, and the board e2e "cycle a slice through condensed and
collapsed, persisting across reload".

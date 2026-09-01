# 0010: Native scroll for pan, CSS `zoom` for zoom, on the board canvas

## Status

Proposed

## Context

`src/routes/maps/[mapId]/+page.svelte` renders the whole story map as one CSS grid —
one column per Step across every Activity, one row per Slice — wrapped in
`<div class="panel overflow-x-auto">`. A real map is far wider and taller than a
viewport, and today the only navigation is horizontal scroll: no overview, no zoom out,
no vertical scroll container at all.

Adding an infinite-canvas-style pan/zoom around the board without touching the domain
layer, the view model, or any form action means picking how "the world" is scaled and
moved, and that choice interacts with `svelte-dnd-action`, which the board already
depends on for every drag interaction.

## What we verified in `node_modules/svelte-dnd-action/dist/index.js`

Both a `transform: translate() scale()` world layer and a CSS `zoom` world layer were
considered. We read the installed drag library's source (not its docs) to check both
against it.

**Drop hit-testing is viewport-space either way.** Detection compares pointer
coordinates (`clientX`/`clientY`) against `element.getBoundingClientRect()` — both are
values the browser already reports post-transform and post-zoom. So drops land
correctly under either approach, at any scale. This part of our original assumption
held up.

**The drag mirror is not appended inside the board subtree — it escapes to
`document.body`.** `handleDragStart` computes:

```js
var rootNode = originDropZone.closest("dialog") || originDropZone.closest("[popover]") || originDropZone.getRootNode();
var originDropZoneRoot = rootNode.body || rootNode;
...
originDropZoneRoot.appendChild(draggedEl);
```

(`dist/index.js` lines ~2004–2017). With no `<dialog>` or `[popover]` ancestor and no
shadow root in this app, `originDropZone.getRootNode()` returns the `Document`, and
`rootNode.body` is `document.body`. The dragged mirror (`draggedEl`, `position: fixed`,
set in `createDraggedElementFrom`) is appended as a child of `<body>` — a sibling of the
app root, not a descendant of a board wrapper. **This contradicts the plan's initial
assumption** that the mirror stays inside the board subtree and would be re-anchored by
an ancestor transform's containing block. Since the mirror is moved out to `<body>`
before it starts tracking the pointer, a `transform` on a wrapper further down the tree
is not an ancestor of the mirror at all, and creates no containing block for it.

Consistent with that, the mirror's initial rect comes from
`originalElement.getBoundingClientRect()` (post-transform/post-zoom, correct either
way), and its drag-time movement is `draggedEl.style.transform =
translate3d(dx, dy, 0)` where `dx`/`dy` are raw `clientX`/`clientY` deltas since drag
start (`handleMouseMove`, line ~1691) — real, unscaled viewport pixels, applied to an
element whose own containing block (`body`/`html`) is never scaled by a board-local
wrapper. We could not find a mechanism by which the mirror would track the cursor at
the wrong rate under either `transform: scale()` or `zoom` on a wrapper inside the
board. The plan's proposed "known limitation" — mirror tracking at the wrong rate under
zoom — does not reproduce from the source; we are not carrying it forward as an
accepted limitation.

**The real, verified reason to prefer `zoom` is layout fidelity, not drag-and-drop.**
`transform: scale()` is a paint-time effect: it does not change the element's layout
box, so it does not change `scrollWidth`/`scrollHeight`, does not change what
`position: sticky` computes against, and is not accounted for by
`scrollIntoView`/focus-scroll behavior. Using it as "the world" would mean:

- The browser's native scroll extents would stay at the _unscaled_ content size, so
  "content-bounded" panning would need to be computed and clamped by hand instead of
  coming free from `overflow: auto`.
- The board's existing `sticky left-0` gutter column would be positioned against
  unscaled layout while rendering at a scaled visual size, breaking the gutter/content
  alignment the moment zoom != 100%.
- `scrollIntoViewIfNeeded`/focus-scroll (used by the e2e drag helper and keyboard
  navigation) computes against layout geometry, so it would target the wrong on-screen
  position under a scale transform.

CSS `zoom` does not have this problem: it is layout-affecting (the zoomed element's
layout box, and therefore its ancestor's scroll extents, change with it), so scroll
extents, `sticky`, and scroll-into-view all keep working against the visual size for
free.

## Decision

- **Pan is native `overflow: auto` scrolling** on a bounded-height viewport container
  around the board. No custom scroll math.
- **Zoom is the CSS `zoom` property** applied to a world wrapper around the existing,
  unmodified board grid, not `transform: scale()`.
- Drag-and-drop stays enabled at every zoom level; drop hit-testing is unaffected by
  either pan or zoom because it is viewport-space, as verified above.
- All pan/zoom math (clamping, zoom-at-cursor, minimap projection) lives in
  `src/lib/canvas/` as pure TypeScript, not in `src/lib/domain/` — it is presentation
  state for one route, not a story-mapping domain invariant, so it does not belong
  behind ADR 0006's pure-core boundary.
- Camera state (`zoom`, `scrollX`, `scrollY`) persists per map in `localStorage` under
  `storyboard:camera:v1:${mapId}`, so returning to a map restores where the user left
  off. This is view state, not domain state, so it does not go through a form action or
  the database.

## Consequences

We get content-bounded panning and zoom without reimplementing scroll extents, without
touching `board-view-model.ts`'s grid geometry, and without any change to
`svelte-dnd-action`'s drop behavior. Track sizes stay `minmax(...)` (not fixed pixels),
so world geometry still cannot be computed statically from map data alone — the
minimap's viewport rectangle is computed from real measured
`scrollWidth`/`scrollLeft`/`clientWidth`, not from a modeled world size, which is why
that one piece of geometry is always correct even though the grid itself is
content-sized.

If a future investigation of the live app under real dragging _does_ turn up a
cursor-tracking discrepancy at zoom != 100% that this source reading missed, the escape
hatch is the same one already in place for swapping drag libraries: migrate behind the
existing `story-dnd-zone.svelte` seam to `@atlaskit/pragmatic-drag-and-drop`, whose drop
detection and mirror positioning are also viewport-space by design.

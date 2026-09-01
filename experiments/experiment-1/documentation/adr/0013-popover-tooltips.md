# 0013: Tooltips as popovers, not `title`

## Status

Accepted, 2026-09-01

## Context

ADR 0012 replaced the app's text buttons and Unicode glyphs with Lucide icons. An icon
button says nothing to a sighted mouse user who has not met it before — `aria-label`
serves assistive technology, and nothing served everyone else. Two buttons carried a
`title` for that; the four zoom controls and the modal's close button carried nothing.

`title` turned out to be the wrong tool on both counts. Its delay before appearing is
roughly a second in Chrome and is the browser's to decide: there is no CSS, HTML, or JS
hook to shorten it. A hint that arrives that late is not a hint — the user has already
moved on or clicked to find out.

The obvious replacement, a `::after` or child `<span>` revealed on hover with a short
`transition-delay`, is wrong specifically on this board. Both pencil triggers live inside
`BoardViewport`'s world element, which carries `style="zoom: {camera.zoom}"` inside an
`overflow-auto` scroller (ADR 0010). A tooltip parented to the trigger would scale with the
board — unreadable at 50%, oversized at 200% — and clip at the viewport edge or extend the
scrollable area. A tooltip is chrome; it should not zoom with the content it describes.

## Decision

One Svelte action, `src/lib/actions/tooltip.ts`, used as `use:tooltip={'Edit step'}`.

- **The element is a `popover="manual"` div appended to `<body>`**, not a descendant of the
  trigger. The top layer is outside the world element's `zoom` and outside the scroller's
  clip, which is the entire reason for choosing a popover over a styled child.
- **Delay is ours: 120ms in, immediate out.** Long enough to not flash while the pointer
  crosses a control on the way somewhere else, short enough to feel like a response.
- **Keyboard focus shows it with no delay.** A user who has tabbed to a control has already
  committed to it; there is no accidental hover to debounce, so a delay would be pure lag.
- **Touch pointers are ignored.** There is no hover to end on touch, so a tooltip opened by
  a tap can only read as stuck.
- **The element is `aria-hidden`.** Its text repeats the trigger's `aria-label`; exposing it
  would make every icon button announce its name twice. This keeps ADR 0012's rule intact —
  the button owns the accessible name, the visuals are decorative.
- **It is built on first show, not at mount.** The board renders one trigger per story card
  and per step, so eager construction would put a permanently hidden div in `<body>` for
  every card on the map, nearly all of them never shown.
- **Positioning is manual**, from `getBoundingClientRect` on show: above the trigger by
  preference, flipped below when it will not fit (which is where the sticky step headers
  put it), clamped to the viewport. CSS anchor positioning would express this declaratively
  but is not in Firefox, and this is a dozen lines.
- **Where `showPopover` is missing, it falls back to setting `title`.** Slow is worse than
  fast; both are better than an unlabelled icon.

Applied to all nine icon buttons: the four pencils (edit story, edit activity, edit step,
edit slice), the modal close, and the four zoom controls.

## Consequences

Hover hints arrive in 120ms instead of ~1s, at a constant size regardless of board zoom,
and now exist on seven controls that never had them (only the two pencils carried a
`title`).

The costs: tooltip text lives in the markup as an action argument rather than in the
`title` attribute a browser would render for free, so it is one more thing to keep in step
with the `aria-label` beside it; and the action carries positioning code that CSS anchor
positioning will make redundant once Firefox ships it, at which point most of `position()`
can be deleted.

Tests live in `src/lib/actions/tooltip.svelte.spec.ts` — named for the chromium project
(see `vite.config.ts`) because the Popover API and the top layer do not exist in the node
environment. The board e2e asserts the hint appears within 500ms, a window `title` could
not have met, which is the regression that would otherwise be invisible.

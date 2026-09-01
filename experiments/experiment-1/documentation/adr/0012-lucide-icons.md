# 0012: Lucide for icons

## Status

Accepted, 2026-09-01

## Context

Every icon in the app was a Unicode character typed directly into the markup: `✎` on the
story card and the step header, `×` on the modal's close button, and `−` `+` `⤢` `⦿` in
the zoom cluster.

Glyphs are text, which is the whole problem. They resolve through the font stack, so each
one is drawn by whichever family happens to contain it — `⤢` (U+2922) and `⦿` (U+29BF) are
rare enough to fall out of the system UI face entirely, land in a fallback, and in some
Linux font stacks render as tofu. `✎` (U+270E) is picked up with emoji presentation on
some platforms and as a hairline on macOS. The zoom cluster's four marks came from four
different Unicode blocks, and its minus was U+2212 while its plus was ASCII, so the pair
never matched in width. Nothing about a glyph's stroke weight or optical size is settable,
which is why those buttons had accumulated `text-xs` / `text-base` / `leading-none`
patches just to keep the characters on the baseline.

The board is going to grow more icon controls, not fewer.

## Decision

Take icons from Lucide, via the `@lucide/svelte` package in `dependencies` (alongside
`svelte-dnd-action` — it ships to the browser, so it is not a dev dependency).

- **Import per icon, not the barrel**: `import Pencil from '@lucide/svelte/icons/pencil'`.
  The package carries 7,682 icons; the deep path is what keeps the bundle to the ones
  actually used.
- **Size with a Tailwind class, not the `size` prop**: `<Pencil class="size-3.5" />`. The
  class is CSS and beats the `width`/`height` attributes the component derives from
  `size`, so icon sizing stays in the same vocabulary as everything else per ADR 0009.
- **The accessible name stays on the button.** Lucide's `Icon` applies `aria-hidden="true"`
  by default when given no a11y prop and no children, so the `aria-label` already on each
  icon button remains the single source of its name. Icons are decorative; buttons are
  labelled. No test locator changed when the glyphs were replaced, which is the evidence
  this holds.
- **Tests assert on the `lucide-<name>` class** that `Icon` emits (`svg.lucide-pencil`).
  That is a coupling to the library's output, accepted because it is the only way to state
  the thing worth stating — that this control draws _the pencil_ — and because the class is
  derived from the icon name rather than from internal structure.

The six in use: `pencil` (edit story, edit step, edit activity, edit slice), `x` (modal
close), `plus` (add step, add story), and `minus` / `maximize` / `rotate-ccw` (zoom
cluster). `rotate-ccw` rather than the `target` that literally translated the old `⦿`:
at 16px its concentric rings read denser than every single-stroke mark beside it, and
"reset" is what the control does.

## Alternatives rejected

**Inlining the paths into a local `icon.svelte`.** Lucide is ISC-licensed, so copying path
data in is permitted with the copyright notice retained. For six icons this looked like it
avoided a dependency, but it trades it for hand-transcribed path data (a wrong character in
a `d` attribute fails silently as a wrong shape, not as an error) plus the attribution
housekeeping. The dependency carries its own license metadata and its own correctness.

**Drawing six original paths.** No license question at all, and viable — these are simple
shapes. Rejected because it spends design time on a solved problem and produces a set that
still has to be extended by hand every time the board grows a control.

**Keeping the glyphs.** Rejected for the reasons in Context.

## Consequences

One stroke weight and one optical size across the app, both settable, and `currentColor`
means hover and disabled states already work through the existing palette. The
baseline-patching classes are gone from the icon buttons.

The cost is a runtime dependency in an experiment that deliberately keeps its toolchain
thin, and a soft ceiling on it: if the icon set ever shrinks back to two or three, the
dependency is no longer paying for itself.

Icons are presentation only. No route, use case, or domain module changed for this — ADR
0006's layering again.

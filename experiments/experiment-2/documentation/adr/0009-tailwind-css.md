# 0009: Tailwind CSS v4 for styling

## Status

Accepted, 2026-08-31

## Context

The vertical slice was built with plain scoped `<style>` blocks per component. That was
right for proving the domain and the drag-and-drop wiring, but it left the board looking
unfinished, and the styling was already diverging: three files each defined their own
greys, paddings, and border colours with no shared vocabulary. The board route in
particular is dense with inline forms (rename, delete, add) whose controls need to look
identical across activity headers, step headers, slice labels, and cells.

## Decision

Style with Tailwind CSS v4, wired through `@tailwindcss/vite` in `vite.config.ts`. A
single `src/app.css` — imported once by `src/routes/+layout.svelte` — holds:

- an `@theme` block defining the palette (`canvas`, `surface`, `ink`, `ink-muted`, `line`,
  `brand` + `brand-soft`, `accent` + `accent-soft`, `danger`) as the app's colour
  vocabulary, plus a `--font-sans` override that starts at the system stack — no web font
  is loaded,
- `@layer base` defaults: the `html` background, `body`, `h1`, and a `:focus-visible` ring,
- `@layer components` classes for the controls that repeat on nearly every form —
  `.panel`, `.input`, `.btn` (+ `.btn-primary` / `.btn-quiet` / `.btn-icon` /
  `.btn-danger-quiet`), `.field-label`, and `.error`.

Everything else is utility classes in the markup. Component `<style>` blocks are gone;
Tailwind v4's `@apply` needs a `@reference` directive to work inside Svelte's scoped
styles, and mixing the two would have reintroduced exactly the divergence this ADR is
meant to end.

One ordering trap is worth recording, because it is invisible in the source: Tailwind v4
emits `@layer theme, base, components, utilities`, so a rule in the components layer beats
one in the base layer no matter the specificity. `.input` therefore must not set
`outline-none` — doing so silently cancels the base `:focus-visible` ring for the app's
most numerous controls. Inputs style `:focus-visible` with a border tint only, and let the
base ring through.

The board's CSS Grid geometry stays where it was: as inline `style="grid-column: …"`
attributes computed by `board-view-model.ts`. Grid placement there is data, not design —
the column and row indices are derived from the domain, so they cannot be expressed as
static utility classes.

`.error` is kept as a named class rather than inlined utilities because the e2e suite
asserts on `p.error[role="alert"]`.

## Consequences

One vocabulary for colour and spacing, and adding a control to the board is now copying a
`class="input"` / `class="btn btn-quiet"` pair rather than inventing CSS. The tradeoff is
long class strings in the markup and one more build-time dependency in an experiment that
otherwise keeps its toolchain thin.

Restyling is confined to the presentation layer: no route, use case, or domain module
changed for this, which is the layering in ADR 0006 doing its job.

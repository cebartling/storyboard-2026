# 0018: Story descriptions are Markdown, rendered in a read-only story dialog

## Status

Accepted, 2026-09-04.

## Context

`Story.description` has existed since the first vertical slice. It is in the aggregate
(`src/lib/domain/story-map.ts`), in the Mongo document (`src/lib/server/db/collections.ts`),
in the view model (`src/lib/board/board-view-model.ts`), and — since ADR 0011 gave it a
textarea — it is editable. It has never been readable. The only way to see what a
description says is to reopen the editor and read the raw text out of the control that edits
it, which is what the board e2e still asserts.

So the board has a field users can write and cannot read. That is the gap this ADR closes,
and it is the second half of the one ADR 0011 opened when it observed that the description
"had nowhere to live".

Descriptions are not incidental text. A story map is Jeff Patton's technique, and the body
of a story is conventionally structured — an "As a…, I want…, so that…" sentence followed by
acceptance criteria as a list, sometimes a link to a ticket or a note about an open
question. Users type that structure whether or not anything renders it; plain text throws it
away. Markdown is the notation people already reach for, and it is what the reference
implementation (Cardboard) accepts.

Two things make this more than a rendering change:

- **There is no Content-Security-Policy.** Nothing sets one in `vite.config.ts`'s `kit`
  options, `src/hooks.server.ts`, or `src/app.html`. Rendering user text as HTML introduces
  the first `{@html}` in this codebase, with nothing behind it.
- **The author and the reader are different people.** Maps have owners and editors (ADR
  0015). An invited editor writes a description that the owner's browser renders. That is a
  stored-XSS path inside our own permission model, not a hypothetical about hostile input
  from outside.

## Decision

**Story descriptions are Markdown. They render in a new read-only `viewStory` dialog, and
the rendering path sanitises.**

- `src/lib/markdown/render-markdown.ts` is a pure module exposing
  `renderMarkdown(source: string | null): string`. It parses with `marked` and sanitises the
  result with `dompurify` against an explicit allowlist — the tags Markdown can emit that a
  description has a use for, and two attributes (`href` and `title`). No `style`, no `id`, no
  `on*`. An `afterSanitizeAttributes` hook puts `target="_blank"` and
  `rel="noopener noreferrer"` on surviving anchors, so an outbound link cannot hand the
  opener a reference back to the board. Those two are set by us and are deliberately not in
  the allowlist: DOMPurify keeps attributes written from a hook regardless, so allowing them
  as input would only have let an anchor whose `href` was stripped keep whatever `target`
  the description asked for.
- **Both the parser and the sanitiser are private instances**, not the `marked` and
  `DOMPurify` singletons. `marked.use()` and `DOMPurify.addHook()` mutate one shared object,
  so configuring the shared one would silently change how every future caller in the app
  parses or sanitises, with nothing at that call site to say why.
- **Three GFM constructs are handled deliberately rather than by omission**, because the
  failure mode for all of them is silent — the text survives and only its meaning is lost:
  - **Task lists render as `☐`/`☑` glyphs**, via a renderer override, so no `<input>` is
    ever emitted for the sanitiser to strip. Left alone, `- [x] done` and `- [ ] done`
    render identically, which is worse than showing no box at all — and acceptance criteria
    written as a task list are the motivating case in this ADR's Context.
  - **Tables are allowed** (`table`, `thead`, `tbody`, `tr`, `th`, `td`; all inert, with no
    attribute surface beyond what is already blocked). Flattened into a run of cell text,
    a table loses the only thing that made it one.
  - **Images are not.** With no CSP, an `img` pointing at an arbitrary host is a request the
    reader's browser makes on the author's behalf — a read receipt and an IP beacon that one
    editor could aim at the map's owner. The alt text is rendered as text so the author's
    words are not silently dropped.
- **The domain is untouched.** `description` stays raw text in the aggregate, in Mongo, and
  in the textarea. Markdown exists only at the moment of reading. This keeps ADR 0006's pure
  core free of a presentation concern and means there is no migration and no server change —
  `CellVM.stories` already carried the value to the client.
- **The read surface is a dialog, not the card.** ADR 0011 made the board render read-only
  and put every interaction behind a `BoardDialog`; this adds a `viewStory` case rather than
  a route or an inline expansion. Rendering prose on the card itself was rejected: cards are
  dense grid items sized by their content, and everything inside the board is subject to the
  world wrapper's CSS `zoom` (ADR 0010), whereas a `showModal()` dialog sits in the top layer
  at natural scale.
- **`viewStory` carries only a `storyId`**, unlike every `edit*` kind. An editor snapshots
  its subject because it must detect that the subject changed underneath it (ADR 0014); a
  read-only view has no pending input to lose, so it reads title and description live off
  the board and simply re-renders when a collaborator edits. Staleness costs nothing instead
  of needing a warning, and `subjectStatus` returns only `current` or `deleted` for it.
- **The card gets a second icon button.** ADR 0011 established that a card's trigger is a
  button and not a click on the card body, because `svelte-dnd-action` owns the card's
  pointer stream and there is no threshold that separates a tap from the start of a drag.
  That reasoning applies unchanged to a second trigger, so "view" is a button beside the
  pencil, sharing its hover-reveal gating and its place in `BoardViewport`'s
  `INTERACTIVE_SELECTOR`.
- **Prose styling is a hand-written `.prose-note` class** in `src/app.css`, on the existing
  `@theme` palette.

### Rejected

- **A hand-rolled subset renderer, zero dependencies.** Attractive against this experiment's
  four runtime dependencies, and safe by construction if input is escaped before any tag is
  emitted. Rejected because Markdown's edge cases — nested emphasis, link titles, reference
  links, code fences containing markup — are where hand-rolled parsers are subtly wrong, and
  being subtly wrong here means either mangled text or a hole in the only defence we have.
- **`marked` with a strict custom renderer and no DOMPurify.** One dependency instead of
  two, but it moves the security argument from a library with a public audit history onto
  our own renderer overrides, and `marked` removed its `sanitize` option precisely because
  parser-level sanitisation kept being incomplete.
- **`@tailwindcss/typography`.** A mature `prose` class, but it needs mapping onto this
  project's custom palette, which is most of the work of writing the class by hand, and it
  is a build dependency bought for one component.
- **A deep-linkable route or `?view=story:abc` query parameter.** ADR 0011 considered and
  rejected the same shape for editors as more machinery than this experiment needs; nothing
  about reading changes that trade.

## Consequences

**This codebase now has an `{@html}`, and it is the only one.** Its safety rests entirely on
`renderMarkdown`, because there is no CSP behind it. That makes the module's test file the
place where the security property is actually stated, and it covers script elements, inline
handlers, `iframe`/`object`/`style`/`form`, and `javascript:` and `data:` URIs alongside the
formatting cases. Adding a CSP later would be defence in depth, and would not make the
sanitiser optional.

**Two runtime dependencies, where there were four.** `marked` and `dompurify`, roughly 45kb
on the client. Both are named in `optimizeDeps.include`: they are CommonJS and reached only
from the browser test project, so on a cold optimiser cache Vite would otherwise discover
them mid-run and reload the test file it was running.

**`renderMarkdown` is browser-only, and must also stay inert at import time.** The second
half is the part that bites. SvelteKit imports the whole module graph to server-render a
route, so this module is loaded on the server even though `+page.svelte` opens with
`dialog = null` and the `viewStory` branch never renders there. In Node, `dompurify`'s
default export is the factory rather than a bound instance — `isSupported` is `false` and
`addHook` is `undefined` — so registering the anchor hook at module scope threw a
`TypeError` during SSR and turned the entire board route into a 500. It was caught by the
pre-existing canvas e2e, not by any new test, which is the argument for having run the whole
suite rather than only the new one.

Setup is therefore deferred to the first render, and a call without a DOM throws with a
message saying so. Failing loudly is deliberate: the alternative to sanitising is emitting
unsanitised HTML, which is not a fallback worth having. Rendering a description server-side
would need a real DOM shim, and would be a decision, not a fix.

The module's test lives in the browser Vitest project as `render-markdown.svelte.test.ts`
for the same underlying reason — the `.svelte.` infix is what routes a file to the browser
project, and the node project has no jsdom.

**Descriptions written before this ADR still render.** Plain prose is valid Markdown, so
existing text becomes a paragraph. The one visible change is that Markdown punctuation
someone typed literally — a leading `#`, or `*` around a word — now formats instead of
showing. `breaks: true` is on, so a single newline in the textarea stays a line break rather
than being folded into the paragraph, which matches what people typing into a textarea mean.

**Cards carry two controls where they carried one.** Two 24px targets on a small draggable
card is tighter than one, and it is the cost of not making the card body clickable.

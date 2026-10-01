# 0025: A map has a glossary, and descriptions link to it by id

## Status

Accepted, 2026-10-01. Being built in stages (PIN-327). The first change ships the domain,
persistence and use cases. The glossary page, the rendering of links with their hover
popup, and creating or linking entries from a selected phrase follow, each in its own
change.

## Context

PIN-327 asks for a glossary that story maps can use. People should be able to:

- start a glossary entry by highlighting a term;
- view, filter and edit the glossary;
- link words in a story to an entry;
- hover a linked word and see the entry in a popup.

Story maps collect domain vocabulary fast: "SKU", "basket", "fulfilment". Until now that
vocabulary had nowhere to live except in a reader's head or repeated inline in descriptions.

The ticket left three things open, and they were settled before any code was written:

- the scope of a glossary;
- how a link is recorded;
- which story text can carry a link.

## Decision

**Each map has one glossary, stored in the map's own aggregate.** A story description
links to an entry with a Markdown link whose target is `glossary:<entryId>`.

### Per map, in the aggregate

`StoryMap.glossary` is a flat array on the root, beside `dependencies`. An entry has an
`id`, a `term` and a `definition`, all plain text.

- **Per map, not per account or workspace.** Per map fits the existing design: one document
  per map (ADR 0003), one aggregate (ADR 0004), membership-based access (ADR 0015), the
  compare-and-set (ADR 0016) and the per-map SSE hub (ADR 0014). A shared glossary would
  need its own collection, access rules, concurrency and live-sync path. That is a second
  aggregate built for a reuse nobody has asked for yet.
- **Flat on the root, not nested.** An entry belongs to no single story. Many stories link
  to one entry, and deleting a story must not take its terms along.
- **Unranked.** The glossary is read in alphabetical order, so a person never chooses an
  order. `inRankOrder` leaves the array alone, as it does `dependencies`.
- **Terms are unique per map**, compared after trimming and ignoring case. Two entries for
  "SKU" would leave a reader unsure which one a link means. Both fields are required and
  stored trimmed, enforced by `requireName` like every other name in the aggregate.

### Links are explicit, by id

A link is written into the description source as `[the words](glossary:<entryId>)`.

- **Explicit rather than matched at render time.** Auto-linking every occurrence of a term
  cannot link a different phrasing ("baskets", "the cart") to an entry, and it decorates
  every mention whether or not the author meant the technical sense. The ticket also asks
  for words to be _linked_, which is an authoring act.
- **By id, not by term.** Renaming an entry then never breaks a link.
- **Deleting an entry rewrites nothing.** A link whose id no longer resolves renders as its
  plain words. The alternative is a cascade that rewrites prose in every story that
  mentioned the term, written by whoever happened to delete it, which is a much larger
  write than the one asked for. There is no foreign key here to make a dangling id
  dangerous.

### Descriptions only, and definitions stay plain text

Only `Story.description` carries links. It is the only Markdown in the app (ADR 0018).
Titles and acceptance criteria stay plain text (ADR 0024), and the board grid stays
read-only (ADR 0011).

A definition is plain text, rendered by Svelte rather than through `{@html}`. ADR 0018's
renderer stays the app's only HTML sink. The renderer emits a fixed element that carries
nothing but a validated entry id; the board looks up the definition by that id and shows it
as text. The definition never passes through the sanitiser.

## Consequences

- `toDomain` defaults `glossary` to `[]` because there are no migrations. Every map written
  before this field existed has no key at all. `toDocument` names the field explicitly, and
  a contract case round-trips it, because the in-memory double clones the aggregate and
  cannot lose it.
- A glossary write bumps the map's version like any other write. An editor opened before
  the write is stale afterwards. The edit-story dialog has to handle this when it creates an
  entry from a selected phrase: it must re-snapshot the version and keep the unsaved
  description, the same pattern ADR 0019 uses for the detail dialog.
- The renderer's allowlist grows to admit the glossary element. That change is security
  code (ADR 0018) and carries its own tests for what an author can and cannot smuggle
  through it.
- A glossary cannot be shared between maps. If that is ever wanted, it is a new aggregate
  and a new ADR, not a widening of this one.

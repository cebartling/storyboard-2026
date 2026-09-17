# 0021: Story status is on the aggregate, and colour is never the only channel

## Status

Accepted, 2026-09-16

## Context

PIN-219 asks for user story cards to be colour-coded by status. The board could not do
it, because a `Story` had no status: it carried `title`, `description`, `sliceId` and
`rank`, and nothing about where the work had got to. So the ticket is not a styling
change — it is a new field on the aggregate and everything that follows from one.

The map already says two things about a story's place in the plan. Horizontal is
activity → step, the narrative backbone. Vertical is the release slice, an ordering claim
about _when we intend to build it_. Neither says whether it is built. ADR 0019 added the
third question — what has to exist first — and left this one open.

Two decisions had to be made that the ticket did not settle: how many statuses, and
whether status is a fact about the map or a view belonging to whoever is looking.

## Decision

**A story carries one of five statuses, stored on the aggregate, set in the edit dialog,
and shown on the card as a tint plus a text chip.**

### The data

```ts
export const STORY_STATUSES = ['backlog', 'todo', 'in-progress', 'in-review', 'done'] as const;
export type StoryStatus = (typeof STORY_STATUSES)[number];
```

The array is the declaration and the union is derived from it, rather than the reverse:
the `<select>` in the dialog and `requireStatus` in the route both enumerate the values at
runtime, and deriving the type from the array is what stops those lists drifting.

**Shared, not per-viewer.** This is the opposite call to ADR 0020, which put slice
collapse in `localStorage` because nothing about hiding a row from your own view is a fact
about the map. A story's status _is_ a fact about the map — it is the thing two people
need to agree on — so it lives on the aggregate, bumps the version, and reaches every
collaborator through the write path that already exists. It needs no work in the SSE layer,
which notifies with a sequence number and lets clients refetch (ADR 0014 §5).

**Five, not three.** Three (todo / doing / done) would have been a smaller surface. The
extra two are the states people actually stall in: `backlog` distinguishes "on the map"
from "next", and `in-review` is where work sits while it is nobody's turn. A board that
cannot say those two says "in progress" for both.

**No relationship to ADR 0019's dependency badge.** A story blocked by two others may be
`in-progress` and that is not a contradiction — one is a fact about the plan, the other a
claim about the work. Deriving either from the other would make both less honest.

### The default is `todo`, and it keeps the old colour

Every story starts in `todo`, and a document written before this field reads back as
`todo`. There are no migrations here (ADR 0003), so defaulting happens where data enters
the domain: `addStory`, and the repository's `toDomain`.

`toDomain` maps the stories rather than casting them, unlike its neighbours, and it
**validates** rather than only filling in a missing field. Both halves matter, and neither
is theoretical.

The cast is the first trap: `doc.stories as StoryMap['stories']` typechecks against a
document type whose `status` is optional and hands the domain `undefined` for a field the
domain declares non-optional. The `dependencies` case in ADR 0019 failed loudly, with a 500
on the first delete. This one fails quietly and _misleadingly_: `StoryCard`'s prop default
turns `undefined` into "To do" on screen, while `dialog-subject` compares `undefined`
against `'todo'` and reports every open editor as stale — a bug that shows up nowhere near
the field that caused it.

Defaulting only `undefined` is the second. With no migrations and no schema (ADR 0003),
this adapter is the only thing enforcing the set, and the moment a status is renamed every
document still holding the old string flows straight through. There is no presentation
entry for it, so reading `.card` off `undefined` throws during render: not one card drawn
wrong, but a board that will not load. `isStoryStatus` is the guard, at the edge where
untrusted data enters.

`todo`'s colour is the amber every card already wore. That is the point of choosing it as
the default over `backlog`: a board nobody has triaged looks exactly as it did the day
before, and `backlog` is something a person opts into rather than something the migration
they never ran did to them.

### Colour is never the only channel

The status is named in words on the card, in a chip, and in the card's accessible name.
The tint is a scanning aid on top of that, not the message.

This is WCAG 1.4.1 (Use of Colour), and it is not a formality on this board: a story map is
a dense grid of small cards, which is exactly the case where tints are hardest to tell
apart — for anyone, and impossibly for the ~8% of men with a colour vision deficiency. The
five tokens sit at lightness ~0.5 so a chip label clears 4.5:1 against its own 8% tint, and
their hues are spread as far apart as five points on a wheel allow.

**The chip sits on the title's row, not on a row of its own**, which is the reverse of how
it was first built. Its own row reads better on a crowded card. It also makes every card
about 25px taller, and that turned out to break reordering in the e2e suite:
`svelte-dnd-action` swaps two cards as the pointer crosses the boundary between their
slots, and the drag helper aims at the target's midpoint — which a taller card pushes
past the boundary and back out of the swapped order, so the release undoes the reorder.
Measured, with 94px cards the swap held only while the pointer was within ~16px above the
target's top edge. The helper is the fragile thing here rather than the board, but a
layout that keeps it honest costs less than a rewritten drag simulation.

### Where it is set

In the **edit dialog**, beside title and description, as a `<select>`. The board grid
renders read-only (ADR 0011), so this is where a story's own fields are changed, and
status is one of its own fields. One form, one action, one use case — `editStory` already
took a `changes` object.

`requireStatus` rejects anything outside the set rather than defaulting it, for the reason
`requireDirection` gives: defaulting an unrecognised value would quietly move the story to
`todo`, undoing whatever it actually was.

`dialog-subject.ts` compares status alongside title and description. The same form posts
all three, so a collaborator moving a story to `done` under an open editor would otherwise
be reverted by "Save mine anyway" with nothing warning either of them (ADR 0014 §3).

## Consequences

Changing a status is an ordinary versioned write: it takes the per-map lock, advances the
version, and can be refused as stale. That is heavier than a click on a board usually
feels, and it is the price of the thing being shared. A quick-change control on the card
itself would want a narrower write than the whole-story edit this reuses.

Five statuses is five tints to keep distinguishable. A sixth would be the point to stop
adding colours and start asking what the chip alone can carry.

Nothing filters or groups by status. The field is on the aggregate and on the view model,
so a filter is additive when someone wants one.

Tested by `story-status.test.ts`, the status cases in `story-map.test.ts`,
`story-card.svelte.spec.ts` and `board-dialogs.svelte.spec.ts`, the `round-trips story
status` contract test, the repository's "document written before the field existed" case,
and the e2e `story-status.svelte.e2e.ts` — which asserts the round trip survives a reload
and that the board version moves, the thing that separates this from ADR 0020.

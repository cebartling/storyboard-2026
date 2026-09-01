# 0011: Modal dialogs for board editing; `use:enhance` instead of full-page posts

## Status

Accepted, 2026-09-01. Amends ADR 0008.

## Context

The board grid was also the edit surface. Every activity header carried a rename form, a
delete form, and an add-step form; every step header and slice gutter carried a rename and
a delete form; every unsliced cell carried an add-story form; every card carried a delete
form. That had three costs:

- The grid was hard to read. Columns were sized by their form controls rather than by their
  content, and a header was four controls before it was a name.
- It worked against the canvas. `BoardViewport` has to exclude every form control from
  panning (`INTERACTIVE_SELECTOR`), and the controls competed with cards for the space a
  drag needs.
- `Story.description` had nowhere to live. The column exists in the schema, `editStory`
  exists in `src/lib/domain/story-map.ts` and `src/lib/app/use-cases.ts` with tests, and
  `CellVM.stories` already carried the value — but no route action or UI ever touched it,
  because there was no room on a card for a second field.

Adding a story into a release slice was also impossible: the inline add form only existed
on the unsliced row, so a story had to be created unsliced and then dragged.

## Decision

**The board renders read-only.** It shows names, cards, and trigger buttons. Every create,
update, and delete happens in a modal dialog.

- `src/lib/components/modal.svelte` wraps the native `<dialog>` element and is opened with
  `showModal()`. That one call provides the top layer, the `::backdrop`, a focus trap,
  Escape-to-close, inerting of the rest of the document, and focus return to the trigger, so
  none of it is written here.
- `src/lib/components/board-dialogs.svelte` holds all eight editor forms behind a
  `BoardDialog` discriminated union. One union rather than a boolean and an id per editor:
  only one dialog can be open at a time, so the payload travels with the kind and "which
  editor" cannot disagree with "which entity".
- The forms post the same named actions ADR 0008 established. Only the submission path
  changed: `use:enhance` with an explicit `invalidateAll()`, because a full-page POST
  navigation would tear down the dialog the user is standing in. The `SubmitFunction`
  returns a callback, which suppresses `enhance`'s default `applyAction` deliberately —
  the default would push the failure into the page's `form` prop and render the same
  message twice, once in the dialog and once in the board's error banner.
- A new `?/editStory` action exposes the pre-existing `editStory` use case, giving the
  story dialog a title field and a description textarea.
- Deletes live in the dialog that edits the thing, as a second form. The dialog is the
  confirmation step; there is no separate confirm.
- The story card's trigger is a pencil **button**, not a click on the card. `svelte-dnd-action`
  owns the card body's pointer stream and nothing in this app distinguishes a click from the
  start of a drag. Being a `<button>` also keeps it inside `BoardViewport`'s
  `INTERACTIVE_SELECTOR`, so panning never steals it.

## Consequences

**Editing now requires JavaScript.** This is the real cost, and it amends ADR 0008 rather
than superseding it: the mutation transport is unchanged — still named form actions, still
server-authoritative ranks — but the UI that reaches them is not reachable without JS,
because a `<dialog>` that is never `showModal()`-ed is `display: none`. A visitor with JS
off now gets a genuinely read-only board. The actions themselves remain plain form actions
and still accept an ordinary POST (the e2e suite relies on exactly that, posting
`?/deleteStory` with `fetch` to set up a stale-client case), and `/`'s `?/createMap` form is
untouched, so creating a map still works without JS.

A URL-driven alternative (`?edit=step:abc`, with the server rendering `<dialog open>`)
would have kept the no-JS path and made an open editor deep-linkable. It was rejected as
more machinery than this experiment needs: a param parser in `load`, and every close
becoming a navigation.

**Dialogs render as a sibling of `BoardViewport`, never as an ancestor of a dnd zone.** ADR
0010 records that `svelte-dnd-action`'s `handleDragStart` resolves its drag-mirror parent
with `originDropZone.closest('dialog') || closest('[popover]') || getRootNode()`. A modal
wrapping the board would move the mirror inside the dialog. Keeping the dialogs outside the
board subtree leaves the mirror on `document.body` where ADR 0010 measured it.

**The z-index ladder needed no change.** `showModal()` promotes the dialog to the top
layer, which is above every `z-*` on the board, and inerts what is behind it, so pointer
events never reach the viewport underneath.

**`board-viewport.svelte` suppresses its `+`/`-`/`0`/`1` shortcuts while any `dialog[open]`
exists.** Those shortcuts are bound at the window, and the existing `isTypingTarget` check
deliberately excludes buttons (so that clicking a zoom button does not silence the shortcut
it advertises) — which means that without the guard, pressing `1` with a dialog's Delete
button focused would fit the board the user cannot see.

**Cells are one row taller**, because each now carries an add-story trigger. That is the
price of being able to add into any slice band, and it was enough to change the board's
overflow: the board e2e now fits the board before its last drag, since the restored camera
otherwise leaves cards underneath the sticky headers.

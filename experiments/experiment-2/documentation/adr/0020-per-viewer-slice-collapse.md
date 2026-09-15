# 0020: Slice collapse is per-viewer presentation state

## Status

Accepted, 2026-09-14

## Context

PIN-217 asks for a way to toggle a release slice's visibility. On a real map the board is
tall, and someone working on Release 1 wants the later slices out of the way without
deleting or moving anything.

Two readings were possible: a shared flag on `Slice` that every collaborator sees, or a
view choice that belongs to whoever is looking. A shared flag would mean a domain field,
a document field and its mapping, a use case, a form action, a version bump per click, and
a broadcast that collapses a row under someone else's pointer. Nothing about hiding a row
from your own view is a fact about the map.

## Decision

Collapsing a slice is **this viewer's presentation state**, stored in `localStorage` under
`storyboard:collapsed-slices:v1:${mapId}` — the same precedent as the camera (ADR 0010).

- **`src/lib/board/slice-collapse-storage.ts` is the only code that reads or writes it**,
  shaped after `camera-storage.ts`: a backend interface, validation of the parsed value
  (an array of strings or nothing), and every access wrapped, because storage can throw.
- **The board view model is untouched.** It is built on the server (`+page.server.ts`),
  which has no access to the viewer's storage; the route applies the set on the client.
- **A collapsed row keeps its label and grid row** and shows a story count per cell in
  place of the cards, the "Add story" button and the drop zone — nothing can be dropped
  into a band the viewer cannot see. The row track becomes `auto` instead of the 140px
  minimum an expanded band reserves, which is what lets it shrink.
- **The Unsliced band cannot collapse.** It is where every new story lands.
- **Stale ids are harmless.** A slice another editor deleted matches no row and is simply
  ignored.

## Consequences

Toggling never writes to the server, never changes the map version, and never reaches a
collaborator's board; state is per browser, not per account, so it does not follow a user
to another device.

The server render has no storage, so a collapsed slice paints expanded for a frame before
hydration collapses it. Avoiding that would need a cookie read on the server, which is the
server involvement this decision exists to avoid.

Tested by `slice-collapse-storage.test.ts` and the board e2e
"collapse a slice hides its stories and persists across reload", which also asserts the
board version is unchanged.

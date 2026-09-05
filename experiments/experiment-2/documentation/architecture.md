# Architecture

Hexagonal-lite: a pure functional core, an imperative shell, exactly two outbound ports,
zero inbound ports. This is the direct written answer to "would hexagonal architecture be
helpful here?" — see ADR 0006 for the full reasoning; this document is the picture and the
request-flow trace.

## Layer diagram

```
                         ┌─────────────────────────────┐
                         │   src/routes/                │
                         │   SvelteKit load() +          │   <- driving adapter
                         │   named form actions           │      (the one and only driver)
                         └───────────────┬─────────────┘
                                         │ calls
                         ┌───────────────▼─────────────┐
                         │   src/lib/app/                │
                         │   use-case functions:          │   <- orchestration
                         │   createMap, addStory,          │      (thin: validate input,
                         │   moveStory, addSlice, ...       │       call domain, call ports)
                         └───────┬───────────────┬─────┘
                                 │                │
              ┌──────────────────▼───┐   ┌──────▼──────────────┐
              │ src/lib/domain/        │   │  outbound ports        │
              │ story-map.ts            │   │  (src/lib/domain/       │
              │  rank.ts  ids.ts         │   │   ports.ts)             │
              │                          │   │                         │
              │ pure TS, zero svelte/    │   │  StoryMapRepository     │
              │ mongodb imports —        │   │  AiAssistant            │
              │ aggregate + move/        │   └──────┬───────────┬────┘
              │ reorder/slice logic      │          │            │
              └──────────────────────────┘   ┌──────▼─────┐  ┌──▼──────────┐
                                              │ src/lib/    │  │ src/lib/    │
                                              │ server/     │  │ server/ai/  │
                                              │ repository/ │  │             │
                                              │ (MongoDB)   │  │ Null        │
                                              │             │  │ AiAssistant │
                                              └─────────────┘  └─────────────┘
                                                      ▲
                                              composition root:
                                              src/lib/server/deps.ts
                                              wires concrete adapters as a
                                              module-level singleton,
                                              imported by routes and passed
                                              into use cases
```

Two things sit beside that picture rather than inside it:

- **`src/lib/server/auth/`** — accounts and sessions (ADR 0015). Not an outbound port: one
  implementation, one consumer, already testable against an in-memory MongoDB, so under
  ADR 0006's own test a port would be ceremony. The layers above it see a `Caller`, which is
  a value, never a user record. `src/hooks.server.ts` resolves the session cookie into
  `locals.user`, and `requireCaller(locals)` is the single place a `Caller` is constructed.
- **`src/lib/app/keyed-lock.ts`** — the per-map write lock (ADR 0014 §2). Neither adapter nor
  port; it serialises a use case's whole `load → mutate → save`, which no port method spans.
- **`src/lib/server/collab/`** — the per-map event hubs and the SSE stream (ADR 0014 Stage 1),
  wired in `deps.ts` alongside the adapters. Not a port: nothing in `src/lib/domain/` or
  `src/lib/app/` knows it exists, and the broadcast is published from the route after an
  action succeeds — publishing from a use case would need a third outbound port, which
  ADR 0006 declines. Its client half is `src/lib/collab/`.

Both the write lock and the hubs are single-instance module state, which makes the
single-process deployment a correctness requirement rather than a convenience.

Note that authorisation is enforced **in the adapters**, not in the use cases: they hold the
membership rows, so one query answers "does this exist" and "may they" together. The cost is
that policy lives in two implementations, which is why both are held to
`src/lib/app/story-map-repository-contract.ts`.

## Did the ports work? (measured, not asserted)

`experiment-2` replaced the entire persistence layer. Across `src/lib/domain/`,
`src/lib/app/`, `src/lib/board/`, `src/lib/canvas/`, `src/lib/collab/`,
`src/lib/components/`, `src/lib/seed/` and `src/routes/`, **69 of 80 files are
byte-identical to experiment-1**. Nine of the eleven differences are the port swap itself:
four `await`s (`Auth` was synchronous only because better-sqlite3 is), one new domain
function (`inRankOrder`), the in-memory double and its contract test, one test fixture's
error string, and one word in a comment. The other two are test files a later self-review
added. ADR 0003 lists them all, and lists the four pre-existing divergences the exercise
turned up.

## The two outbound ports, and why only two

1. **`StoryMapRepository`** — loads and saves a whole `StoryMap` aggregate. This is the
   port that matters for testability: the domain layer's rank math and move/slice
   semantics can be unit-tested with zero database, and the repository's MongoDB
   implementation can be integration-tested separately against a real (in-process,
   in-memory) replica set. Swappability was not the goal — but it is what this experiment
   turned out to measure, and the port survived the measurement: the whole adapter was
   replaced and the port, the contract test, the domain, the use cases, the components and
   the routes did not change.
2. **`AiAssistant`** — the user-mandated seam for future AI features. Implemented today
   only as `NullAiAssistant`. The commitment this port represents is the _contract style_
   (domain snapshots in, structured suggestions out, never free text or raw prompts), not
   its current method list, which is provisional. See ADR 0007.

No inbound ports. SvelteKit's `load()` functions and named form actions already are the
driving adapter — the app itself is the only driver that carries behaviour (no second UI, no
external API consumer), so an inbound port interface would exist only to be implemented
once, which is ceremony, not architecture. `scripts/seed.ts` is a second, deliberately
trivial driver: it builds the sample map from `src/lib/seed/` with pure domain functions and
hands it to a repository it constructs itself. It holds no rules, so it does not change that
judgement. No `Clock` or `Id` port either —
see ADR 0006 for what was deliberately left out and why.

## Composition root

`src/lib/server/deps.ts` is where concrete adapters are constructed and wired: the MongoDB
`StoryMapRepository` implementation with its client, and `NullAiAssistant`. `load()`
functions and form actions import from `deps.ts` and pass the resulting objects into
`src/lib/app/` use-case functions. Nothing outside `deps.ts` imports the MongoDB driver or
touches a client directly — that is the boundary the repository port exists to enforce.

The client is a module-level singleton because that is what a `MongoClient` is for: it is a
connection pool, meant to be created once and shared, and one per request would defeat
pooling entirely. It is closed on `SIGTERM`/`SIGINT` beside the SSE streams — its pool holds
live handles, so leaving it open keeps the event loop alive past the point everything else
has finished.

`scripts/seed.ts` is the one exception, and only because it is not part of the app: it runs
outside SvelteKit (`$env/dynamic/private` does not resolve under `tsx`), so it builds its own
client and repository. Its map-building logic lives in `src/lib/seed/`, which imports
nothing but `src/lib/domain/` and is unit-tested without a database.

## Request flow: `moveStory` end to end

1. Client drags a story card; `svelte-dnd-action`'s `finalize` event fires with the
   dropped-on neighbours.
2. The drag wrapper component posts the SvelteKit form action `?/moveStory` with
   `storyId`, target `stepId`, target `sliceId` (nullable), `beforeId`, `afterId`.
3. The route's `actions.moveStory` (in `src/routes/maps/[mapId]/+page.server.ts`) parses
   and validates the form data, then calls the `moveStory` use case in `src/lib/app/`,
   passing the deps from `deps.ts`.
4. The use case calls `StoryMapRepository.load(mapId)` to get the current aggregate,
   calls the pure domain function `StoryMap.moveStory(...)` (computes the new rank via
   `generateKeyBetween`, and reassigns `sliceId` if the drop crossed a slice line — see
   `domain-model.md`'s worked examples), then calls `StoryMapRepository.save(map)`.
5. The action returns; the client calls SvelteKit's `invalidateAll()`, which reruns
   `load()` and refetches the map, showing the server-authoritative
   rank and slice. The client never computes or trusts its own rank — the server's write
   is the source of truth, and a failed/rejected move simply reverts on reload.

## Board editing: read-only grid, dialog editors

The board grid renders names, cards, and trigger buttons — no form controls (ADR 0011).
Every create/update/delete lives in `src/lib/components/board-dialogs.svelte`, rendered
inside `modal.svelte` (a wrapper over the native `<dialog>` + `showModal()`) as a **sibling
of `BoardViewport`, never an ancestor of a dnd zone** — `svelte-dnd-action` resolves its
drag-mirror parent through `originDropZone.closest('dialog')`, so a modal wrapping the board
would relocate the mirror ADR 0010 measured.

Which editor is open is one `$state` discriminated union in the route
(`BoardDialog`), so the payload to prefill travels with the kind. The forms post the same
named actions described below, through `use:enhance` with an explicit `invalidateAll()`:
without a page navigation nothing else reruns `load()`. The `SubmitFunction` returns a
callback, which suppresses `enhance`'s default `applyAction` — the dialog owns its own
error, and the default would render the same message a second time in the board's banner.

## Board canvas: pan, zoom, and the minimap

`src/routes/maps/[mapId]/+page.svelte` used to wrap the board grid directly in
`<div class="panel overflow-x-auto">` — horizontal scroll only, no overview, no zoom. It now
wraps the same, unmodified grid in `BoardViewport` (`src/lib/components/board-viewport.svelte`):
a bounded-height `overflow-auto` container that owns every pan/zoom gesture (wheel, ctrl/cmd+wheel
and pinch, background/middle-mouse/space drag, keyboard shortcuts) and reports measured sizes and
scroll back into a `Camera` (`src/lib/canvas/camera.svelte.ts`). `ZoomControls` and `BoardMinimap`
render as corner overlays alongside it, driven by the same `Camera`.

Pan is native browser scrolling; zoom is the CSS `zoom` property on a wrapper around the board,
not `transform: scale()` — see ADR 0010 for why (in short: `zoom` is layout-affecting, so scroll
extents, `sticky` positioning, and scroll-into-view all keep working against the visual size for
free, and `svelte-dnd-action`'s drop detection and drag mirror are viewport-space either way). All
of this state and math lives in `src/lib/canvas/`, outside `src/lib/domain/`: it is presentation
state for one route, not a story-mapping domain invariant, so ADR 0006's pure-core boundary does
not apply to it, but the math (`camera-math.ts`) is still plain, DOM-free TypeScript, unit-tested
the same way the domain layer is. `minimap-model.ts` takes a structural subset of
`BoardViewModel`'s shape rather than the whole type, so a field added to the view model does not
recompile the minimap. `board-view-model.ts` itself lives in `src/lib/board/`: it is pure,
DB-free, and read from `src/lib/canvas/`'s tests as well as from the route, which is what told us
it was in the wrong place — `src/lib/` never depends on `src/routes/`, and now nothing pretends
otherwise. Camera state persists per map in `localStorage`
(`camera-storage.ts`, key `storyboard:camera:v1:${mapId}`), read only inside `$effect` so it never
runs during SSR.

## Test strategy

Three layers, each tested at the boundary where it's cheapest to get signal: the domain
layer (`src/lib/domain/`) is pure TypeScript with no I/O, so it gets fast Vitest unit
tests covering rank math, move/reorder, and slice-reassignment invariants directly — this
is the highest-value test surface in the project because it's where the domain rules
actually live; the MongoDB `StoryMapRepository` implementation is integration-tested
against a real replica set (`mongodb-memory-server`, one server for the run and a fresh
database per test) rather than mocked, since the whole point of the port is to isolate
driver-specific behaviour, and that behaviour is exactly what needs verifying against a
real driver; and Playwright drives the full vertical slice through a real browser against
the running SvelteKit app (its own `storyboard-e2e` database, dropped before every run),
covering the one scenario that matters end to end — create map, add
activity/step/story, drag to reorder, drag onto a slice, reload, and confirm order and
slice membership persisted.

## Starting from an empty database

There are no migrations to run — `src/lib/server/db/indexes.ts` creates the indexes at
startup and `createIndex` is idempotent, so `pnpm dev`, the e2e server and the demo all work
against an empty database with no separate step (ADR 0003).

Every map needs an owner (ADR 0015), and nothing invents one: a fabricated membership row
would point at a user id nobody can log in as. So the seed script takes the address of an
account that already exists.

```
corepack pnpm db:up                       # MongoDB, healthy and PRIMARY
corepack pnpm dev                         # register an account in the app
corepack pnpm db:seed you@example.com     # the sample map, owned by that account
```

`corepack pnpm db:reset` throws the volume away and starts again. The e2e and demo
databases are separate and are dropped before each run, so neither needs tidying.

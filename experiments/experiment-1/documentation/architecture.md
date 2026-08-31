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
              │ drizzle imports —        │   │  AiAssistant            │
              │ aggregate + move/        │   └──────┬───────────┬────┘
              │ reorder/slice logic      │          │            │
              └──────────────────────────┘   ┌──────▼─────┐  ┌──▼──────────┐
                                              │ src/lib/    │  │ src/lib/    │
                                              │ server/     │  │ server/ai/  │
                                              │ repository/ │  │             │
                                              │ (Drizzle +  │  │ Null        │
                                              │  SQLite)    │  │ AiAssistant │
                                              └─────────────┘  └─────────────┘
                                                      ▲
                                              composition root:
                                              src/lib/server/deps.ts
                                              wires concrete adapters,
                                              handed to use-cases per request
```

## The two outbound ports, and why only two

1. **`StoryMapRepository`** — loads and saves a whole `StoryMap` aggregate. This is the
   port that matters for testability: the domain layer's rank math and move/slice
   semantics can be unit-tested with zero database, and the repository's Drizzle
   implementation can be integration-tested separately against a real (temp-file) SQLite
   database. Swappability was not the goal — there is no second implementation planned —
   testability is.
2. **`AiAssistant`** — the user-mandated seam for future AI features. Implemented today
   only as `NullAiAssistant`. The commitment this port represents is the _contract style_
   (domain snapshots in, structured suggestions out, never free text or raw prompts), not
   its current method list, which is provisional. See ADR 0007.

No inbound ports. SvelteKit's `load()` functions and named form actions already are the
driving adapter — there is exactly one driver (the SvelteKit app itself; no CLI, no second
UI, no external API consumer), so an inbound port interface would exist only to be
implemented once, which is ceremony, not architecture. No `Clock` or `Id` port either —
see ADR 0006 for what was deliberately left out and why.

## Composition root

`src/lib/server/deps.ts` is where concrete adapters are constructed and wired: the Drizzle
`StoryMapRepository` implementation with its DB client, and `NullAiAssistant`. `load()`
functions and form actions import from `deps.ts` and pass the resulting objects into
`src/lib/app/` use-case functions. Nothing outside `deps.ts` imports Drizzle or touches a
DB client directly — that is the boundary the repository port exists to enforce.

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
5. The action returns; the client calls SvelteKit's `invalidate()` for the map's data
   dependency, which reruns `load()` and refetches the map, showing the server-authoritative
   rank and slice. The client never computes or trusts its own rank — the server's write
   is the source of truth, and a failed/rejected move simply reverts on reload.

## Test strategy

Three layers, each tested at the boundary where it's cheapest to get signal: the domain
layer (`src/lib/domain/`) is pure TypeScript with no I/O, so it gets fast Vitest unit
tests covering rank math, move/reorder, and slice-reassignment invariants directly — this
is the highest-value test surface in the project because it's where the domain rules
actually live; the Drizzle `StoryMapRepository` implementation is integration-tested
against a real temp SQLite file (created and torn down per test run) rather than mocked,
since the whole point of the port is to isolate Drizzle-specific behavior, and that
behavior is exactly what needs verifying against a real driver; and Playwright drives the
full vertical slice through a real browser against the running SvelteKit app (its own
`e2e.db`), covering the one scenario that matters end to end — create map, add
activity/step/story, drag to reorder, drag onto a slice, reload, and confirm order and
slice membership persisted.

# 0006: Hexagonal-lite — pure core, two outbound ports, no inbound ports

## Status

Accepted, 2026-08-31

## Context

This is the written answer to the question asked directly at the start of this
experiment: **would hexagonal architecture be helpful here?**

Full ports-and-adapters (hexagonal/onion architecture) typically means: an inbound port
interface for every way the application can be driven (so a CLI, an HTTP API, a UI, and
tests can all drive the same use cases through the same contract), an outbound port for
every external dependency, and often infrastructure ports like `Clock` and `Id` generation
so even time and identity are swappable and mockable, usually wired together by a DI
container.

This experiment has exactly one driver — the SvelteKit app itself, via `load()` and named
form actions. There is no CLI, no second UI, no external API consumer, and none planned.
It does have two dependencies worth insulating the domain from: persistence (MongoDB,
ADR 0003) and a future AI integration that doesn't exist yet.

## Decision

Build a _pure functional core_ (`src/lib/domain/` — zero svelte or mongodb imports) wrapped
by an _imperative shell_ (`src/lib/app/` use cases, `src/lib/server/` adapters), with
exactly two outbound ports (`StoryMapRepository`, `AiAssistant`; see ADR 0004/0007 for
each) and no inbound ports.

Deliberately **not built**, and why each would have been ceremony rather than value given
a single driver:

- **Inbound ports** (e.g. a `StoryMapUseCases` interface implemented by `src/lib/app/` and
  called through the interface rather than directly). With one driver, an inbound port
  interface has exactly one implementation and exactly one caller — it can never be
  satisfying a "swap the driver" requirement that doesn't exist. SvelteKit's `load()` and
  form actions call the use-case functions directly.
- **`Clock` / `Id` ports.** Wrapping `Date.now()` and ID generation behind port interfaces
  is a pattern for when tests need to control time or produce deterministic IDs across
  many call sites in a large codebase. At this scale, domain unit tests that need a fixed
  clock can pass a value directly into the function under test — no port needed to
  achieve the same determinism.

  **Amendment, 2026-09-02** (finding A8 of `../review-2026-09-02.md`): that is true of the
  clock, which `createStoryMap` takes as a parameter, but it was never true of ids.
  `newId()` is called _inside_ `createStoryMap`, `addActivity`, `addStep`, `addSlice` and
  `addStory`, so a test cannot supply one. The consequence is small and worth stating
  rather than fixing: domain tests match returned entities structurally, or capture the id
  from the result, instead of asserting against an id they chose. Adding an `Id` port — or
  optional `id` parameters — to buy exact-equality assertions would be paying for
  determinism the tests do not actually need.

- **A DI container.** The composition root (`src/lib/server/deps.ts`) is a plain module
  that constructs and exports the two concrete adapters. A container (reflection-based
  wiring, lifecycle management, scopes) solves problems — many dependencies, request-scoped
  vs. singleton lifetimes, conditional wiring — that don't exist with two ports and one
  composition point.

## Consequences

The payoff: the domain layer's move/reorder/slice logic — the part of this codebase most
worth getting right and most worth testing thoroughly — is pure TypeScript, unit-testable
with zero database or framework in the loop, and the `AiAssistant` seam exists so AI can be
plugged in later without the domain layer needing to change. The cost, honestly stated: no
driver independence. If a second driver ever shows up (a CLI import tool, a public API),
the use-case layer in `src/lib/app/` would need an inbound port interface retrofitted, and
today's direct calls from routes into use-case functions would need to go through it
instead. That is treated as an acceptable, explicitly deferred cost — building it now, for
a driver that doesn't exist, would be speculative.

One deferred cost is worth naming precisely, because it is easy to assume it is cheaper
than it is (finding A10 of `../review-2026-09-02.md`). **Authentication is a port-signature
change, not a middleware layer.** `StoryMapRepository.listSummaries()` takes no scope and
returns every map, `load(id)` has no caller identity, `App.Locals` is empty, and `maps` has
no owner column. Adding auth therefore means a caller/scope argument on the repository
port, an owner column, and a change at every action — not a hook in front of the existing
ones.

# CLAUDE.md — experiment-1

Guidance for Claude Code when working in `experiments/experiment-1/`.

## What this is

A vertical-slice implementation of Jeff Patton's user story mapping technique, built to
test an architecture before committing the product to one. Cardboard (cardboardit.com) is
the reference implementation of the technique.

**Self-contained**: this directory has its own `package.json`, dependencies, and tests.
Run every command below from `experiments/experiment-1/`, not the repo root.

Read `documentation/` before changing anything structural — `glossary.md` for the Patton
vocabulary (note: we say **Step** where Patton says _user task_), `domain-model.md` for
entities and invariants, `architecture.md` for the layering, and `adr/` for why. ADR 0006
is the one that constrains most changes.

## Commands

| Task                 | Command                                                                           |
| -------------------- | --------------------------------------------------------------------------------- |
| Dev server           | `pnpm dev`                                                                        |
| Full suite           | `pnpm test` (Vitest then Playwright)                                              |
| All unit + component | `pnpm test:unit -- --run`                                                         |
| All e2e              | `pnpm test:e2e`                                                                   |
| **Single unit test** | `pnpm vitest run src/lib/domain/story-map.test.ts -t "moves story between steps"` |
| **Single e2e test**  | `pnpm playwright test -g "drag story to slice"`                                   |
| Types                | `pnpm check`                                                                      |
| Lint / format        | `pnpm lint` / `pnpm format`                                                       |
| New migration        | `pnpm db:generate` (commit `drizzle/`)                                            |
| Inspect DB           | `pnpm db:studio`                                                                  |

Migrations apply automatically at db-module load, so `pnpm dev` and the e2e server
self-migrate. E2e runs against a throwaway `e2e.db` and never touch `local.db`.

## Architecture constraints

- `src/lib/domain/` is **pure TypeScript**: no imports from `svelte`, `@sveltejs/kit`, or
  `drizzle`. All invariants live here, not only in the DB. Keep it that way — it is the
  reason the domain is testable without a database.
- Routes call `src/lib/app/` use cases, which call the ports in `src/lib/domain/ports.ts`.
  Routes do not talk to the repository directly.
- Ordering uses **fractional ranks** (TEXT), never integer positions. The client never
  computes a rank — it sends neighbour ids and the server derives the rank. See ADR 0005.
- Drag-and-drop is isolated behind `src/lib/components/story-dnd-zone.svelte` so
  `svelte-dnd-action` can be swapped without touching the board.
- Svelte 5 runes mode is forced: `onclick` not `on:click`, callback props not
  `createEventDispatcher`, snippets not slots. Runes work only in `.svelte`/`.svelte.ts`.

## Testing notes

On Ubuntu 26.04, `playwright install` (which `pnpm test` and `pnpm test:e2e` run first)
fails against the host platform. Prefix it once with
`PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64` to seed the browsers; afterwards the
suites run normally.

`svelte-dnd-action` is pointer-event based, so **Playwright's `dragTo` does not work**.
Drags need `mouse.down()` → several `mouse.move(x, y, { steps: 5 })` waypoints with short
waits → `mouse.up()`, then a settle before asserting. See the e2e spec beside
`src/routes/maps/[mapId]/`.

## Not built (deliberately)

Real-time collaboration, authentication, and AI calls. The `AiAssistant` port exists with a
null implementation so AI plugs in without rework — its contract style (domain snapshots
in, structured suggestions out) is the commitment; its method list is provisional.

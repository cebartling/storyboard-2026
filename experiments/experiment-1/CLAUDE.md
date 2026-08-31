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

`package.json` pins `packageManager: pnpm@11.24.0`. Run everything through `corepack pnpm`
so the pinned version is used — a bare `pnpm` picks up whatever is on your PATH, and
versions before 10 reject this directory's `pnpm-workspace.yaml` with
`packages field missing or empty`.

| Task                 | Command                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Dev server           | `corepack pnpm dev`                                                                        |
| Full suite           | `corepack pnpm test` (Vitest then Playwright)                                              |
| All unit + component | `corepack pnpm test:unit -- --run`                                                         |
| All e2e              | `corepack pnpm test:e2e`                                                                   |
| **Single unit test** | `corepack pnpm vitest run src/lib/domain/story-map.test.ts -t "moves story between steps"` |
| **Single e2e test**  | `corepack pnpm playwright test -g "drag story to slice"`                                   |
| Types                | `corepack pnpm check`                                                                      |
| Lint / format        | `corepack pnpm lint` / `corepack pnpm format`                                              |
| New migration        | `corepack pnpm db:generate` (commit `drizzle/`)                                            |
| Inspect DB           | `corepack pnpm db:studio`                                                                  |

Migrations apply automatically at db-module load, so `corepack pnpm dev` and the e2e server
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
- Styling is **Tailwind CSS v4** (ADR 0009). The palette and the repeated control classes
  (`.panel`, `.input`, `.btn`/`.btn-primary`/`.btn-quiet`/`.btn-danger-quiet`,
  `.field-label`, `.error`) live in `src/app.css`; everything else is utilities in the
  markup. Components have no `<style>` blocks — add utilities or extend `src/app.css`
  instead. The board's `grid-column`/`grid-row` inline styles stay inline: they are data
  from `board-view-model.ts`, not design.
- Svelte 5 runes mode is forced: `onclick` not `on:click`, callback props not
  `createEventDispatcher`, snippets not slots. Runes work only in `.svelte`/`.svelte.ts`.

## Testing notes

On Ubuntu 26.04, `playwright install` (which `corepack pnpm test` and `corepack pnpm test:e2e` run first)
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

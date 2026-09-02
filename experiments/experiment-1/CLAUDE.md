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
is the one that constrains most changes; ADR 0010 (canvas) and ADR 0011 (dialog editing)
constrain most board work.

## Commands

`package.json` pins `packageManager: pnpm@11.24.0`. Run everything through `corepack pnpm`
so the pinned version is used — a bare `pnpm` picks up whatever is on your PATH, and
versions before 10 reject this directory's `pnpm-workspace.yaml` with
`packages field missing or empty`.

| Task                             | Command                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| Dev server                       | `corepack pnpm dev`                                                                        |
| Full suite                       | `corepack pnpm test` (Vitest then Playwright)                                              |
| All unit + component             | `corepack pnpm test:unit -- --run`                                                         |
| All e2e                          | `corepack pnpm test:e2e`                                                                   |
| **Single unit test**             | `corepack pnpm vitest run src/lib/domain/story-map.test.ts -t "moves story between steps"` |
| **Single canvas unit test**      | `corepack pnpm vitest run src/lib/canvas/camera-math.test.ts`                              |
| **Single canvas component test** | `corepack pnpm vitest run src/lib/components/board-viewport.svelte.spec.ts`                |
| **Single e2e test**              | `corepack pnpm playwright test -g "drag story to slice"`                                   |
| **Single canvas e2e test**       | `corepack pnpm playwright test -g "pan and zoom persist"`                                  |
| Types                            | `corepack pnpm check`                                                                      |
| Lint / format                    | `corepack pnpm lint` / `corepack pnpm format`                                              |
| New migration                    | `corepack pnpm db:generate` (commit `drizzle/`)                                            |
| Inspect DB                       | `corepack pnpm db:studio`                                                                  |
| Seed sample data                 | `corepack pnpm db:seed`                                                                    |

Migrations apply automatically at db-module load, so `corepack pnpm dev` and the e2e server
self-migrate. E2e runs against a throwaway `e2e.db` and never touch `local.db`.

`db:seed` runs `scripts/seed.ts` (under `tsx`, since the script is outside SvelteKit's
build), which writes the sample retail commerce map from `src/lib/seed/` to `DATABASE_URL`.
It appends a new map on every run rather than replacing one — nothing in the app depends on
the seed, so no test or fixture breaks if you delete it.

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
- The board's pan/zoom canvas (ADR 0010) lives in `src/lib/canvas/`: `camera-math.ts` (pure
  math, no DOM types), `camera.svelte.ts` (the `Camera` rune object), `minimap-model.ts`
  (flattens board grid geometry for the minimap — takes a structural input type so it
  never imports the route's `board-view-model.ts`), and `camera-storage.ts` (the
  `localStorage` persistence, read/written only inside `$effect`). Like `src/lib/domain/`,
  `camera-math.ts` stays DOM-free and unit-testable, but it is presentation state for one
  route, not a domain invariant, so it lives outside `src/lib/domain/` and ADR 0006's
  pure-core boundary does not apply to it. `src/lib/components/board-viewport.svelte`,
  `zoom-controls.svelte`, and `board-minimap.svelte` are the DOM-facing pieces that turn
  gestures into `Camera` calls; they own no pan/zoom state of their own.
- The board grid is **read-only** (ADR 0011). Every create/update/delete happens in
  `src/lib/components/board-dialogs.svelte`, shown by `modal.svelte` (native `<dialog>` +
  `showModal()`) and submitted with `use:enhance` + `invalidateAll()`. Dialogs render as a
  sibling of `BoardViewport`, never an ancestor of a dnd zone — see the drag-mirror note in
  ADR 0010. Adding a control to a cell or header means adding a `BoardDialog` case, not an
  inline form.
- Styling is **Tailwind CSS v4** (ADR 0009). The palette and the repeated control classes
  (`.panel`, `.input`, `.btn` + `.btn-primary`/`.btn-quiet`/`.btn-icon`/`.btn-danger`/`.btn-danger-quiet`,
  `.field-label`, `.error`) live in `src/app.css`; everything else is utilities in the
  markup. Components have no `<style>` blocks — add utilities or extend `src/app.css`
  instead. The board's `grid-column`/`grid-row` inline styles stay inline: they are data
  from `board-view-model.ts`, not design. Icons come from `@lucide/svelte` (ADR 0012),
  imported one at a time (`@lucide/svelte/icons/pencil`) and sized with a `size-*` class —
  never typed in as Unicode glyphs, and never labelled themselves: the `aria-label` stays
  on the button. An icon-only button also takes
  `use:tooltip={'…'}` (`src/lib/actions/tooltip.ts`, ADR 0013) rather than `title`, whose
  ~1s delay the browser owns; the tooltip is a body-level popover so the board's `zoom`
  and `overflow` never touch it.
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

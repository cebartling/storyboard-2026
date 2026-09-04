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
| Collaboration demo (headed)      | `corepack pnpm demo` (Bun)                                                                 |
| Types                            | `corepack pnpm check`                                                                      |
| Lint / format                    | `corepack pnpm lint` / `corepack pnpm format`                                              |
| New migration                    | `corepack pnpm db:generate` (commit `drizzle/`)                                            |
| Inspect DB                       | `corepack pnpm db:studio`                                                                  |
| Seed sample data                 | `corepack pnpm db:seed <owner-email>` (account must exist)                                 |

Migrations apply automatically at db-module load, so `corepack pnpm dev` and the e2e server
self-migrate. E2e runs against a throwaway `e2e.db` and never touch `local.db`.

`db:seed` runs `scripts/seed.ts` (under **Bun** — see Runtimes below), which writes the
sample retail commerce map from `src/lib/seed/` to `DATABASE_URL`.
It appends a new map on every run rather than replacing one — nothing in the app depends on
the seed, so no test or fixture breaks if you delete it.

## Architecture constraints

- `src/lib/domain/` is **pure TypeScript**: no imports from `svelte`, `@sveltejs/kit`, or
  `drizzle`. All invariants live here, not only in the DB. Keep it that way — it is the
  reason the domain is testable without a database.
- Routes call `src/lib/app/` use cases, which call the ports in `src/lib/domain/ports.ts`.
  Routes do not talk to the repository directly.
- `src/lib/` never imports from `src/routes/`. `board-view-model.ts` lives in
  `src/lib/board/` for that reason: it is pure and DB-free, and `src/lib/canvas/`'s tests
  read it as well as the route does.
- Ordering uses **fractional ranks** (TEXT), never integer positions. The client never
  computes a rank — it sends neighbour ids and the server derives the rank. See ADR 0005.
- Drag-and-drop is isolated behind `src/lib/components/story-dnd-zone.svelte` so
  `svelte-dnd-action` can be swapped without touching the board.
- The board's pan/zoom canvas (ADR 0010) lives in `src/lib/canvas/`: `camera-math.ts` (pure
  math, no DOM types), `camera.svelte.ts` (the `Camera` rune object), `minimap-model.ts`
  (flattens board grid geometry for the minimap — takes a structural input type rather
  than the whole `BoardViewModel`), `camera-storage.ts` (the
  `localStorage` serialisation), and `camera-persistence.svelte.ts` (the effects that wire
  the two together — restore on arrival, debounced save, flush on the way out; read and
  written only inside `$effect`). Like `src/lib/domain/`,
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
  from `src/lib/board/board-view-model.ts`, not design. Icons come from `@lucide/svelte` (ADR 0012),
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

## Authentication and access (ADR 0016)

Every page except `/login` and `/register` requires an account; `src/hooks.server.ts`
redirects anonymous requests and populates `locals.user`. Maps have members
(`map_members`): the creator is the `owner`, who may delete and share; anyone they share
with is an `editor`, who may change the board but not delete or share it. A non-member gets
`null` from `load()` and a 404 from the route — the same answer as for a map that does not
exist, so ids cannot be probed for.

**Every `StoryMapRepository` method takes a `Caller` first**, and the adapters enforce
access, not the app layer. Both adapters are held to
`src/lib/app/story-map-repository-contract.ts`: put a new access rule there, or it is
enforced nowhere. `requireCaller(locals)` is the only place a `Caller` is constructed —
keep it that way, because it is what stops ADR 0015's presence identity from becoming the
auth identity.

`corepack pnpm db:seed <owner-email>` needs an account that already exists. Maps in an old
`local.db` have no members and are invisible until adopted; the SQL is in
`documentation/architecture.md`.

## Real-time collaboration (ADR 0015)

Stages 0 and 1 are both built. Read the ADR **and its amendments block** before touching the
write path or the stream — the amendments correct four things the code contradicted.

- Writes are serialised per map by `src/lib/app/keyed-lock.ts`, and every mutation carries
  the version its editor was _opened_ at. A stale editor gets a 409 that keeps what they
  typed and refreshes the board beneath them.
- `src/lib/server/collab/` is the fan-out: a per-map hub, and an SSE stream authorised
  through the same use case the page load uses. The notification is a sequence number, never
  a payload — clients react by calling `invalidateAll()`.
- **Every mutation must carry `clientId`.** The hub skips the tab that caused a change,
  because it has already refetched; without it the board re-renders twice per local edit and
  a drag loses its card mid-flight. `board-dialogs.svelte` sets it from the submit function,
  and the drag path sets it on the POST.
- `src/lib/collab/map-sync.svelte.ts` is the client. It suspends refetching while any drag
  is in progress (queued, not dropped), and reconnects itself rather than trusting the
  browser's own retry.
- An open dialog is told when its subject changes or is deleted underneath it
  (`src/lib/board/dialog-subject.ts`).

**Single process is a correctness requirement, not an incidental fact** — two instances
would each hold their own lock and their own hubs. Both `KeyedLock` and `MapHub` say so.

`demo/collab.ts` is a headed walkthrough of all of this — two windows side by side, each
captioning what it is doing — for showing someone the feature rather than testing it. Run it
with `corepack pnpm demo`. It lives outside `src/` because it is neither shipped nor tested,
it runs against its own `demo.db`, and it is deliberately outside both suites — vitest's
globs are `src/`-anchored and Playwright's `testMatch` is `**/*.e2e.{ts,js}`, so do not name
anything in `demo/` with an `.e2e.ts` suffix.

It keeps **its own copy** of the board helpers in `demo/board.ts`. That duplication is
deliberate: the e2e suite wants to be fast and assert hard, the demo wants to be legible and
pause where a person needs to look, and sharing one set meant a selector change made for the
suite silently broke the demo. Change markup and you change both — the suite is the one that
must not break, and it keeps its own helpers.

Testing collaboration: `collab.svelte.e2e.ts` drives two browser contexts through the auth
fixture's `newUser`. The one rule that keeps it from flaking is to wait for both boards to
report `data-collab-state="connected"` before mutating anything. Do not use
`context.setOffline` to simulate a drop — it leaves an open stream connected but blocks the
refetch, and SvelteKit answers a failed load with a full-page navigation; route-abort the
`**/events*` requests instead.

## Runtimes: Node for the app, Bun for the scripts

Two runtimes, on purpose, and the split is not arbitrary:

- **Node** runs the app, the dev server, the preview server, vitest and the Playwright e2e
  suite. Nothing about the product depends on Bun.
- **Bun** runs `demo/` and `scripts/seed.ts` — scripts, which Bun executes as TypeScript with
  no build step.

The line between them is `better-sqlite3`, a native addon that **segfaults Bun on
construction** (`require()` succeeds, `new Database()` crashes; the same code is fine under
Node). So anything holding a database connection in-process stays on Node — with one
exception: the seed script opens its own connection through `bun:sqlite`, which is why
`StoryMapRepository` and `Auth` take the driver-agnostic `AppDatabase` rather than
`BetterSQLite3Database`.

Two consequences worth knowing before changing any of this:

- **`save()` must not read an affected-row count.** The two drivers disagree there
  (`RunResult` against `void`), which is why the compare-and-set is a read-then-write and
  why it depends on `{ behavior: 'immediate' }` for correctness. See the comment on it.
- **The demo's preview server runs under Node**, spawned as a child process by
  `demo/harness.ts`. Only the driving script is Bun. Do not "simplify" that.

Connection pragmas live in `src/lib/server/db/pragmas.ts` so both drivers apply the same
ones; ADR 0015 Stage 0 made them load-bearing and two lists could drift.

## Not built (deliberately)

AI calls, and ADR 0015's Stage 2 (fine-grained effects), which stays deferred. The
`AiAssistant` port exists with a null implementation so AI plugs in without rework — its
contract style (domain snapshots in, structured suggestions out) is the commitment; its
method list is provisional.

# CLAUDE.md — experiment-2

Guidance for Claude Code when working in `experiments/experiment-2/`.

## What this is

A vertical-slice implementation of Jeff Patton's user story mapping technique, built to
test an architecture before committing the product to one. Cardboard (cardboardit.com) is
the reference implementation of the technique.

**This is `experiment-1` with its persistence replaced** — MongoDB instead of SQLite, at
full parity (ADR 0003). experiment-1 is still runnable and is the one to compare against;
where the two disagree about anything except storage, **this one is authoritative**, because
it is the later reading of the same decisions. Do not import from it or share code with it
(ADR 0001); the duplication is the accepted cost.

**Self-contained**: this directory has its own `package.json`, dependencies, and tests.
Run every command below from `experiments/experiment-2/`, not the repo root.

Read `documentation/` before changing anything structural — `glossary.md` for the Patton
vocabulary (note: we say **Step** where Patton says _user task_), `domain-model.md` for
entities and invariants, `architecture.md` for the layering, and `adr/` for why. ADR 0006
is the one that constrains most changes; ADR 0010 (canvas) and ADR 0011 (dialog editing)
constrain most board work, and ADR 0018 (Markdown descriptions) owns the app's only
`{@html}`.

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
| **Single story-detail e2e test** | `corepack pnpm playwright test -g "renders a story description as Markdown"`               |
| Collaboration demo (headed)      | `corepack pnpm demo`                                                                       |
| Types                            | `corepack pnpm check`                                                                      |
| Lint / format                    | `corepack pnpm lint` / `corepack pnpm format`                                              |
| Start / stop MongoDB             | `corepack pnpm db:up` / `corepack pnpm db:down`                                            |
| Wipe MongoDB                     | `corepack pnpm db:reset` (drops the volume, waits for PRIMARY)                             |
| Seed sample data                 | `corepack pnpm db:seed <owner-email>` (account must exist)                                 |
| Seed data **and** demo logins    | `corepack pnpm db:seed --with-accounts` (localhost only)                                   |

**`corepack pnpm db:up` first.** The dev server, the e2e suite and the demo all need the
Compose container. `test:unit` does not — it starts its own in-process replica set — and
neither does `build`, which is deliberate: `src/lib/server/db/index.ts` guards its
connection on `building`, because SvelteKit imports the whole server graph to analyse it and
an unguarded build both required a database and silently created one. If a command dies with "Could not reach MongoDB", that is what it is telling you.

There are no migrations. `src/lib/server/db/indexes.ts` runs at db-module load and
`createIndex` is idempotent, so `dev`, the e2e server and the demo all self-configure. Each
uses its own database — `storyboard`, `storyboard-e2e` and `storyboard-demo` — and the
latter two are dropped before every run.

`db:seed` runs `scripts/seed.ts`, which writes the sample retail commerce map from
`src/lib/seed/` to `MONGODB_DB`.
It appends a new map on every run rather than replacing one — nothing in the app depends on
the seed, so no test or fixture breaks if you delete it.

## Architecture constraints

- `src/lib/domain/` is **pure TypeScript**: no imports from `svelte`, `@sveltejs/kit`, or
  `mongodb`. All invariants live here, not only in the DB. Keep it that way — it is the
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
  inline form. Adding a case means three edits, all enforced by the compiler: the union
  member, the `TITLES` entry, and a `subjectStatus` case in `src/lib/board/dialog-subject.ts`.
- **Story descriptions are Markdown, rendered only in the `viewStory` dialog** (ADR 0018).
  `src/lib/markdown/render-markdown.ts` parses with `marked` and sanitises with DOMPurify
  against an explicit allowlist; it is the app's **only** `{@html}` and there is no CSP
  behind it, so treat it as security code. Two traps it already fell into:
  - **Do not touch DOMPurify at module scope.** SvelteKit imports the module graph to
    server-render, and in Node dompurify's default export is the factory, not a bound
    instance (`isSupported` false, `addHook` undefined). Setup is lazy for that reason;
    making it eager 500s the whole board route.
  - Its test is `render-markdown.svelte.test.ts` despite the source being plain `.ts`: the
    `.svelte.` infix routes a file to the browser Vitest project, and the node project has
    no jsdom for DOMPurify to use.
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

## Authentication and access (ADR 0015)

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
keep it that way, because it is what stops ADR 0014's presence identity from becoming the
auth identity.

`corepack pnpm db:seed <owner-email>` needs an account that already exists — register one in
the app first. Nothing invents an owner, because a fabricated membership row would point at
a user id nobody can log in as.

`corepack pnpm db:seed --with-accounts` is the exception, for a database with nothing in it
yet: it creates `owner@storyboard.test` plus three editors, all with the password
`storyboard-demo`, and shares the seeded map with them so the collaboration surface has more
than one person on it. Because that password is committed to this repository, the flag
refuses to run against anything but a database on localhost.

## Real-time collaboration (ADR 0014)

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
it runs against its own `storyboard-demo` database, dropped before every run, and it is
deliberately outside both suites — vitest's
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

## Runtime: Node, everywhere

One runtime for the app, the dev and preview servers, vitest, Playwright, `scripts/` and
`demo/`. The last two run through `tsx`.

**Do not try Bun.** It looks like it should work — they are scripts, and the MongoDB driver
is pure JavaScript, so `better-sqlite3`'s segfault (experiment-1's reason for the split) is
gone. It does not: `vite build` panics with `NAPI FATAL ERROR` at "rendering chunks" and
`vite dev` panics on the first request, because Vite 8.2.2 is rolldown-based and rolldown's
native binding crashes Bun 1.4.0 _on use_. The binding loads fine, so it reads like a bad
install rather than a hard incompatibility. ADR 0017 records the evidence.

Consequences worth knowing, all of them simplifications relative to experiment-1:

- **`pnpm check` is a single pass.** `tsconfig.bun.json` and the `bun-types` global
  declaration file are gone, and `scripts/` and `demo/` are in the app's TypeScript program
  — so they are typechecked more strictly than before, not less.
- **The demo harness spawns a plain Node preview server.** experiment-1's "the server must
  run under Node even though the demo runs under Bun" rule is gone with the split.

## Storage: MongoDB, one document per map (ADR 0003)

- **A whole map is one document.** Activities carry their steps; slices and stories are
  arrays beside them. `load()` is a `findOne`, `save()` a single `findOneAndUpdate`.
- **`_id` is the domain's UUIDv7 string, never an `ObjectId`.** Ids are minted in
  `src/lib/domain/ids.ts` and travel to the browser in URLs.
- **The read path must sort.** `inRankOrder` is applied in `toDomain`, and it is not
  optional: rank decides what renders where, a move changes a rank rather than an array
  position, and a document store hands arrays back as written. Without it every drag appears
  to do nothing. The port's contract test pins this.
- **Write `null`, not nothing.** MongoDB distinguishes a missing field from a null one, and
  `sliceId: null` is the unsliced band — the default for every new story.
- **The replica set is not optional.** Creating a map writes the map and its owner-membership
  row in a transaction, and transactions need a replica set even with one node. A standalone
  passes every test that does not create a map.
- **MongoDB 7 is pinned, and 8 does not work here.** Docker Desktop's kernel is past the
  cutoff MongoDB 8 refuses (SERVER-121912). `compose.yaml` lists everything already tried.
- **Three constraints are configuration now, not schema** (`src/lib/server/db/indexes.ts`):
  one owner per map, one account per email, and — in application code, since there are no
  foreign keys — the session cascade in `Auth.deleteUser`. The one-owner index is _partial_;
  a plain unique index on `mapId` would pass a one-owner test and silently make sharing
  impossible, which is why `indexes.test.ts` also asserts a second editor is allowed.
- **The compare-and-set is one conditional update** (ADR 0016). No transaction mode to depend
  on. A `null` result means stale _or_ gone, and one follow-up read tells them apart.

## Not built (deliberately)

AI calls, and ADR 0014's Stage 2 (fine-grained effects), which stays deferred. The
`AiAssistant` port exists with a null implementation so AI plugs in without rework — its
contract style (domain snapshots in, structured suggestions out) is the commitment; its
method list is provisional.

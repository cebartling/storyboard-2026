# experiment-2 — user story mapping, on MongoDB

A self-contained SvelteKit vertical slice of Jeff Patton's user story mapping technique,
built to test an architecture before the project commits to one.

It is [`experiment-1`](../experiment-1/) with its persistence replaced: MongoDB instead of
SQLite, at full parity. That experiment's ADR 0003 accepted SQLite with a stated expiry —
_"this decision would need revisiting before any multi-user or hosted use"_ — and multi-user
arrived. This is the revisit, and the question it answers is whether ADR 0006's two outbound
ports actually insulated the domain from persistence, or only appeared to.
[ADR 0003](./documentation/adr/0003-mongodb-one-document-per-map.md) records the answer.

You can create a map, build a backbone of **activities** and the **steps** beneath them,
add **story** cards under any step, drag cards to reorder them, and drag them onto release
**slice** bands. Order and slice membership are server-derived and survive a reload.

Nothing outside this directory is needed to build or run it, and nothing here is shared
with other experiments (ADR 0001).

## Running it

Everything runs through `corepack pnpm`, from this directory. The `packageManager` field in
`package.json` pins the pnpm version; a bare `pnpm` picks up whatever is on your PATH, and
versions before 10 reject this directory's `pnpm-workspace.yaml` outright.

A local Docker daemon is required — MongoDB runs in Compose, and the app, the e2e suite and
the demo all connect to it. (The unit and component tests do not: they start their own
in-process replica set.)

```sh
cp .env.example .env      # MONGODB_URI, MONGODB_DB
corepack pnpm install
corepack pnpm db:up       # waits until MongoDB is healthy and PRIMARY
corepack pnpm dev
```

There are no migrations. The indexes are created when the DB module loads and `createIndex`
is idempotent, so `dev`, the e2e server and the demo all work against an empty database with
no separate step.

| Task               | Command                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| Dev server         | `corepack pnpm dev`                                                     |
| Full suite         | `corepack pnpm test`                                                    |
| Unit + component   | `corepack pnpm test:unit -- --run`                                      |
| Single unit test   | `corepack pnpm vitest run src/lib/domain/story-map.test.ts -t "<name>"` |
| E2e                | `corepack pnpm test:e2e`                                                |
| Single e2e test    | `corepack pnpm playwright test -g "<name>"`                             |
| Types              | `corepack pnpm check`                                                   |
| Lint / format      | `corepack pnpm lint` / `corepack pnpm format`                           |
| Start / stop DB    | `corepack pnpm db:up` / `corepack pnpm db:down`                         |
| Wipe the DB        | `corepack pnpm db:reset` (drops the volume, starts fresh)               |
| Seed sample data   | `corepack pnpm db:seed <owner-email>`                                   |
| Collaboration demo | `corepack pnpm demo`                                                    |

`db:seed` writes a sample retail commerce story map — 12 activities, 43 steps, 3 release
slices and 157 stories, 51 KiB as a single document — into `MONGODB_DB`, and prints the URL
to open it at. It needs the email address of an account that already exists, because every
map has an owner and inventing one would create a login nobody knows the password to:
register in the app first. It adds a new map each time it runs; `corepack pnpm db:reset`
starts over.

## Reading it

Start with [`documentation/`](./documentation/) — [`glossary.md`](./documentation/glossary.md)
first, because this codebase says **Step** where Patton says _user task_, and the
narrative-order vs. priority-order distinction is the usual source of confusion. Then
[`domain-model.md`](./documentation/domain-model.md) for the entities and invariants, and
[`architecture.md`](./documentation/architecture.md) for the layering.

The decision record is in [`documentation/adr/`](./documentation/adr/). ADR 0006 answers
"would hexagonal architecture help here?" directly and is worth reading even if you skip
the rest.

[`CLAUDE.md`](./CLAUDE.md) carries the same commands plus the architectural constraints and
testing gotchas that changes to this directory need to respect.

## Stack

SvelteKit 2 with Svelte 5 in runes mode, MongoDB 7 (via the official driver, no ODM) run in
Docker Compose as a single-node replica set, Vitest for unit and component tests, Playwright
for e2e. Everything — app, scripts and demos — runs on Node
([ADR 0017](./documentation/adr/0017-node-everywhere.md) records why Bun cannot).
`svelte-dnd-action` handles dragging, isolated behind a single component so it can be
swapped.

# experiment-1 — user story mapping

A self-contained SvelteKit vertical slice of Jeff Patton's user story mapping technique,
built to test an architecture before the project commits to one.

You can create a map, build a backbone of **activities** and the **steps** beneath them,
add **story** cards under any step, drag cards to reorder them, and drag them onto release
**slice** bands. Order and slice membership are server-derived and survive a reload.

Nothing outside this directory is needed to build or run it, and nothing here is shared
with other experiments (ADR 0001).

## Running it

Everything runs through `corepack pnpm`, from this directory. The `packageManager` field in
`package.json` pins the pnpm version; a bare `pnpm` picks up whatever is on your PATH, and
versions before 10 reject this directory's `pnpm-workspace.yaml` outright.

```sh
cp .env.example .env      # DATABASE_URL=local.db
corepack pnpm install
corepack pnpm dev
```

Migrations apply automatically when the DB module loads, so there is no separate migrate
step — `dev` and the e2e server both self-migrate against a fresh `DATABASE_URL`.

| Task             | Command                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| Dev server       | `corepack pnpm dev`                                                     |
| Full suite       | `corepack pnpm test`                                                    |
| Unit + component | `corepack pnpm test:unit -- --run`                                      |
| Single unit test | `corepack pnpm vitest run src/lib/domain/story-map.test.ts -t "<name>"` |
| E2e              | `corepack pnpm test:e2e`                                                |
| Single e2e test  | `corepack pnpm playwright test -g "<name>"`                             |
| Types            | `corepack pnpm check`                                                   |
| Lint / format    | `corepack pnpm lint` / `corepack pnpm format`                           |
| New migration    | `corepack pnpm db:generate` (commit `drizzle/`)                         |
| Inspect DB       | `corepack pnpm db:studio`                                               |
| Seed sample data | `corepack pnpm db:seed`                                                 |

`db:seed` writes a sample retail commerce story map — 12 activities, 43 steps, 3 release
slices and 157 stories — into `DATABASE_URL`, and prints the URL to open it at. It adds a
new map each time it runs, and the app has no delete-map screen — to start over, delete the
`local.db` file or point `DATABASE_URL` at a fresh one.

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

SvelteKit 2 with Svelte 5 in runes mode, Drizzle ORM over SQLite (better-sqlite3), Vitest
for unit and component tests, Playwright for e2e. `svelte-dnd-action` handles dragging,
isolated behind a single component so it can be swapped.

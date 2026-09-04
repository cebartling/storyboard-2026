# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project intent

Storyboard 2026: user story mapping meets AI.

## Repository shape

The root of this repo builds nothing and runs nothing. There is no root package manifest,
no root test runner, no shared library — only `README.md`, `LICENSE`, `.gitignore`, and
this file.

All code lives in **self-contained experiments** under `experiments/`. Each has its own
package manifest, lockfile, toolchain, tests, and `documentation/`. Experiments never
import from each other and never depend on anything at the root (ADR 0001 in
`experiments/experiment-1/documentation/adr/`).

**Consequence for any code task: identify the experiment first, `cd` into it, and read its
own `CLAUDE.md` before doing anything.** Commands run from the experiment directory, not
from the repo root.

| Experiment | Stack | Subject |
| --- | --- | --- |
| `experiments/experiment-1/` | SvelteKit 2 + Svelte 5 (runes), Tailwind CSS 4, Drizzle + SQLite, Vitest, Playwright | Jeff Patton's user story mapping technique as a vertical slice, with accounts and shared maps |

## experiment-1 quick reference

Full command table, architecture constraints, and testing gotchas are in
`experiments/experiment-1/CLAUDE.md` — that file governs, this is only enough to get moving.

Run everything through `corepack pnpm` (the experiment pins `packageManager` in its
`package.json`; a bare `pnpm` uses whatever is on PATH, and pnpm < 10 refuses the
`pnpm-workspace.yaml` outright). From `experiments/experiment-1/`:

| Task | Command |
| --- | --- |
| Dev server | `corepack pnpm dev` |
| Full suite | `corepack pnpm test` |
| Unit + component | `corepack pnpm test:unit -- --run` |
| Single unit test | `corepack pnpm vitest run src/lib/domain/story-map.test.ts -t "<name>"` |
| E2e | `corepack pnpm test:e2e` |
| Single e2e test | `corepack pnpm playwright test -g "<name>"` |
| Types / lint / format | `corepack pnpm check` / `corepack pnpm lint` / `corepack pnpm format` |

Architecture in one line: a pure-TypeScript domain core (`src/lib/domain/`) with two
outbound ports, driven by SvelteKit form actions through use cases in `src/lib/app/`. The
domain imports nothing from Svelte, SvelteKit, or Drizzle, and that is the constraint most
worth preserving — it is why the domain is testable without a database. See that
experiment's `documentation/architecture.md`, and ADR 0006 for why the hexagonal layering
stops where it does.

The app requires an account (ADR 0016): every repository method takes a `Caller`, maps have
owners and editors, and both repository implementations are held to one shared contract
test. ADR 0015 is the collaboration design — its Stage 0 (version round-trip, per-map write
lock, WAL) is built; the SSE transport is not.

## Working agreements

- **New experiments get a new directory under `experiments/`**, self-contained per ADR
  0001. Do not introduce a root workspace, a shared package, or cross-experiment imports to
  avoid duplication — the duplication is the accepted cost of being able to delete or
  rewrite an experiment in isolation.
- **Record stack and architecture decisions as numbered ADRs** in that experiment's
  `documentation/adr/`, in the same change that introduces the decision.
- **Keep each experiment's `CLAUDE.md` current** with its real build, test, lint, and format
  commands — including how to run a single test, which is the command used most often.
- Promoting code out of an experiment into a shared product structure is a deliberate,
  visible change, not something that happens through shared imports.

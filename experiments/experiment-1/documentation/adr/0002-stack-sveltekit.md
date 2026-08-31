# 0002: Stack — SvelteKit + TypeScript, Node 24, pnpm, `sv` CLI

## Status

Accepted, 2026-08-31

## Context

The experiment needed a stack that supports server-rendered pages, form-based mutations,
and drag-and-drop UI, without pulling in a heavier framework than the vertical slice
warrants. The stack itself was a given handed down from planning, not re-litigated here;
this ADR exists to record the exact commands and versions so the scaffold is reproducible.

`npm create svelte` (the old scaffolding entry point) is dead — the current tool is the
`sv` CLI, v0.17.0 as verified on this machine at the time of scaffolding.

## Decision

SvelteKit + TypeScript, run on Node 24, package-managed with pnpm, scaffolded via:

```
pnpm dlx sv@latest create experiment-1 --template minimal --types ts \
  --add prettier eslint vitest="usages:unit,component" playwright \
        drizzle="database:sqlite+client:better-sqlite3" \
        sveltekit-adapter="adapter:node" \
  --install pnpm
```

Two verified gotchas at scaffold time: omit `docker:no` (it is a postgres/mysql-only flag
and hard-errors when paired with `database:sqlite`), and `vitest` needs an explicit
`usages:...` value or the CLI drops into an interactive prompt that breaks non-interactive
scaffolding.

Versions pinned by the scaffold and left as generated: svelte ^5.56, @sveltejs/kit ^2.63,
vite ^8, vitest ^4.1, drizzle-orm ^0.45, better-sqlite3 ^13, typescript ^6. Runes mode is
forced project-wide by the scaffold (`onclick` not `on:click`, callback props not
`createEventDispatcher`, snippets not slots).

## Consequences

This records the given rather than presenting alternatives — the choice of SvelteKit was
made in planning, not by this document. The main cost of the decision as executed is
version churn risk: pinning to whatever the scaffold generated (svelte ^5.56 etc.) means
this experiment is tied to a specific point-in-time snapshot of a fast-moving ecosystem,
and the `sv` CLI itself is young enough that its exact flags may change. The benefit is a
working, reproducible scaffold command recorded here so it doesn't need to be
re-discovered.

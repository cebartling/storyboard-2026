# 0003: SQLite via Drizzle, file-backed, migrations committed

## Status

Accepted, 2026-08-31

## Context

The experiment is single-user, no realtime, meant to be run locally (`pnpm dev`) and
exercised by a person or by Playwright. It needs real persistence to make drag-and-drop
reordering and slicing meaningful across reloads, but doesn't need a client-server
database, connection pooling, or concurrent-write handling.

`node:sqlite` exists in Node 24, but drizzle-orm 0.45's exports map ships no driver for
it (verified directly against the package at scaffold time) — so `better-sqlite3` is the
driver, not the newer built-in.

## Decision

SQLite, file-backed (`experiments/experiment-1/local.db` via `DATABASE_URL`, a separate
`e2e.db` for Playwright runs), accessed through Drizzle ORM with the `better-sqlite3`
driver. Schema changes go through `drizzle-kit`'s `db:generate` + `db:migrate`, with the
generated `./drizzle/` migration files committed to the repo — not `db:push`, which would
leave no reviewable migration history.

## Consequences

Zero-ops: no database server to run, install, or configure; the whole persistence layer is
a file plus a driver. The cost is no concurrency path — SQLite's single-writer model is
fine for one person clicking through a board locally, but this decision would need
revisiting (a real client-server database) before any multi-user or hosted use of this
experiment. Migrations being committed rather than pushed means schema evolution is
visible in git history and reviewable, at the small cost of an explicit generate step
whenever the schema changes.

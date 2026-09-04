# 0003: SQLite via Drizzle, file-backed, migrations committed

## Status

Accepted, 2026-08-31

## Context

The experiment is single-user, no realtime, meant to be run locally (`pnpm dev`) and
exercised by a person or by Playwright. It needs real persistence to make drag-and-drop
reordering and slicing meaningful across reloads, but doesn't need a client-server
database, connection pooling, or concurrent-write handling.

**Amendment, 2026-09-02** (finding A7 of `../review-2026-09-02.md`): the last item is no
longer true. The aggregate carries a `version` column and `save()` is a compare-and-set
against it, so a lost update is refused rather than silently applied — see
`documentation/domain-model.md`'s concurrency section. What SQLite still saves us is the
_infrastructure_ around that (no server, no pool), not the need for the rule itself.

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

## Amendment, 2026-09-04: the repository is no longer tied to one driver

This ADR names `better-sqlite3`, and the app still uses it. But `scripts/seed.ts` now runs
under Bun, where `better-sqlite3` — a native addon — **segfaults on connection**, so the
seed opens its own connection through `bun:sqlite` instead.

`StoryMapRepository` and `Auth` therefore take `AppDatabase`
(`src/lib/server/db/database.ts`), the base Drizzle SQLite type both drivers extend, rather
than `BetterSQLite3Database`. The choice of driver is now the composition root's, which is
where it belonged.

That cost one substantive change. The compare-and-set added under ADR 0015 Stage 0 read the
affected-row count of a conditional `UPDATE … WHERE version = ?` — and the affected-row
count is precisely what the two drivers disagree on (`RunResult` against `void`). It is now
a read-then-write inside the transaction, which is correct **only because the transaction is
`{ behavior: 'immediate' }`**: the write lock is held from `BEGIN`, so nothing can commit in
between. Under a deferred transaction the new form would be racy where the old one was not.
The concurrency tests that hold a lock from a worker thread are what check this, and they
passed unchanged through the rewrite.

The "no concurrency path" caveat above is also softer than when it was written: ADR 0015
Stage 0 added WAL and a busy timeout, and those pragmas now live in
`src/lib/server/db/pragmas.ts` so both drivers apply the same set.

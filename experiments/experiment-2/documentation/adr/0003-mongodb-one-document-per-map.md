# 0003: MongoDB 7 in Docker Compose, with one document per story map

## Status

Accepted, 2026-09-04. **Replaces experiment-1's ADR 0003** (SQLite via Drizzle), which
accepted its choice with a stated expiry: _"this decision would need revisiting (a real
client-server database) before any multi-user or hosted use."_ Multi-user arrived with that
experiment's ADR 0016 — [ADR 0015](./0015-accounts-sessions-and-map-membership.md) here.
This is the revisit.

## Context

experiment-1 stores a story map across five tables through Drizzle. It works. Two things
about it are worth stating precisely, because they are what this decision turns on.

**The aggregate and the storage disagreed.** [ADR 0004](./0004-single-aggregate.md) chose a
single whole-map aggregate, loaded and saved as a unit. The relational adapter then spent
397 lines taking that unit apart and putting it back together: `load()` was a five-query id
ladder (map → activities → steps → stories → slices), and `save()` deleted and reinserted
**every child row** — about 215 statements for the seed map. None of that work served a
query anyone made, because nothing ever read a step without its map.

**Its concurrency control leaned on a transaction mode.** The compare-and-set was a read of
`version` followed by a write, correct only because the transaction was
`{ behavior: 'immediate' }` and therefore took the write lock at `BEGIN`. That subtlety was
forced by Drizzle typing `bun:sqlite`'s `.run()` as `void`, so the adapter could not read
the affected-row count and had to arrange for the read-then-write not to interleave.

## Decision

**MongoDB, run locally through Docker Compose, with each story map stored as one document.**

`maps` holds the whole aggregate — activities with their steps embedded, slices, and a flat
`stories` array. `users`, `sessions` and `mapMembers` are separate collections.

`_id` is the domain's own UUIDv7 string, deliberately not an `ObjectId`: ids are minted in
`src/lib/domain/ids.ts`, are branded strings there, and travel to the browser in URLs.

**A single-node replica set, not a standalone.** Creating a map writes the map document and
its owner-membership row, and those two must land together or not at all — a map with no
members is unreachable through the UI and unfixable through it. Multi-document transactions
require a replica set even with one node. That is the only transaction the app needs, and
it is the whole reason `compose.yaml` runs `--replSet rs0` with a healthcheck that waits
for `PRIMARY`.

### MongoDB 7, pinned

**MongoDB 8 will not start on this machine.** Docker Desktop's Linux VM runs kernel
`7.0.12-linuxkit`, and MongoDB 8 hard-refuses any kernel `>= 6.19`
([SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912), a tcmalloc/glibc `rseq`
interaction). Verified as unavoidable rather than assumed: `mongo:8`, `mongo:8.0.29`,
`mongo:8.3.8` and `mongodb/mongodb-community-server:8.0-ubi9` all refuse, as does bypassing
that image's entrypoint to set the `GLIBC_TUNABLES=glibc.pthread.rseq=0` workaround its own
entrypoint implements. Nothing in this experiment needs a MongoDB 8 feature, so 7 is pinned
and the finding is recorded in `compose.yaml` so nobody spends the afternoon again.

## The result, measured

The experiment's question was whether [ADR 0006](./0006-hexagonal-lite.md)'s two outbound
ports really insulated the domain from persistence, or only appeared to. Comparing the two
experiments file by file across `src/lib/domain/`, `src/lib/app/`, `src/lib/board/`,
`src/lib/canvas/`, `src/lib/collab/`, `src/lib/components/`, `src/lib/seed/` and
`src/routes/`, and ignoring the ADR renumbering this experiment introduced:

**69 of 80 files are byte-identical.** The port itself did not change, and the 17-case
contract test passed against the new adapter before a single case was added to it.

Nine of the eleven differences are the port swap; the other two are test files a subsequent
self-review added, and they are marked as such rather than folded in — the number that
answers the question is the first one. `src/hooks.server.ts` is a twelfth changed file,
listed for completeness but outside the eight directories the count covers:

| File                                                                                                     | Change                                                                                           |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `routes/logout`, `routes/register`, `routes/maps/[mapId]` (and `src/hooks.server.ts`, outside the count) | One `await` each. `Auth` was synchronous only because better-sqlite3 is.                         |
| `domain/story-map.ts`                                                                                    | `inRankOrder` added — the read-path guarantee `ORDER BY rank` used to make.                      |
| `app/in-memory-story-map-repository.ts`                                                                  | Two behaviours corrected, both found by new contract cases.                                      |
| `app/story-map-repository-contract.ts` (+ its in-memory binding)                                         | Four cases added, all pinning drift that already existed.                                        |
| `routes/run-action.test.ts`                                                                              | A fixture error string, `SQLITE_IOERR` → a Mongo error.                                          |
| `canvas/camera-math.ts`                                                                                  | One word in a comment.                                                                           |
| `domain/story-map.test.ts` (self-review)                                                                 | A unit test for `inRankOrder`, which had none.                                                   |
| `app/use-cases.test.ts` (self-review)                                                                    | Seeded maps stored at a version a store can actually hold, and one SQLite-era comment corrected. |

**The seam held.** The domain's rank math, the move and slice semantics, every use case,
every component, the whole collaboration layer and every route body came across untouched.

**And it was not free of findings.** Four divergences surfaced, every one of them by running
the contract test against a third implementation rather than by reading the code:

1. **Rank order** (above) — the only one that was a live bug, and it was caught by the e2e
   suite, not by reasoning.
2. **Membership before version.** experiment-1's two implementations checked in opposite
   orders, so a stranger holding a stale copy was told to refresh a map they may not touch.
3. **`listSummaries` ordering**, which only one of them sorted.
4. **`save()` deciding "new or existing?" by looking for the map** rather than at the
   version, which let a stale tab silently resurrect a deleted map, owned by whoever still
   had it open.

None of these were caused by the move. All four had been sitting in experiment-1, passing
its whole suite. A contract test only prevents the drift it asks about, and these are what
it was not asking.

**The files that stayed byte-identical kept their SQLite-era comments**, which is the price
of the measurement meaning anything: editing them to say "MongoDB" would have made the count
a statement about how much prose was rewritten. So `ports.ts` still says the port keeps the
domain "free of Drizzle", `retail-commerce.ts` still says the seed script "writes it to
SQLite", and so on — inherited context, harmless to a reader who knows this is a port of
experiment-1.

One was not harmless and was corrected: `use-cases.test.ts` claimed "the unique indexes turn
a leaked duplicate into a 500", describing a backstop that no longer exists — rank
uniqueness is an invariant inside one document now, so the write lock and the
compare-and-set are the whole defence rather than the first of two. A stale comment is
noise; a stale comment asserting a protection is a trap.

## Consequences

**The adapter shrinks to the shape the aggregate always had.** `load()` is a `findOne`;
`save()` is a single `findOneAndUpdate`. The id ladder and the delete-and-reinsert are
gone, not optimised.

**A whole map must fit in one document.** MongoDB's limit is 16MB. The seed map — 12
activities, 43 steps, 3 slices, 157 stories — measures **51 KiB**, so the limit is about
320 times the largest map anyone has drawn here. That is headroom, not a guarantee: a map
that outgrew it would need the aggregate split, which is the same reshaping
[ADR 0004](./0004-single-aggregate.md) already flags as the cost of its boundary.

**Constraints that were free are now explicit, and some had to be rebuilt.** SQLite was
enforcing seven unique indexes plus a composite primary key, eight foreign keys and seven
cascades — counted from experiment-1's `drizzle/meta/0004_snapshot.json`, not estimated.
Most of that loss is genuinely fine: rank uniqueness within a scope became an invariant
_inside_ one document, which the domain already enforces, and five of the seven cascades
became "the sub-array is gone with the document". The rest had no such replacement:

1. **One owner per map** — a partial unique index on `{ mapId: 1 }` filtered to
   `role: 'owner'`. Nothing in `src/lib/domain/` knows `mapMembers` exists, so without this,
   "only the owner may delete or share" is a convention rather than a guarantee. Its
   partial-ness is load-bearing and separately tested: a plain unique index on `mapId` would
   pass a one-owner test while making sharing impossible.
2. **One account per email** — a unique index, the only thing closing the check-then-insert
   race in `Auth.register`.
3. **The two cascades on `users.id`** — `sessions.user_id` and `map_members.user_id`, both
   now `Auth.deleteUser`, in application code and in a transaction. There is no foreign key
   to do it. Losing the first would mean a deleted account keeps working until its cookie
   expires; losing the second is worse and less obvious, because a leftover **owner** row
   plus the partial one-owner index above blocks any future owner of that map forever, with
   no screen that can clear it.

   What `deleteUser` deliberately does not decide is what becomes of maps the account owned
   — deleting them destroys other members' work, and handing them on picks a new owner
   arbitrarily. Nothing in the app deletes an account yet, so that is left unanswered rather
   than answered badly, and must be answered before one does.

These live in `src/lib/server/db/indexes.ts`, created at startup, and replace experiment-1's
five committed migration files. Documents need no migration to add a field, so what is left
is exactly the set of constraints the database is being asked to enforce — a shorter and
more honest list than a schema.

**Reads must now sort.** Every SQLite read was an `ORDER BY rank`, and nothing else in the
app sorts by rank; a document store hands arrays back as written, and a move changes a rank
rather than a position. The repository applies `inRankOrder` on load, and the port's
contract test pins it. This was found by the e2e suite, not by reasoning — every drag
appeared to do nothing.

**Ranks still need no coordination.** [ADR 0005](./0005-fractional-ranks.md)'s fractional
ranks are unchanged; they were never a SQLite feature.

**A local Docker daemon is now a prerequisite** for `pnpm dev`, `pnpm test` and the demo —
where experiment-1 needed only a file. `pnpm db:up` waits for health, and the connection
error names the command. The test suite does not need the container: it starts its own
in-process replica set (`mongodb-memory-server`), so `pnpm test:unit` remains
self-contained.

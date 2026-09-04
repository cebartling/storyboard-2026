# 0016: Accounts, sessions and map membership — the port-signature change ADR 0006 priced

## Status

Accepted, 2026-09-03. **Extends [ADR 0015](./0015-collaboration-model.md)** — which put
authentication out of scope and, in §6, forbade its anonymous presence id from becoming the
thing auth is grafted onto — by supplying the identity §6 said was missing, and by
withdrawing the anonymous cookie it proposed, since a real account makes it redundant.
**Pays the deferred cost [ADR 0006](./0006-hexagonal-lite.md) records** (finding A10 of
`../review-2026-09-02.md`) in exactly the currency it named: a caller argument on the
repository port, an ownership table, and a change at every action. Neither ADR is
superseded.

## Context

"Multi-user" has been given two meanings in this experiment, and until now neither was
built. ADR 0015 designs concurrent _editing_ — several browsers on one map — and is careful
to say its per-session cookie "attributes a cursor to a browser session, nothing more". The
product also means the ordinary thing: people have accounts, own maps, and choose who else
may edit them. Without that, ADR 0015's presence layer would put real-looking names on
people who cannot be told apart from anyone who guessed a URL.

What the tree offered to build on was precisely nothing, and ADR 0006 said so:
`StoryMapRepository.listSummaries()` returned every map in the database, `load(id)` had no
caller, `App.Locals` was empty, `maps` had no owner column, and there was no
`hooks.server.ts`. Every one of the thirteen named actions on the board, and both on the map
list, would accept any request from any browser.

Two facts about the environment shape the smallest credible design. Node 24+'s `node:crypto`
has `scrypt`, `randomBytes`, `createHash` and `timingSafeEqual`, so the three packages the
`sv add lucia` add-on installs (`@oslojs/crypto`, `@oslojs/encoding`, `@node-rs/argon2`) buy
nothing the runtime does not already have. And persistence is one SQLite file (ADR 0003)
already doing a handful of queries per request; a sessions lookup is one more.

## Decision

**Email and password accounts, database-backed sessions in an HttpOnly cookie, a
`map_members` table with two roles, and a `Caller` as the first argument of every
`StoryMapRepository` method.** No auth library.

### 1. Credentials are email and password, hashed with scrypt

A magic link needs an email sender that does not exist here; a bare username is not
authentication. Passwords are hashed with `node:crypto`'s `scrypt` and stored as
`scrypt$<salt>$<hash>`, both base64url. OWASP lists scrypt beside argon2id as acceptable.
The algorithm prefix exists so that moving to argon2 later is a new prefix and a rehash on
next login, rather than a migration that invalidates every password at once.

The _shape_ of the `sv add lucia` template is adopted — hashed session token, fixed expiry,
a hook populating `locals.user` — and its packages are not. Lucia itself is a deprecated
library turned guide, and Auth.js solves OAuth-provider plumbing this experiment has no use
for.

### 2. Sessions live in the database, not in a signed token

`sessions(id, user_id, expires_at)`, where `id` is the SHA-256 of a 32-byte random token.
The raw token exists only in the cookie, so a leaked database hands over no live sessions.

The reason for a table rather than a signed cookie or a JWT is logout: `DELETE FROM
sessions` ends a session immediately, which a self-contained token cannot do without a
denylist that is itself a table — at which point the stateless version has bought nothing
and costs an extra concept. The price is one indexed lookup per request against a file that
is already open.

### 3. Access is membership, and membership has two roles

`map_members(map_id, user_id, role ∈ {owner, editor})`. The creator is inserted as `owner`
in the same transaction that inserts the map. Owners do everything; editors do every board
mutation but may not delete the map or share it; non-members cannot tell the map exists.

An `owner_id` column alone would have satisfied finding A10 and made ADR 0015 pointless —
nobody could ever be on the same map as anyone else. Public-by-link would have satisfied
"multi-user" without authorising anything. Two roles is the smallest table that makes
sharing mean something.

An unauthenticated visitor may reach `/login` and `/register` and nothing else;
`hooks.server.ts` redirects everything else. There is no public read path, and adding one
later means adding it there rather than remembering a check at each route.

### 4. The caller is a port argument, and the adapters enforce it

Every `StoryMapRepository` method takes `caller: Caller` first. `load` and `listSummaries`
return only what the caller belongs to, and report the caller's role; `save` refuses a
non-member and, for a map it has never seen, writes the owner row; `delete` and `addMember`
refuse an editor with `ForbiddenError`.

**Enforcement lives in the adapters**, because the adapters are what hold the membership
rows: one query answers "does this exist" and "may they" together, and a non-member simply
gets null. The alternative — checking in the use case — would need membership either as a
second outbound port or as a field on the aggregate, and `save()` deletes and reinserts
every child row of the aggregate on each write, so membership would be rewritten on every
drag and a share would 409 against a concurrent rename. A decorator would need the same rows
and add a layer ADR 0006 declined to build.

The honest cost of enforcing policy in two implementations is drift between them. It is paid
with one shared contract test, `src/lib/app/story-map-repository-contract.ts`, that both the
in-memory double and the Drizzle adapter must pass: a rule that is not in that file is
enforced nowhere, and a rule that is cannot exist in only one of them.

`load` returns null for a map that is not yours **exactly as** for one that does not exist,
and the route 404s. `ForbiddenError` is reserved for callers already entitled to know the
thing exists — an editor who tried to delete or share. Distinguishing "not found" from
"forbidden" for a non-member would make map ids enumerable.

### 5. No `UserRepository` port

Users and sessions are infrastructure with one implementation and one consumer (the auth
routes and the hook), already testable against a temp SQLite file. Under ADR 0006's own
test, a port here would be ceremony. They live in `src/lib/server/auth/` and never enter
`src/lib/domain/` or `src/lib/app/`, which see only a `Caller` — a value, not a service.

### 6. ADR 0015's anonymous id is withdrawn; presence becomes `{ userId, displayName, clientId }`

`users.display_name` is the "user-settable display name" §6 wanted, and a signed-in account
is the identity §6 said did not exist. Two tabs of one account are told apart by a
`clientId` the client mints per event-stream connection and sends as a query parameter.

Three mechanisms keep it from becoming authentication, which is what §6 asked for expressed
as types rather than discipline: it is never a cookie, so it never reaches `Locals`; it will
carry its own brand, so the type checker refuses it where a `UserId` is expected; and
`Caller` is constructed in exactly one place, `requireCaller(locals)`, from `locals.user`.

## Consequences

**What this buys.** A map is visible to the people on it and to nobody else. ADR 0015's
presence layer will have real names behind it. And the cost ADR 0006 deferred is paid, so
the codebase's claim that auth "changes the port signature, not a middleware layer" is now
demonstrated by a diff rather than asserted.

**What it costs.** Every use case gained a parameter and every test that calls one passes a
caller. Every e2e run registers an account before it can create a map. Existing rows in a
developer's `local.db` have no members and are invisible until adopted — the migration
deliberately does not invent an owner, and the one-line SQL is in `architecture.md`.
`pnpm db:seed` now takes the email address of an account that already exists.

Password reset, removing a member, and a read-only viewer role are not built. Each is a form
and a row, and none is needed to make sharing real.

**What would falsify it.** If the product needs SSO or OAuth, §1 is replaced by a library
and §2–§6 survive unchanged. If membership needs to be visible on the board often enough
that a second query per load hurts, §4's "load returns the role" becomes "the aggregate
carries its members", and the save path has to stop rewriting child rows first. If policy
drifts between the two adapters despite the contract test, enforcement moves into the app
layer and this ADR is amended rather than superseded.

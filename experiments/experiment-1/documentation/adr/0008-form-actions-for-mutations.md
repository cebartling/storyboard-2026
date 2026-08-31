# 0008: Named form actions for mutations; server-authoritative ranks

## Status

Accepted, 2026-08-31

## Context

Mutations in this app — adding an activity/step/story/slice, renaming things, and
moving/reordering/slicing a story via drag-and-drop — all originate from the single
SvelteKit UI. There is no external API consumer and none planned (see ADR 0006).
Drag-and-drop in particular needs a way to send a move to the server and get the
authoritative result back.

## Decision

All mutations go through SvelteKit named form actions (`?/addStory`, `?/moveStory`,
`?/addSlice`, etc.), not a hand-rolled REST or RPC API. Drag-and-drop posts `?/moveStory`
with the dropped-on neighbours (`beforeId`/`afterId`) and target scope
(`stepId`/`sliceId`) on `finalize`, then calls SvelteKit's `invalidate()` to rerun the
page's `load()` and refetch state. The server computes and writes the new rank (and slice
reassignment, if applicable) — see `documentation/architecture.md`'s `moveStory` trace —
and is the sole authority on what the rank actually is; the client never computes or
trusts a rank of its own.

## Consequences

Framework-native: no separate API layer to design, version, or document — every mutation
is a form action colocated with the route it belongs to, using SvelteKit's built-in
progressive-enhancement and CSRF handling. The cost is no external API surface: nothing
other than this SvelteKit app can currently create or modify a story map. That's
acceptable under ADR 0006's single-driver reasoning — if an external API is ever needed,
it would be added as a new inbound surface calling into the same `src/lib/app/` use cases,
not by exposing the form actions themselves.

Server-authoritative ranks mean a drag's visual result during the request round-trip is
provisional until `invalidate()` refetches the real state; there's no optimistic
rank-guessing on the client to keep in sync with the server's fractional-indexing scheme.

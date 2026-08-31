# 0007: `AiAssistant` port now, `NullAiAssistant` implementation, snapshot-in/suggestions-out

## Status

Accepted, 2026-08-31

## Context

The user asked for an AI seam to exist even though no AI feature is being built in this
experiment — the project's stated intent is "user story mapping meets AI," and the seam
needs to be in place before a real feature can be added without reshaping the domain
layer around it. But no real AI feature exists yet to design the port against, which means
any method signature written today (`suggestStoriesForStep(...)`, `summarizeSlice(...)`,
whatever) is a guess.

## Decision

Define an `AiAssistant` outbound port in `src/lib/domain/ports.ts`, implemented today only
by `NullAiAssistant` (a no-op/stub implementation with no external calls). The
**commitment being made here is the contract style, not the method list**:

- Inputs are domain snapshots (plain data derived from `StoryMap`/`Activity`/`Step`/
  `Story`), never free text and never a raw prompt string passed through from the caller.
- Outputs are structured suggestions (typed domain-shaped data the caller can apply or
  discard), never free-form text the UI has to parse or display verbatim.

The actual method list on `AiAssistant` today is provisional and expected to change once a
real AI feature is scoped — this ADR is not claiming the current shape is right, only that
whatever shape it takes will follow snapshot-in/structured-out.

## Consequences

Risk: the current method list is a guess and may be wrong-shaped for whatever AI feature
actually gets built first — that's accepted, not solved, by this decision. What is locked
in regardless of which methods change is the contract style, which exists to keep AI
integration from becoming "pass the user's raw text to a prompt and paste the response
back" — a pattern that would bypass the domain model's invariants entirely and couple the
UI to whatever a particular model happens to return. The `NullAiAssistant` implementation
means the rest of the app (use cases, routes) can be wired against the port today and
never need to change when a real implementation replaces the null one later — only
`deps.ts` changes.

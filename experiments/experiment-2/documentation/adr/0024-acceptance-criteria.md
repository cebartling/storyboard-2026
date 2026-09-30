# 0024: Acceptance criteria are ranked children of one story, and they gate `done`

## Status

Accepted, 2026-09-29

## Context

PIN-309 asks to "break out acceptance criteria so they are a domain concept onto
themselves", with one hard constraint: "must have a user story parent."

They already existed, but only as prose. ADR 0018 made a story's `description` Markdown
and allowed task-list checkboxes specifically so criteria could be written as
`- [x] …` under a `## Acceptance criteria` heading, and the seed blueprint carried them as
data purely to render that text. So nothing could count them, order them, or tick one
without editing a paragraph, and "is this story done?" could not be asked of the model at
all — only read by a human out of a rendered checklist.

The map already says three things about a story: where it sits in the narrative (activity →
step), when we intend to build it (its slice), and what must come first (ADR 0019's
dependencies). ADR 0021 added where the work has got to. None of them says what finished
would mean for this particular story, which is what a criterion is for.

Three things the ticket did not settle: whether a criterion is ordered, whether it carries a
met/unmet state of its own, and what its relationship to `Story.status` is.

## Decision

**A story owns an ordered list of acceptance criteria, each individually satisfiable, and a
story cannot be marked `done` while any of them is unmet.**

### The data

```ts
export interface AcceptanceCriterion {
	id: AcceptanceCriterionId;
	text: string;
	/** Fractional rank, scoped to the one story that owns it (ADR 0005). */
	rank: Rank;
	satisfied: boolean;
}

export interface Story {
	// …
	/** Never absent in the domain, for the same reason and at the same two
	 *  edges as `status`. Empty is the normal case. */
	criteria: AcceptanceCriterion[];
}
```

**Nested inside `Story`, not flat on the root beside `dependencies`.** The two are not
alike. An edge belongs to neither endpoint, which is why `dependencies` is flat and why
`story-map.ts` says so where it is declared; a criterion belongs to exactly one story. That
makes the parent the rank scope — `story.criteria.map((c) => c.rank)`, with no filter and no
scope to compose, where a story needs `storyRanksInScope(map, stepId, sliceId)` — and it
makes the ticket's constraint structural rather than a check. `Activity.steps` is the
precedent.

It is also the cheaper shape, measured rather than assumed. The three places that rebuild a
story — `editStory`, `moveStory` and `deleteSlice`'s re-ranking — all spread, so a nested
array survives them with **zero edits**. `inRankOrder` gaining one line is the entire cost.

Text is **plain**, not Markdown. See `### Rejected`.

### The rules

| Invariant                                         | Enforced by                                                                      | Error                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------- |
| Text is non-blank, and stored trimmed             | `requireName(text, 'Acceptance criterion')`                                      | `InvariantError` → 400 |
| The story exists, and so belongs to this map      | `findStory` — one lookup answers both, as `addStory` and `addDependency` rely on | `InvariantError` → 400 |
| The criterion belongs to **this** story           | `findCriterion(story, id)`, scoped to the story rather than searching the map    | `InvariantError` → 400 |
| A move's neighbour is a sibling in the same story | `requireInScope`, via `resolveRank`                                              | `InvariantError` → 400 |
| A move's neighbours still bracket a gap           | `assertNeighboursBracketAGap`, via `resolveRank`                                 | `ConflictError` → 409  |
| The editor is not stale                           | `loadOrThrow`                                                                    | `ConflictError` → 409  |

`satisfied` starts `false`. Removal throws on a missing criterion rather than being
idempotent, for the reason `removeDependency` gives: any removal bumps the version, so a
stale caller is refused before it runs.

`storyId` is threaded through every signature even though the criterion id alone would
locate it. That is the ticket's invariant made operational — an id borrowed from another
story is rejected, not quietly found.

### The gate on `done`

Criteria constrain exactly one status:

- Setting `done` while any criterion is unmet throws, with a message naming the tally
  (`2 of 3 acceptance criteria are unmet on "…"`).
- A `done` story that acquires an unmet criterion — by a tick being undone, or by a new
  criterion being added — drops to `in-review`. Refusing the write instead would make a
  `done` story the one story you cannot add a criterion to, which is backwards: noticing a
  missing criterion is exactly what happens while reviewing something called finished.
  `in-review` rather than `in-progress` because the work was claimed complete; what is
  outstanding is the checking.
- There is no move in the other direction. Satisfying the last criterion does not promote a
  story — a person does that, deliberately, and this gate is what stops them doing it early.
- A story with no criteria is unaffected. `done` is as freely settable as it was.

The other four statuses are untouched, so the field keeps **one** rule rather than becoming
derived for some stories and stored for others.

**The gate is a write-path invariant only, and `toDomain` must not enforce it.** A stored
document can legitimately hold `done` beside an unmet criterion: a criterion added by a
later build to a story already finished, or a hand-edited document. Refusing that on the
read path would make the map impossible to _load_ rather than impossible to _save_ — the
board would stop rendering entirely, which is ADR 0021's `STORY_STATUS_PRESENTATION` lesson
arriving from the other direction.

### Cascades

Deleting a story, step or activity takes its criteria, structurally — the three deletes
filter `map.stories`, and a nested array goes with the element. Deleting a **slice** keeps
them, and so does moving a story, because neither removes a story; `deleteSlice` un-slices.

ADR 0019 had to state its pruning asymmetry as a rule and guard it with a test, because a
flat edge list has no foreign key and nothing catches a missed filter. Here the same
asymmetry is a property of the shape. The tests exist anyway, beside 0019's, because the
shape could change.

### Persistence

`criteria?:` on the story document, optional because there are no migrations (ADR 0003),
with `satisfied?:` optional within it. `toDomain` maps rather than casts, and coerces with
`=== true`, not `?? false`: `??` answers only for a missing key, and a stored `'false'` —
what a hand-edited document leaves behind — is a truthy string. Passed through it would tick
a criterion nobody met, and through the gate above that is a story the board reports as
finished on evidence that does not exist.

`toDocument` names `criteria` explicitly even though the surrounding spread would carry it.
A spread is exempt from excess-property checks, so omitting the field would typecheck and
simply stop persisting criteria. The contract test is the only thing that catches that, and
it also covers the half ADR 0019's cannot: an edge has no rank, so
`round-trips a story’s acceptance criteria, in rank order` is the only contract case holding
a store to `inRankOrder` reaching a nested collection.

No index work. `indexes.ts` has no map-document indexes at all, for the reason its header
gives: rank uniqueness within a scope is an in-document invariant the domain enforces.

### The UI

Story detail dialog only, above the dependency section: criteria are about this story,
dependencies are about other ones.

The tick is a **submit button posting the negation of the stored value in a hidden field**,
not a bound checkbox. An unchecked checkbox posts nothing at all, so that shape cannot
express "untick this" — and the failure would be the quiet kind, where unticking appears to
work and changes nothing. `requireBoolean` refuses a missing value for the same reason
`requireStatus` refuses an unknown one.

Satisfied state is never signalled by colour alone (WCAG 1.4.1, ADR 0021's lesson for the
status chip): the box changes shape, the text is struck through, `aria-pressed` carries it
to assistive tech, and a tally counts it. The tally also speaks to a refused `done`, over the
same list counted the other way round: the dialog says how many criteria are met, the
server's refusal names how many are not.

Add and edit forms are collapsed until asked for, one at a time. `Modal` focuses the first
non-hidden input when it opens, so a list of live inputs would take focus off the
description the reader came for.

The dialog now has **two** writing sections, so focus restoration reads the submitted form's
action and picks between them — it previously called `dependencySection?.focus()`
unconditionally, which would have thrown the reader out of the criteria list after every
tick. The add form is the exception: like the add-story dialog, it stays open, clears and
takes focus back, because entering a story's criteria is a list-entry loop.

Reordering is up/down buttons, not drag. ADR 0010 keeps every dnd zone outside the modal's
subtree — a draggable list inside `<dialog>` would be new ground for no gain on a list this
short — and the client posts neighbour ids, never a rank (ADR 0005).

### Rejected

**Flat on the root, keyed by `storyId`.** Symmetrical with `stories` itself, but it needs a
`withoutCriteria` helper in three delete sites with nothing to catch a miss, an assertion on
every write path in place of the structural guarantee, and a regression test protecting an
_absence_ for `deleteSlice`. All of that to avoid one line in `inRankOrder`.

**Per-criterion Markdown, and a second `{@html}`.** ADR 0018's sink is the app's only one,
and that is the security property the file leans on: one place to audit, no CSP behind it,
and content written by whichever editor last touched the story. Doubling the sink for one
line of text is the worst available trade, and nothing the allowlist permits — headings,
tables, blockquotes, fenced code, nested task lists — belongs inside a checkbox row. If
inline formatting is ever genuinely wanted, the route is a `renderInlineMarkdown` with its
own block-free allowlist, and _that_ is the change that amends ADR 0018. Not
`renderMarkdown` in a second place.

**Deriving status from criteria entirely** — `todo`/`in-progress`/`done` from the tally. It
makes `backlog` and `in-review` unreachable for any story that has criteria, and turns one
field into a stored value for some stories and a computed one for others. Gating `done`
gets the property worth having (a story cannot claim to be finished on unmet criteria) for
one invariant instead of two rules.

**Auto-promotion to `done`** when the last criterion is ticked. Satisfying the criteria and
declaring the story finished are two different acts, and only the second is a person's
claim about the work.

**A card badge or an `n/m` progress chip.** The grid is read-only (ADR 0011) and already
carries a status chip and a dependency badge; a third signal per card is the point where
the board stops scanning. The view model carries the criteria, so a badge is additive.

**Any release-view change.** ADR 0023 stays as it is.

**Parsing existing `- [x]` lists out of descriptions as a migration.** There are no
migrations (ADR 0003), and there is no production data. The seed moved to the new field; any
criteria a person hand-wrote into a description remain valid Markdown and are simply prose
now.

**Uniqueness of criterion text, and a maximum count.** Two criteria worded the same are a
duplicate to notice, not a write to refuse, and a cap is a number nobody can justify.

**Criteria on a `Step`, or shared between stories.** Both contradict the ticket's one
constraint.

## Consequences

A story now has two ordered child collections at two nesting depths, and `inRankOrder` is
the only place that knows it. A third would be the point to ask whether the read-path sort
should be generic rather than a hand-written literal.

Ticking a criterion is an ordinary versioned write: it takes the per-map lock, advances the
version, and can be refused as stale. That is heavy for what looks like a checkbox, and it
is the price of the thing being shared — the same trade ADR 0021 made for status.

The detail dialog is now the densest view in the app: a description, a criteria list with
five controls per row, a dependency list, and a picker. It is the place to look first if the
dialog needs breaking up.

Descriptions lost their criteria section, so the renderer's task-list support no longer has
a corpus outside its own tests. That is accepted, not overlooked: ADR 0018 wanted the seed
to exercise the constructs it supports, and this removes one of them.

Moving the seed onto real criteria surfaced a contradiction the old shape could not express:
`See the homepage` was marked `done` with its Largest Contentful Paint criterion unticked.
Nothing could read a checkbox inside prose, so nothing could object. It is `in-review` now.
Applying seeded statuses _after_ the criteria, through `editStory`, puts the blueprint behind
this ADR's gate permanently.

Tested by the `acceptance criteria` cases in `story-map.test.ts` (including the gate, the
demotion, the absence of promotion, and the cascade asymmetry beside ADR 0019's), the four
entries added to `use-cases.test.ts`'s case table plus its two "leaves the other field
alone" tests, `requireBoolean` in `form-fields.test.ts`, the `acceptance criteria` cases in
`board-dialogs.svelte.spec.ts`, `board-view-model.test.ts`, the
`round-trips a story’s acceptance criteria, in rank order` contract test, the repository's
two "written before the field existed" cases, the seed's
`attaches the blueprint’s criteria to the story`, and the e2e
`story-acceptance-criteria.svelte.e2e.ts` — which covers the reload round trip, the board
version moving, unticking not being a silent no-op, focus landing in the criteria section,
and the gate refusing and then allowing `done`.

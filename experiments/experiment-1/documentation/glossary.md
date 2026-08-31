# Glossary

Jeff Patton's story-mapping vocabulary (_User Story Mapping_, O'Reilly 2014), mapped to
this codebase's names. Cardboard (cardboardit.com) is the reference implementation of the
technique this experiment is modeling.

| Patton's term   | This codebase                           | Notes                                                                       |
| --------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| Backbone        | `Activity` (top-level, `rank`-ordered)  | The row of big steps across the top of the wall.                            |
| User task       | **`Step`**                              | See "Why Step, not user task" below.                                        |
| Story           | `Story`                                 | Belongs to a `Step`, optionally to a `Slice`.                               |
| Release / slice | `Slice`                                 | A horizontal band; membership is a nullable FK on `Story`, not containment. |
| Narrative flow  | `Activity.rank`, `Step.rank`            | Left-to-right order across the backbone and within an activity.             |
| Priority order  | `Story.rank` within `(stepId, sliceId)` | Top-to-bottom order beneath each step.                                      |

## Why we say Step, not user task

Patton calls the second row of the backbone "user tasks." We call it `Step` throughout
the code, schema, and UI. Reason: "task" already has an established, different meaning in
dev tooling (issue trackers, TODOs, CI jobs, `Task` types in async code). Reusing it for a
story-mapping concept invites exactly the kind of ambiguity this glossary exists to
prevent — someone reading `Step` in code should never have to ask "is this a dev task or
a map task?" `Step` is used consistently: the entity, the table, the route, the
component names.

## Narrative order vs. priority order

These are the two independent axes of a story map, and confusing them is the most common
way a map degrades into a plain backlog.

- **Narrative order (horizontal)** — the sequence a user actually walks through the
  product: activities left to right along the backbone, steps left to right within an
  activity. This is `Activity.rank` and `Step.rank`. It answers "what happens first, what
  happens next."
- **Priority order (vertical)** — for a given step, which stories matter most, read top to
  bottom. This is `Story.rank`, scoped to `(stepId, sliceId)`. It answers "of the ways to
  do this step, which do we build first."

Dragging a card left/right changes narrative order (moving it under a different step, or
reordering steps/activities). Dragging a card up/down changes priority order within its
current step, and dragging it across a slice line changes priority order _and_ changes
which release it belongs to. These are handled as two different operations even though
both happen via drag-and-drop — see `documentation/domain-model.md` for the mechanics.

## Backbone and walking skeleton

- **Backbone** — the row of activities (and, beneath each, its steps) that forms the
  spine of the map: the shape of the user's journey independent of any specific release.
  In this codebase: all `Activity` rows for a `StoryMap`, each with its `Step` rows,
  ordered by `rank`.
- **Walking skeleton** — the thinnest possible slice through the whole backbone: one story
  per step, enough to exercise the entire flow end to end, even if every story is a rough
  placeholder. There is no dedicated entity for this — it is simply the first `Slice` (or
  the unsliced row) containing exactly one `Story` per `Step`. The term is worth keeping
  in this glossary because it is the thing a team builds first, and confusing it with "MVP"
  (a walking skeleton is rarely shippable) is a common failure mode.

## Slice / release

A `Slice` is a horizontal band across the map representing a release or milestone.
Slicing is _reassignment_, not containment: a `Story` keeps its `stepId` forever (it stays
under the step that produces it) and gets a `sliceId` that can be null (unsliced, still on
the backlog row) or set to a `Slice` belonging to the same map. Deleting a `Slice`
un-slices its stories rather than deleting them — this matches pulling a strip of tape off
a physical wall: the cards fall back to the unsliced row, they don't get thrown away.

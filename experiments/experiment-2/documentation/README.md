# Documentation index

Start here:

1. **[glossary.md](./glossary.md)** — Jeff Patton's story-mapping vocabulary mapped to
   this codebase's names. Read this first: it's short, and it prevents the most common
   source of confusion in this codebase (why "Step" and not "user task," and the
   narrative-order vs. priority-order distinction).
2. **[domain-model.md](./domain-model.md)** — the entities, their fields, the invariants,
   and worked examples of how a drag becomes a rank write (and how dragging across a
   slice line becomes a reassignment).
3. **[architecture.md](./architecture.md)** — the hexagonal-lite layer picture, the two
   outbound ports, the composition root, a `moveStory` request trace, and the test
   strategy.

Then the decision record:

- **[adr/](./adr/)** — the numbered ADRs (0001–0018) behind the choices above. 0006 is the
  direct written answer to "would hexagonal architecture be helpful here?" and is worth
  reading even if you skip the others. 0003, 0016, 0017 and 0018 are this experiment's own —
  MongoDB and the document model, the compare-and-set, why everything runs on Node, and
  Markdown story descriptions.

  The rest are carried over from `experiment-1` with their reasoning intact, because it was
  never about storage. Three moved number: its 0003 (SQLite) is replaced by this 0003, its
  0014 (collaboration is in scope) is superseded and not reproduced, and its 0015 and 0016
  are this 0014 and 0015.

Point-in-time reviews (snapshots, not living documents — read them for open questions, not
for how the code works today):

- **[review-2026-09-02.md](./review-2026-09-02.md)** — carried over from `experiment-1`:
  triage of an adversarial review at that experiment's commit `d0c77a0`. Its findings shaped
  code this experiment inherits, and several ADRs cite it by finding number. Two reproduced defects, and the open question of whether the single-aggregate
  save survives more than one editor.

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

- **[adr/](./adr/)** — the numbered ADRs (0001–0016) behind the choices above. 0006 is the
  direct written answer to "would hexagonal architecture be helpful here?" and is worth
  reading even if you skip the others. 0014 put collaboration in scope and is superseded by
  0015, the collaboration model; 0016 is accounts, sessions and map membership, and is the
  port-signature change 0006 priced in advance.

  [`experiment-2`](../../experiment-2/documentation/adr/) carries most of these forward with
  their reasoning intact, but renumbers from 0003 on — its 0003 is MongoDB, and this 0015 and
  0016 are its 0014 and 0015. Cite the experiment along with the number.

Point-in-time reviews (snapshots, not living documents — read them for open questions, not
for how the code works today):

- **[review-2026-09-02.md](./review-2026-09-02.md)** — triage of an adversarial review at
  commit `d0c77a0`. Two reproduced defects, and the open question of whether the single-aggregate
  save survives more than one editor.

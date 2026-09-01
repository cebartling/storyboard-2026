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

- **[adr/](./adr/)** — the numbered ADRs (0001–0013) behind the choices above. 0006 is the
  direct written answer to "would hexagonal architecture be helpful here?" and is worth
  reading even if you skip the others.

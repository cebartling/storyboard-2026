# 0001: Experiments are self-contained directories

## Status

Accepted, 2026-08-31

## Context

`storyboard-2026` is a seed repo with no committed architecture yet. We want to explore a
concrete implementation of Jeff Patton's story-mapping model without committing the whole
repo to a product architecture prematurely. Future experiments may want different stacks,
different frameworks, or to be thrown away entirely.

## Decision

Each experiment lives in its own top-level directory under `experiments/` (e.g.
`experiments/experiment-1/`) as a standalone, independently runnable application with its
own `package.json`, its own `documentation/`, and its own toolchain. Nothing is shared
between experiments at this stage — no shared library, no shared config.

## Consequences

Duplication across experiments if more than one is built (each gets its own lockfile,
config, and possibly its own copy of similar logic), in exchange for zero cross-experiment
coupling: an experiment can be deleted, rewritten, or diverge in stack choice without
touching any other experiment or the root of the repo. If a pattern proves out and the
project moves from experiment to product, promoting code out of an experiment directory is
a deliberate, visible step rather than something that happens by accident through shared
imports.

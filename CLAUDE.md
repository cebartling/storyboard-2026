# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

This repository is a seed. As of the initial commit it contains only `README.md`, `LICENSE`,
and `.gitignore` — no source, no package manifest, no build system, no tests.

Nothing below describes commands or architecture, because none exist yet. **Re-run `/init` once
the project is scaffolded** so this file can be regenerated against real build/test commands and
a real module layout.

## Project intent

Storyboard 2026: user story mapping meets AI.

## Known cleanup

`.gitignore` was seeded from an Adobe Flash / AIR / Flash Builder template (`*.swf`, `*.air`,
`*.ipa`, `*.apk`, `bin-debug/`, `.settings/`). It is unrelated to whatever stack this project
adopts — replace it wholesale during scaffolding rather than appending to it.

## Working agreements

- Choose the stack deliberately and record the decision here (with the build, test, lint, and
  format commands) as part of the same change that introduces it.
- Once a test runner exists, document how to run the full suite *and* a single test — that is the
  command used most often in this repo.

# Testing & Debugging

## Regression coverage

- Prevent regressions with automated tests whenever the behavior is deterministic enough to assert locally.
- Prefer unit tests for pure game logic and other stable rules: math, scoring, world generation invariants, AI planning, state transition helpers.
- For every bug fix, add or update a regression test that fails before the fix and passes after it.
- Do not rely on unit tests alone for client interaction regressions; add integration or end-to-end coverage when the risk is in UI flows, networking, or cross-system behavior.

## Debugging workflow

- When a bug is unclear or a fix doesn't work on the first pass, instrument the exact failing path before trying more speculative code changes.
- Prefer temporary localhost-focused logging at: client input layer, client action-flow layer, websocket send/receive layer, server receipt/validation layer — so you can see where execution stops.
- For client interaction bugs, inspect the full event sequence (`mousedown`, `mouseup`, `click`, drag state, suppression flags) before changing gameplay logic.
- For client/server action bugs, confirm whether the client actually sends the message and whether the server receives it before changing validation rules.
- Remove or narrow noisy debug logs after the issue is understood, but keep regression tests for the branch that failed.

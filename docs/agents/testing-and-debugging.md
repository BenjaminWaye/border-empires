# Testing & Debugging

## Regression coverage

- Prevent regressions with automated tests whenever the behavior is deterministic enough to assert locally.
- Prefer unit tests for pure game logic and other stable rules: math, scoring, world generation invariants, AI planning, state transition helpers.
- For every bug fix, add or update a regression test that fails before the fix and passes after it.
- Do not rely on unit tests alone for client interaction regressions; add integration or end-to-end coverage when the risk is in UI flows, networking, or cross-system behavior.
- For deploy-risky simulation, gateway, AI, snapshot, or economy changes, run a prod-shape gate before staging/prod promotion when practical:
  1. Clone the latest production snapshot into an isolated throwaway database, never mutate live production.
  2. Boot the candidate rewrite stack against that clone.
  3. Run `pnpm ops:prod-shape:gate` to authenticate, perform a frontier expansion, run a short frontier soak, and scrape gateway/simulation metrics.
  4. Compare against a baseline JSON captured from the previous production SHA on the same cloned snapshot when the change is performance-sensitive.

Example:

```bash
SOURCE_DATABASE_URL="$PROD_DATABASE_URL" \
TARGET_DATABASE_URL="$THROWAWAY_DATABASE_URL" \
  pnpm ops:prod-shape:clone-snapshot

WS_URL=ws://127.0.0.1:3101/ws \
GATEWAY_HEALTH_URL=http://127.0.0.1:3101/health \
GATEWAY_METRICS_URL=http://127.0.0.1:3101/metrics \
SIMULATION_METRICS_URL=http://127.0.0.1:50052/metrics \
PROD_SHAPE_OUTPUT_PATH=docs/load-results/prod-shape-candidate.json \
  pnpm ops:prod-shape:gate
```

## Debugging workflow

- When a bug is unclear or a fix doesn't work on the first pass, instrument the exact failing path before trying more speculative code changes.
- Prefer temporary localhost-focused logging at: client input layer, client action-flow layer, websocket send/receive layer, server receipt/validation layer — so you can see where execution stops.
- For client interaction bugs, inspect the full event sequence (`mousedown`, `mouseup`, `click`, drag state, suppression flags) before changing gameplay logic.
- For client/server action bugs, confirm whether the client actually sends the message and whether the server receives it before changing validation rules.
- Remove or narrow noisy debug logs after the issue is understood, but keep regression tests for the branch that failed.

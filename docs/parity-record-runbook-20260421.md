# Parity Recorder Runbook — 2026-04-21

## What was delivered

`scripts/rewrite-parity-record.mjs` is now committed to main. It is an
autonomous WebSocket client that drives a 60-step gameplay playbook against
a live game server and writes the resulting command trace to
`docs/parity-traces/real-YYYYMMDD.json`, compatible with the existing
`rewrite-parity-replay.mjs` harness.

`scripts/rewrite-parity-replay.mjs` was updated: `PARITY_RECORD=1` now
delegates to the recorder (the API surface promised in the handoff brief).

---

## DurableCommandType coverage

The playbook covers all 30 types defined in
`packages/client-protocol/src/index.ts`. The table below shows which are
"expected-success" (preconditions can be arranged by the recorder's own
actions) vs. "attempt-and-record-error" (need rare world state):

| Type | Phase | Expected outcome |
|---|---|---|
| COLLECT\_VISIBLE | 0, 3, 4 | ✅ ok |
| COLLECT\_TILE | 0, 3, 4 | ✅ ok (if resource tiles visible) |
| EXPAND | 1, 2, 4 | ✅ ok |
| SETTLE | 2, 4 | ✅ ok |
| CHOOSE\_DOMAIN | 3 | ✅ ok (first run only) |
| CHOOSE\_TECH | 3, 4 | ✅ ok |
| BUILD\_FORT | 4 | ✅ ok |
| CANCEL\_FORT\_BUILD | 4 | ✅ ok (immediately after build) |
| BUILD\_OBSERVATORY | 4 | ✅ ok |
| CANCEL\_STRUCTURE\_BUILD | 4 | ✅ ok |
| BUILD\_ECONOMIC\_STRUCTURE | 4 | ✅ ok (on resource tile) |
| BUILD\_SIEGE\_OUTPOST | 4 | ✅ ok |
| CANCEL\_SIEGE\_OUTPOST\_BUILD | 4 | ✅ ok |
| ATTACK | 5 | ✅ ok (if enemy tiles adjacent) |
| COLLECT\_SHARD | 3, 4 | ✅ ok (if shards present) |
| REVEAL\_EMPIRE | 4 | ✅ ok (if any enemy visible) |
| REVEAL\_EMPIRE\_STATS | 4 | ✅ ok (if any enemy visible) |
| REMOVE\_STRUCTURE | 4 | ✅ ok |
| SET\_CONVERTER\_STRUCTURE\_ENABLED | 4 | ✅ ok (if converter present) |
| UNCAPTURE\_TILE | 4 | ✅ ok (if captured tiles present) |
| CANCEL\_CAPTURE | 4 | ✅ ok (if capture in progress) |
| OVERLOAD\_SYNTHESIZER | 4 | ⚠ ok (if synthesizer present) |
| BREAKTHROUGH\_ATTACK | 4 | ⚠ needs SIEGE\_OUTPOST + enemy |
| CAST\_AETHER\_BRIDGE | 4 | ⚠ needs Aether tech |
| CAST\_AETHER\_WALL | 4 | ⚠ needs Aether tech |
| SIPHON\_TILE | 4 | ⚠ needs Siphon tech |
| PURGE\_SIPHON | 4 | ⚠ needs active siphon |
| AIRPORT\_BOMBARD | 4 | ⚠ needs AIRPORT structure |
| CREATE\_MOUNTAIN | 4 | ⚠ admin only — will ERROR |
| REMOVE\_MOUNTAIN | 4 | ⚠ no mountain visible — will ERROR |

ERRORs are valid for parity: both legacy and rewrite should return the same
error code. The parity replay treats `ERROR` as a terminal event and records
it. A `PARITY RED` result only fires if the two servers return *different*
responses.

---

## How to run (from your local machine)

### Step 1: Record a trace

Run the recorder against **staging** (recommended — avoids polluting prod):

```bash
cd ~/Sites/border-empires-container/border-empires

# Against staging legacy (or whatever server has the parity test player)
RECORD_WS_URL=wss://border-empires.fly.dev/ws \
PARITY_AUTH_TOKEN=__parity_harness_player__ \
node scripts/rewrite-parity-record.mjs

# Output: docs/parity-traces/real-20260421.json
```

Or using the `PARITY_RECORD=1` alias:

```bash
PARITY_RECORD=1 \
RECORD_WS_URL=wss://border-empires.fly.dev/ws \
node scripts/rewrite-parity-replay.mjs
```

The recorder will print a summary of commands recorded and types hit. Look
for `✅ Trace ready` at the end. If fewer than 50 commands are recorded it
exits with code 1 and prints a diagnostic.

**If the `__parity_harness_player__` account has no territory yet,** the
recorder will record many `COLLECT_VISIBLE` + ERRORs but almost no
EXPAND/SETTLE. In that case, either:
- Let the staging simulation run for a tick cycle first (AI will seed the
  parity player with a starting territory), OR
- Pass a token for an existing test player that already has territory.

### Step 2: Replay against staging gateway

```bash
LEGACY_WS_URL=wss://border-empires.fly.dev/ws \
REWRITE_WS_URL=wss://border-empires-gateway-staging.fly.dev/ws \
node scripts/rewrite-parity-replay.mjs docs/parity-traces/real-20260421.json
```

Expected output:
```
✅ PARITY GREEN — no differences found
   Legacy tiles:  42
   Rewrite tiles: 42
```

If you see `PARITY RED`, the output lists exact field diffs (tile ownership,
player resources, combat lock timestamps). Each diff pinpoints which command
caused divergence.

### Step 3: Commit the real trace

Once you have a green trace, commit it:

```bash
git add docs/parity-traces/real-20260421.json
git commit -m "test(parity): add real parity trace 2026-04-21 (N commands, green)"
```

---

## Recorder configuration

| Env var | Default | Notes |
|---|---|---|
| `RECORD_WS_URL` | `wss://border-empires.fly.dev/ws` | Server to record against |
| `PARITY_AUTH_TOKEN` | `__parity_harness_player__` | Player credential |
| `PARITY_TIMEOUT_MS` | `20000` | Per-command timeout |
| `RECORD_MIN_COMMANDS` | `50` | Minimum before writing file |

---

## Troubleshooting

**"Timed out waiting for INIT"** — The server is unreachable or the auth
token is not recognized. Check `wss://` URL and ensure the server is up.

**Only 0–5 commands recorded, all COLLECT\_VISIBLE** — The parity player
has no tiles yet. Let the simulation advance a tick to seed the player, or
use a player with existing territory.

**"No frontier action candidate"** — The player is completely surrounded;
all adjacent tiles are owned or water. Unlikely for `__parity_harness_player__`
on a fresh staging seed — if it happens, the world is fully settled and you
need to use a different player token or reset staging.

**PARITY RED on `world.seasonId`** — The two servers are seeded from
different snapshots. Ensure both point to the same world state before replay.

---

## Phase 6 gate relevance

The parity recorder is part of the Phase 6 cutover checklist (§11 of
`docs/rewrite-completion-plan-2026-04-19.md`). A green parity run on staging
is a prerequisite for promoting the rewrite gateway to production.

Expected Phase 6 milestone target: parity green on a ≥50-command trace
covering at least 15 distinct `DurableCommandType` values.

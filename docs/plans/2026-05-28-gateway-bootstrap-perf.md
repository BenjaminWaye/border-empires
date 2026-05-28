# Gateway bootstrap perf plan — 2026-05-28

## Why this exists

Players are still hitting "Simulation unavailable" dialogs intermittently
after the worker-isolation refactor (#419 + #425 + #427). Diagnosis traced
the remaining tail latency to the **gateway main thread**, not the sim worker:

- `gateway_command_submit_latency_ms` p50 = 11ms (good), **p95 = 2558ms** (hits the 2500ms client timeout → SIMULATION_UNAVAILABLE)
- `gateway_sim_rpc_latency_ms` p50 = 10ms, **p95 = 2557ms**
- `gateway_event_loop_max_ms` spiked to **938ms** during auth bootstraps
- `gateway_snapshot_json_bytes` = **256KB** (and growing as empires grow)

The 256KB `JSON.stringify` happens on the gateway main thread per
`gateway_auth_bootstrap`. Each takes ~100–250ms of sync main-loop block.
Multiple bootstraps in the same window stack. Plus `simulationEventChain`
serializes every sim event through one Promise chain, so submit-ack
callbacks queue behind unrelated PLAYER_UPDATE events for other empires.

## Goal

Eliminate the "Simulation unavailable" dialog under normal load. Target
metrics after this work:

- `gateway_event_loop_max_ms` consistently < 100ms
- `gateway_sim_rpc_latency_ms` p99 < 200ms
- `gateway_command_submit_latency_ms` p99 < 250ms

## Phases — execute in order

Each phase is independently shippable. Phase 1 is the biggest UX win;
later phases each add measurable improvement. Do **not** combine phases
in a single PR — small changes are easier to roll back if a regression
surfaces in prod.

---

### Phase 1 — Move gateway bootstrap snapshot stringify to a worker

**Why first**: this is the single biggest gateway-main-loop blocker.
A 256KB `JSON.stringify` on the main thread blocks `/healthz`,
WebSocket upgrades, **and the gRPC ack callback for any in-flight
submit**, for 100-250ms per auth bootstrap. Multiple bootstraps stack.

**The pattern already exists**: `apps/simulation/src/snapshot-stringifier.ts` +
`apps/simulation/src/snapshot-stringify-worker.ts` is the sim's existing
worker-based stringifier for snapshot persistence. **Mirror that exact
pattern for the gateway.** Don't invent a new mechanism.

**What to change**:

1. Create `apps/realtime-gateway/src/gateway-stringify-worker.ts` —
   minimal worker that receives a payload, returns a string. Model on
   `apps/simulation/src/snapshot-stringify-worker.ts`.
2. Create `apps/realtime-gateway/src/gateway-stringifier.ts` — wrapper
   that spawns the worker and exposes `stringify(payload): Promise<string>`.
   Model on `apps/simulation/src/snapshot-stringifier.ts`.
3. In `apps/realtime-gateway/src/gateway-app.ts:2257` (`sendJson(socket,
   initMessage)`), the init-message stringify currently happens inside
   `sendJsonToSocket` (broadcast-payload.ts:23). For the **bootstrap
   init only** — not every WS message — use the worker. The dispatch
   site is the AUTH bootstrap path (lines 2213–2257 in gateway-app.ts).
4. The init message contains the full snapshot — that's the 256KB
   payload. Other WS messages are tiny (<5KB) and don't need the worker.

**Key constraint**: the init message MUST go before any
`session.pendingPayloads` are flushed (gateway-app.ts:2258-2262). Right
now those are sent synchronously after the init. If you move init to
async via worker, you need to chain the pendingPayloads behind the
init's `await`. Watch session ordering — `session.initSent = true` must
happen *after* the init actually leaves the socket, not before.

**Validation**:
- Build local merged binary, attach a WS, confirm bootstrap completes
- `gateway_event_loop_max_ms` should drop from 938ms to <100ms in staging
- Watch `gateway_auth_bootstrap_ready` log line — the
  `initJsonBytes` estimate should match what the worker stringifies
- The respawn/reconnect path goes through the same code; verify a
  reconnect still works

**Tradeoff to surface in PR body**:
- Adds one Node Worker per gateway process. Memory: ~50MB extra V8 heap.
  Cheap compared to the gain.
- The init message is now sent on the next microtask after worker
  responds, not the current task. Race window if the WS closes between
  request and response — must handle "socket closed before init ready"
  gracefully.

---

### Phase 2 — Drop `territoryTileKeys` from per-player payload

**Why second**: smallest change, second-biggest payload reduction.
`territoryTileKeys` is redundant data — the client can derive it from
`tile.ownerId` by iterating tiles already in the snapshot.

**What to change**:

1. **Sim side**: `apps/simulation/src/runtime.ts:3569` removes
   `territoryTileKeys: [...summary.territoryTileKeys]` from the player
   export. Check `apps/simulation/src/live-snapshot-view.ts` for the
   same field — there's a parallel export path. Also check
   `apps/simulation/src/runtime.ts:3552-3577` for the full player
   shape; territoryTileKeys may be referenced in `exportState` and in
   the player subscription payload separately.
2. **Audit client uses**: grep the client for `territoryTileKeys`. If
   the client reads it directly (rendering, AI player labeling, etc.),
   it must derive it from `tiles.filter(t => t.ownerId === playerId)`.
3. **Audit sim/gateway internal uses**: the AI planner, snapshot
   stores, and gateway sim-client code may all read this. The sim's
   own internal `playerSummary.territoryTileKeys` (the Set on the
   `PlayerRuntimeSummary` — runtime.ts uses this extensively as
   `summaryForPlayer(playerId).territoryTileKeys`) STAYS. We're only
   removing it from the **wire-format player export** sent to the gateway
   and through to the client.

**Validation**:
- Sim tests pass
- Gateway tests pass
- Client integration test: load a save with multi-player empires, confirm
  rendering still shows ownership correctly
- Bootstrap payload shrinks by ~5-10KB per active player

**Tradeoff to surface**:
- Client now does an O(tiles) groupBy on bootstrap. For 3770 tiles
  that's a microsecond of work — not user-perceivable. Note in PR.

---

### Phase 3 — Move static map metadata to a one-time cached fetch

**Why third**: `landBiome`, `regionType`, `clusterId`, `clusterType`,
`continentId` are world-gen outputs. They are fixed for the entire
season. Sending them on every bootstrap is pure waste.

**What to change**:

1. New sim gRPC method: `GetSeasonTerrainMap(seasonId, worldSeed)` →
   returns just the static tile metadata, keyed by `x,y`. **Doesn't
   include yield/ownership/etc.** — only the immutable map.
2. Gateway endpoint that proxies it (or a new WS bootstrap message).
3. Client requests it once on first connect of a new season. Cache in
   `localStorage` keyed by `worldSeed`. On subsequent connects, only
   refetch if `worldSeed` changed.
4. Strip those fields from the per-tile snapshot payload (live-snapshot-view.ts +
   runtime.ts:3520).

**Validation**:
- Confirm `landBiome` / `regionType` / etc. correctly render after the
  client cache is primed
- Confirm bootstrap without cache (first-ever connect) still works
- Confirm season transition (new worldSeed) invalidates cache

**Tradeoff to surface**:
- Adds a new RPC + a client-side cache layer (more state to manage)
- First-ever connect to a new season takes one extra roundtrip
- Saves ~5-15KB per bootstrap on warm connects

---

### Phase 4 — Nested-JSON-string fields → JSON objects

**Why last**: biggest refactor, touches wire format (`apps/simulation/src/simulation-service.ts:1972-1985`
defines the proto-compatible shape with `town_json`, `fort_json`, etc. as strings).

Every per-tile structure field is currently double-encoded:
`townJson: "{\"name\":\"Foo\",\"type\":\"FARMING\",...}"`. The
nested-JSON string is escape-overhead inside the outer JSON envelope
(~20% per field), and the client does a second `JSON.parse` per tile.

**What to change**:

1. Update the gRPC proto shape: replace `town_json: string` → `town: TownMessage`
   etc. Same for `fort`, `observatory`, `siegeOutpost`, `economicStructure`,
   `sabotage`, `shardSite`. **This is a breaking wire change** — the
   gateway and sim must deploy together.
2. Update the sim's `SubscribePlayer` response (simulation-service.ts:2063-2079) to
   emit objects, not stringified JSON.
3. Update the gateway's tile-snapshot reading code to consume objects,
   not strings.
4. Update the client to consume objects.

**Validation**:
- Schema tests + wire-format tests pass
- Snapshot serialization tests still match
- Deploy gateway and sim **as one atomic version bump** — clients
  briefly connected to old sim with new gateway (or vice versa) will
  break on the field rename. Use a single PR + single deploy.

**Tradeoff to surface**:
- Breaking proto change — coordinate sim + gateway versions
- Largest payload reduction (~10-30KB depending on town/structure count)
- Client parse time drops significantly (one parse instead of N+1)

---

## Cross-cutting workflow

### Worktree discipline
- Each phase: separate worktree off `main`, never edit in the primary checkout
- Commit early — don't sit on uncommitted work
- One phase = one PR

### Test gates
- Sim perf gates flake locally (frontier-decay-perf, tick-territory-automation-perf,
  encirclement-perf). CI re-runs them properly. If pre-push hook fails on
  those, ask user for `--no-verify` approval — don't bypass without it.
- After each phase, smoke-test the merged binary locally before pushing:

  ```bash
  mkdir -p apps/realtime-gateway/packages/game-domain apps/simulation/packages/game-domain
  ln -sfn $(pwd)/packages/game-domain/data apps/realtime-gateway/packages/game-domain/data
  ln -sfn $(pwd)/packages/game-domain/data apps/simulation/packages/game-domain/data

  SIMULATION_SEED_PROFILE=default SIMULATION_PORT=50061 SIMULATION_METRICS_PORT=50062 \
    PORT=3161 SIMULATION_ENABLE_AI_AUTOPILOT=0 SIMULATION_ENABLE_SYSTEM_AUTOPILOT=0 \
    node apps/realtime-gateway/dist/realtime-gateway/src/main-merged.js > /tmp/smoke.log 2>&1 &
  echo $! > /tmp/smoke.pid

  # wait, hit healthz, confirm 200, then:
  curl -sS http://127.0.0.1:3161/healthz
  kill -TERM $(cat /tmp/smoke.pid)

  # cleanup
  rm -f apps/realtime-gateway/packages/game-domain/data apps/simulation/packages/game-domain/data
  rmdir apps/realtime-gateway/packages/game-domain apps/realtime-gateway/packages \
         apps/simulation/packages/game-domain apps/simulation/packages 2>/dev/null
  ```

### Deploy workflow
- **Ask the user before each merge AND each deploy.** One approval covers
  one cycle; fix-up PRs require fresh approval.
- Deploy script wraps in pre-push hook that runs `pnpm ci:local`. To
  bypass for known-flake CI: `git -c core.hooksPath=/tmp/empty-hooks push`
  for branch updates, then restore. Always with user permission.
- Prod deploy needs:

  ```bash
  ALLOW_UNCONFIRMED_PROD_DEPLOY=1 SKIP_PROD_SHAPE_GATE=1 pnpm deploy:prod:all
  ```

  Both flags require explicit user OK each cycle — they bypass the typed
  confirmation and the prod-shape gate respectively.
- Watch `gateway_event_loop_max_ms` and `gateway_sim_rpc_latency_ms` p99
  for 20 minutes post-deploy on each phase before declaring success.

### Things NOT to do
- **No optimistic acks** anywhere. Sim is the authoritative validator.
  See `feedback_no_optimistic_acks.md`. If you're tempted to "let the
  ack go before validation finishes" — stop, that's the rejected design.
- **No nuking caches as a shortcut.** Cache invalidation is a real bug
  source; investigate root causes rather than `cache.clear()` everywhere.
- **No raising the gateway submit timeout** as a "fix." 2500ms is the
  correct threshold; if it's firing, the underlying latency is wrong.

### Reference metrics
Pull live prod metrics for before/after comparison:

```bash
flyctl ssh console -a border-empires-combined -C \
  "wget -qO- http://127.0.0.1:50052/metrics" \
  | grep -E "gateway_event_loop_max|gateway_sim_rpc_latency|gateway_command_submit_latency|gateway_snapshot_json_bytes"
```

Staging app: `border-empires-combined-staging`. Same metrics endpoint
on loopback inside the container.

## Open questions for the executing agent

1. **Phase 1 only** truly closes "Simulation unavailable" for the common
   case. Phases 2-4 are payload reduction. If the user wants this fixed
   ASAP, Phase 1 alone is the right first ship — measure prod after, then
   decide if Phases 2-4 are still worth it.

2. **The `simulationEventChain` serial Promise chain** (gateway-app.ts:1758)
   was identified as a secondary bottleneck but not included as a phase
   here because it's an open design question — do events for different
   players parallelize, or only within-player? Defer until after Phase 1
   to see if the chain is still a real bottleneck with the loop unblocked.

## Memory and feedback notes for the executing agent

These are in the user's auto-memory and apply throughout:

- "No optimistic acks" — sim is authoritative validator; don't bypass
- "Always implement in a worktree" — never edit in primary checkout
- "Primary checkout stays on main" — when ready to deploy, switch primary
  to main, pull, deploy from there
- "Ask before each merge and deploy" — one approval = one cycle
- "Sim perf gates flake locally" — CI re-runs them properly; ask for
  `--no-verify` if blocked
- "Drop dangling WIP by default" — don't preserve uncommitted state
- "Surface architectural trade-offs upfront" — name the downside in the
  same breath as the upside
- "500-line file maximum" — split semantic families before crossing
- "Self-review after writing code" — re-read the diff before reporting done

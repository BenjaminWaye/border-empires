# Phase B scale — 2026-05-30

> Agent hand-off. This plan is written to be followed **literally**. Each step gives the
> EXACT text to find and the EXACT text to replace it with. Do not improvise. Do not
> "improve" the surrounding code. If a FIND block does not match the file exactly, STOP
> and ask the user — do not guess.

---

## 0. Background (read once, then start)

Phase 1 was **PR #422** — the concurrent load harness (`scripts/rewrite-concurrent-load.mjs`).
It opens N WebSocket clients, ramps concurrency, and writes a `cliffLevel` to
`docs/load-results/concurrent-<date>.json`. Phase 1 produced a measurement tool, not a fix.

**Phase B is two small, safe PRs that stop the reconnect cascade** that took prod down:
one player in a reconnect loop fired 4 full-snapshot bootstraps in ~2 minutes and pushed
the gateway event loop to 48s of delay. There is currently **no limit** on how many
bootstraps run at once or how fast one player can re-bootstrap. Phase B adds those limits.

Things that are NOT in Phase B (they need a senior agent — see section 4):
- A reconnect snapshot cache (the snapshot is deleted on disconnect; not mechanical).
- Collapsing the two `subscribePlayer` gRPC calls per auth into one.
- Nested-JSON-string → object proto change.
- Splitting the gateway and sim into separate machines.

### First, get your baseline number

Before changing any code, run the Phase 1 harness against the local stack and record the
`cliffLevel`. You will re-run it after each PR to see if the number moved.

```bash
CONCURRENCY_LEVELS="5,10,20,30,40,50" LEVEL_DURATION_MS=60000 \
  node scripts/rewrite-concurrent-load.mjs
cat docs/load-results/concurrent-*.json | tail -1   # note the cliffLevel
```

### Rules that apply to every step

- Work in a git worktree off `main`. Never edit the primary checkout.
- One PR = one branch. Do B1, get it merged, THEN start B2.
- Ask the user before each merge and before each deploy.
- After editing, run the validation commands in that PR's section. All must pass.
- If a pre-push hook fails on a known-flaky sim perf gate, ask the user before using
  `--no-verify`. Never bypass without permission.

---

## PR B1 — Gateway: bootstrap admission control

**File touched:** `apps/realtime-gateway/src/gateway-app.ts` (this one file only).
**No sim changes. No proto changes. No client changes.**
**What it does:** rejects a bootstrap with `SERVER_BUSY` when (a) too many bootstraps are
already running, or (b) the same player bootstrapped too recently. This is purely additive —
the normal path is unchanged.

### Step B1.1 — Add the admission-control state

**FIND** this exact line (it appears once, near line 470):

```ts
  const gatewayBootstrapStringifier = createGatewayStringifier();
```

**REPLACE** with:

```ts
  const gatewayBootstrapStringifier = createGatewayStringifier();
  // Phase B bootstrap admission control. Caps concurrent full-snapshot
  // bootstraps and throttles per-player re-bootstrap so a reconnect loop
  // cannot stall the event loop. Purely additive — the happy path is unchanged.
  let bootstrapsInFlight = 0;
  const maxConcurrentBootstraps = Math.max(1, Number(process.env.GATEWAY_MAX_CONCURRENT_BOOTSTRAPS ?? 4));
  const minBootstrapIntervalMs = Math.max(0, Number(process.env.GATEWAY_MIN_BOOTSTRAP_INTERVAL_MS ?? 3000));
  const lastBootstrapAtByPlayerId = new Map<string, number>();
```

### Step B1.2 — Add the admission guard before the bootstrap gRPC call

**FIND** this exact block (it appears once, near line 2114):

```ts
            let bootstrapInitialState;
            authTrace.startStep("bootstrap_subscribe");
            try {
```

**REPLACE** with:

```ts
            const bootstrapNowMs = Date.now();
            const lastBootstrapAtMs = lastBootstrapAtByPlayerId.get(playerIdentity.playerId) ?? 0;
            const overConcurrency = bootstrapsInFlight >= maxConcurrentBootstraps;
            const overRate = bootstrapNowMs - lastBootstrapAtMs < minBootstrapIntervalMs;
            if (overConcurrency || overRate) {
              recordGatewayEvent("warn", "gateway_bootstrap_admission_rejected", {
                playerId: playerIdentity.playerId,
                channel,
                reason: overConcurrency ? "concurrency" : "rate",
                bootstrapsInFlight,
                maxConcurrentBootstraps
              });
              sendJson(socket, {
                type: "ERROR",
                code: "SERVER_BUSY",
                retryAfterMs: 4000 + Math.floor(Math.random() * 4000),
                message: "Server is busy. Retry shortly."
              });
              authTrace.complete("rejected", "bootstrap_admission");
              return;
            }
            if (lastBootstrapAtByPlayerId.size > 5000) lastBootstrapAtByPlayerId.clear();
            lastBootstrapAtByPlayerId.set(playerIdentity.playerId, bootstrapNowMs);
            bootstrapsInFlight += 1;
            let bootstrapInitialState;
            authTrace.startStep("bootstrap_subscribe");
            try {
```

### Step B1.3 — Decrement the counter no matter how the block exits

**FIND** this exact block (it appears once, the end of the bootstrap `catch`, near line 2155):

```ts
              authTrace.endStep("bootstrap_subscribe", false);
              authTrace.complete("rejected", "bootstrap_failed");
              return;
            }
            playerSubscriptions.attachSocket(playerIdentity.playerId, socket);
```

**REPLACE** with:

```ts
              authTrace.endStep("bootstrap_subscribe", false);
              authTrace.complete("rejected", "bootstrap_failed");
              return;
            } finally {
              bootstrapsInFlight -= 1;
            }
            playerSubscriptions.attachSocket(playerIdentity.playerId, socket);
```

> Why a `finally`: the `try` block can exit by finishing normally OR by the `return` inside
> the `catch`. `finally` runs in both cases, so `bootstrapsInFlight` always goes back down.
> Do NOT decrement anywhere else — that would double-count.

### Step B1.4 — Validate

```bash
pnpm --filter @border-empires/realtime-gateway typecheck
pnpm --filter @border-empires/realtime-gateway test
```

Then build the merged binary and confirm it starts:

```bash
mkdir -p apps/realtime-gateway/packages/game-domain apps/simulation/packages/game-domain
ln -sfn $(pwd)/packages/game-domain/data apps/realtime-gateway/packages/game-domain/data
ln -sfn $(pwd)/packages/game-domain/data apps/simulation/packages/game-domain/data
pnpm build:merged
SIMULATION_SEED_PROFILE=default SIMULATION_PORT=50061 SIMULATION_METRICS_PORT=50062 \
  PORT=3161 SIMULATION_ENABLE_AI_AUTOPILOT=0 SIMULATION_ENABLE_SYSTEM_AUTOPILOT=0 \
  node apps/realtime-gateway/dist/realtime-gateway/src/main-merged.js > /tmp/smoke.log 2>&1 &
echo $! > /tmp/smoke.pid
sleep 8
curl -sS http://127.0.0.1:3161/healthz   # expect HTTP 200 / {"status":"ok"}
kill -TERM $(cat /tmp/smoke.pid)
rm -f apps/realtime-gateway/packages/game-domain/data apps/simulation/packages/game-domain/data
rmdir apps/realtime-gateway/packages/game-domain apps/realtime-gateway/packages \
       apps/simulation/packages/game-domain apps/simulation/packages 2>/dev/null
```

### Step B1.5 — Self-review checklist (all must be true)

- [ ] You changed exactly one file: `apps/realtime-gateway/src/gateway-app.ts`.
- [ ] `bootstrapsInFlight += 1` happens exactly once (in B1.2) and `-= 1` happens exactly
      once (in B1.3, inside `finally`). Search the file: `grep -n "bootstrapsInFlight" apps/realtime-gateway/src/gateway-app.ts` should show exactly 5 lines (1 declare, 1 in guard read, 1 in log, 1 increment, 1 decrement).
- [ ] The `SERVER_BUSY` response has exactly these keys: `type`, `code`, `retryAfterMs`, `message`.
- [ ] `pnpm --filter @border-empires/realtime-gateway test` passes.
- [ ] `/healthz` returned 200 in the smoke test.
- [ ] PR body states: "Adds global concurrent-bootstrap cap (default 4) and per-player
      re-bootstrap throttle (default 3s). Both env-tunable. No behavior change on the happy path."

### Step B1.6 — Deploy and verify (only after user approves merge + deploy)

After deploy, re-run the harness and confirm the cliff number is the same or higher
(B1 should not lower it). In prod logs, when you storm-reconnect, you should now see:

```bash
flyctl logs -a border-empires-combined | grep gateway_bootstrap_admission_rejected
```

---

## PR B2 — Client: respect `SERVER_BUSY`

**File touched:** `packages/client/src/client-network.ts` (this one file) plus the changelog.
**What it does:** routes the new `SERVER_BUSY` error into the client's EXISTING reconnect
backoff (it already does exponential backoff with jitter — you are not building new backoff,
just adding one error code to the existing path).

> Do B2 only after B1 is merged and deployed (the client has nothing to react to until the
> gateway sends `SERVER_BUSY`).

### Step B2.1 — Add `SERVER_BUSY` to the auth-error handler

**FIND** this exact block (near line 2720):

```ts
      if (errorCode === "AUTH_FAIL" || errorCode === "NO_AUTH" || errorCode === "AUTH_UNAVAILABLE" || errorCode === "SERVER_STARTING") {
        state.authSessionReady = false;
        if ((errorCode === "AUTH_UNAVAILABLE" || errorCode === "SERVER_STARTING") && firebaseAuth?.currentUser) {
```

**REPLACE** with:

```ts
      if (errorCode === "AUTH_FAIL" || errorCode === "NO_AUTH" || errorCode === "AUTH_UNAVAILABLE" || errorCode === "SERVER_STARTING" || errorCode === "SERVER_BUSY") {
        state.authSessionReady = false;
        if ((errorCode === "AUTH_UNAVAILABLE" || errorCode === "SERVER_STARTING" || errorCode === "SERVER_BUSY") && firebaseAuth?.currentUser) {
```

That is the whole code change. `SERVER_BUSY` now flows into `scheduleAuthReconnect`, which
already waits `2000 * 2 ** attempt` ms (capped at 16s) with 0.5–1.5× jitter. That spreads
reconnects out, which is exactly what prevents the cascade.

### Step B2.2 — Bump the client changelog (REQUIRED — a pre-push hook blocks otherwise)

Open `packages/client/src/client-changelog.ts`. Bump the version number at the top and add
a new entry at the top of the entries array, following the existing format. Example entry text:

```
"Client now treats a SERVER_BUSY auth error like SERVER_STARTING: it backs off and retries instead of hammering the gateway, so a busy server recovers faster."
```

### Step B2.3 — Validate

```bash
pnpm --filter @border-empires/client typecheck
pnpm --filter @border-empires/client test
```

### Step B2.4 — Self-review checklist

- [ ] You changed exactly two files: `client-network.ts` and `client-changelog.ts`.
- [ ] The two conditionals on lines ~2720 and ~2722 BOTH now include `|| errorCode === "SERVER_BUSY"`.
- [ ] You did NOT write any new `setTimeout`/backoff logic — you reused the existing path.
- [ ] `client-changelog.ts` version is bumped and an entry was added.
- [ ] `pnpm --filter @border-empires/client test` passes.

### Step B2.5 — Optional polish (skip unless asked)

The retry message for `SERVER_BUSY` currently reuses the AUTH_UNAVAILABLE wording. If the
user wants nicer copy, the `errorCode === "SERVER_STARTING" ? ... : ...` ternaries just below
the conditional can be extended — but that is cosmetic and not required for the fix.

---

## PR B3 — Sim: stop building the player snapshot twice per auth

> This is the real capacity win. B1/B2 only make failure graceful; B3 lowers the per-reconnect
> CPU cost so the cliff number moves up. It is bigger than B1/B2 and is **investigate-first**,
> not blind find-and-replace. Do B3 only after B1 and B2 are merged and deployed.
>
> **Do not skip the investigation phase. Do not start editing until Step B3.2's decision is made.**

### The problem (verified — these line numbers are real, confirm them before trusting them)

Every auth makes **two** `subscribePlayer` gRPC calls that each build a player snapshot:

1. `gateway-app.ts:2117` — `mode: "bootstrap-only"`. Used to build the init message.
2. `gateway-app.ts:2173` — `ensureSubscribed(...)` → live subscribe (config at `gateway-app.ts:827`,
   no `mode`, so it defaults to live). Registers for deltas AND returns a snapshot the gateway
   mostly ignores.

On the sim side, both land in the same builder:

- `simulation-service.ts:2008-2034` — the `SubscribePlayer` handler. The only difference between
  the two modes: bootstrap-only passes `includeWorldStatus: true`.
- `simulation-service.ts:1194-1232` — `buildAndCachePlayerSnapshotAsync`. `includeWorldStatus: true`
  forces a full-world `runtime.exportState()` (heavy); the live path uses the cheaper
  `exportVisibleStateForPlayerAsync(playerId)`. Both then cache the result via `setCachedSnapshot`
  at `simulation-service.ts:1218` (cache map: `snapshotCacheByPlayerId`, declared at line 1057).
- `simulation-service.ts:2012-2023` — concurrent subscribes for the same `(player, mode, visibility)`
  already share one in-flight build. **Sequential** reconnects (the 2-min loop incident) do NOT
  share — each rebuilds. That is the waste B3 targets.

**The waste:** the live-subscribe build at 2173 runs moments after the bootstrap-only build at 2117
already produced and cached a snapshot for the same player. The second build is largely redundant.

### Step B3.1 — Investigation (read-only, write findings in the PR description, change nothing)

Answer these four questions by reading the code. Write the answers in the PR description so the
reviewer can check your reasoning:

1. **What does the gateway actually use the live-subscribe return value for?** Read
   `gateway-app.ts:2169-2211`. Does `resolveInitialState` (line 2204) use the live snapshot, the
   bootstrap snapshot, or both? (It is passed `authoritativeSnapshot: bootstrapInitialState` and
   `cachedSnapshot: playerSubscriptions.snapshotForPlayer(...)`.) Conclusion you need: *is the
   live-subscribe snapshot's tile data ever read, or only the subscription registration?*

2. **Is the live build's snapshot equal to the bootstrap build's snapshot minus world status?**
   Compare the two branches in `buildAndCachePlayerSnapshotAsync` (line 1200 and 1207-1217). List
   every field that differs when `includeWorldStatus` is true vs false. (Expected: only
   `worldStatus`-related fields differ; tile data is the same. Confirm this.)

3. **How fresh is the cached snapshot?** Read `setCachedSnapshot` (line ~1075) and every reader of
   `snapshotCacheByPlayerId` (lines 1354, 1664, 1673, 1714, 2183). When is the cache invalidated /
   overwritten on a sim tick? You need to know how stale a cached snapshot can be between the
   bootstrap build and the live build (expected: same tick, sub-second).

4. **Does the live subscription need a fresh build to function, or just registration?** Read
   `subscriptionRegistry.subscribe` (called at `simulation-service.ts:2010`). If registration is
   independent of the snapshot build, the live path can return the cached snapshot without rebuilding.

### Step B3.2 — Pick the approach (decision gate — get user sign-off before implementing)

Based on B3.1, choose ONE. Put the choice and the reasoning in the PR description and **pause for
the user to confirm** before writing code.

- **Option A (preferred if B3.1 confirms tile data is equal and the cache is same-tick fresh):**
  Sim-side. In the `SubscribePlayer` live branch (`simulation-service.ts:2009+`), before calling
  `buildAndCachePlayerSnapshotAsync`, check `snapshotCacheByPlayerId.get(playerId)`. If a cached
  snapshot exists and is fresh (built on the current tick), still do the cheap
  `subscriptionRegistry.subscribe` registration but return the cached snapshot instead of rebuilding.
  - Smallest blast radius. The gateway is unchanged. The live subscription still registers for deltas;
    the client catches up via the normal delta stream.
  - Risk: if the cache can be stale across ticks, the client briefly sees a one-tick-old snapshot
    before the first delta. Quantify this from B3.1 Q3.

- **Option B (fallback if Option A's freshness guarantee does not hold):**
  Gateway-side. Make `ensureSubscribed` register the subscription without forcing a snapshot build,
  and reuse `bootstrapInitialState` for `resolveInitialState`. This touches the `player-subscriptions.ts`
  abstraction (the `subscribePlayer` callback at `gateway-app.ts:827`) and is more invasive.

- **NOT in scope for B3:** the capture-on-disconnect reconnect cache. That only helps the *first*
  (bootstrap-only) build and carries staleness risk. Revisit only if A and B together don't move the
  cliff number enough.

### Step B3.3 — Implement the chosen option

Write it in a worktree. Keep the change minimal — one mode branch, no refactor of the builder.
If `simulation-service.ts` would cross 500 lines, extract the new helper into a sibling file.

### Step B3.4 — Validate

```bash
pnpm --filter @border-empires/simulation typecheck
pnpm --filter @border-empires/simulation test
pnpm --filter @border-empires/realtime-gateway test
```

Then the merged-binary smoke test from Step B1.4, and a manual reconnect: connect a client,
drop it, reconnect within a few seconds, confirm the tile state and world status are correct
(no missing world-status banner, no stale ownership).

### Step B3.5 — Measure (this is the whole point)

Re-run the Phase 1 harness and compare `cliffLevel` to the baseline. B3 should raise it. Also pull
sim metrics before/after — the count of full snapshot builds per auth should drop from 2 to 1:

```bash
flyctl ssh console -a border-empires-combined -C \
  "wget -qO- http://127.0.0.1:50052/metrics" \
  | grep -E "sim_snapshot_build|gateway_event_loop_max"
```

### Step B3.6 — Self-review checklist

- [ ] PR description contains the four B3.1 investigation answers.
- [ ] PR description states which option (A or B) and why, and the user signed off before you coded.
- [ ] The live path still registers the subscription (deltas still flow) — you only skipped the rebuild.
- [ ] A reconnect manual test shows correct world status + ownership (no staleness regression).
- [ ] `cliffLevel` measured before and after, both in the PR body.
- [ ] No optimistic acks introduced (sim stays the authoritative validator).

---

## 4. Out of scope for Phase B entirely (future phases, do not attempt here)

1. **Nested-JSON-string → object proto change.** `town_json`…`shard_site_json`
   (`packages/sim-protocol/src/simulation.proto:77-83`) are double-encoded. Breaking wire change,
   atomic sim+gateway+client deploy. A separate phase.
2. **Gateway/sim split.** Separate Fly apps, sticky sessions, singleton sim. Multi-week.

---

## 5. Sequence summary

```
baseline harness run (record cliffLevel)
  → PR B1 (gateway admission control)      → merge → deploy → re-run harness
  → PR B2 (client SERVER_BUSY backoff)     → merge → deploy → re-run harness
  → PR B3 (sim: kill the redundant build)  → investigate → user sign-off → implement
                                           → merge → deploy → re-run harness
```

B1 + B2 stop the cascade (graceful failure). B3 raises the ceiling (real capacity). If after B3
the cliff is still under target, the out-of-scope items in section 4 are the next phase.

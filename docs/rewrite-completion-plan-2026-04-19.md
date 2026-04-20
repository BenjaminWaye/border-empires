# Rewrite Completion Plan (2026-04-19)

Companion docs:

- `docs/rewrite-hard-plan-2026-04-16.md` (architectural plan)
- `docs/rewrite-week-summary-2026-04-16.md` (honest status as of last week)
- `docs/rewrite-supabase-cutover-runbook.md` (current DB/deploy runbook for Supabase-backed rewrite storage)

> **Update (2026-04-20):** The original Fly Postgres provisioning/cost assumptions in this document are superseded by the Supabase bounded-storage runbook above.

This document replaces those as the single source of truth for what remains. It is written so that a fresh coding thread can execute it without asking the author what was meant.

---

## 1. Goals and non-goals

### Goals

1. Finish the split into `apps/realtime-gateway`, `apps/simulation`, `packages/game-domain`.
2. Cut the production client over to the new stack without interrupting the current beta testers.
3. Eliminate the class of regressions where acceptance and resolution disagree (Bug 2 class).
4. Eliminate the class of regressions where state does not survive a restart (Bug 1 class).
5. Fix the original problem: human frontier actions never share fate with AI, chunking, maintenance, snapshot IO, or any other background work.

### Non-goals

- We are not retaining snapshot files as the authoritative store. Postgres becomes source of truth; snapshot files become a recovery optimization only.
- We are not maintaining a dual-write compatibility shim between legacy and rewrite for gameplay data. A player session lives entirely on one backend or the other.
- We are not shipping new gameplay features during this plan. Any PR that adds player-visible gameplay changes is blocked until this plan closes.

### Definition of "ship it"

All of the following must be true, proven by automated tests in CI and a 30-minute soak against a production snapshot copy:

- `ACTION_ACCEPTED` p95 < 100 ms, p99 < 250 ms, max < 500 ms under 40 AI + chunking + persistence + 1 human frontier-spamming client.
- Gateway event-loop max < 50 ms during the same soak.
- Simulation event-loop max < 100 ms during human attacks in the same soak.
- Restart parity test suite green for every migrated command type.
- Acceptance/resolution contract test green (every accepted command produces exactly one terminal event, no silent failures).
- Preview/resolution consistency test green (ATTACK_PREVIEW p(win) matches empirical win rate from `rollFrontierCombat`).
- Legacy/rewrite parity test green across the feature-parity checklist in §8.
- `/healthz` on gateway and simulation both return full runtime provenance (source type, season id, world seed, snapshot label, fingerprint, player count, seeded tile count).

---

## 2. Current honest state (2026-04-19 inspection)

Findings from the tree, not from the handoff narrative:

- **The rewrite is not on `origin/main`.** `git ls-files apps/simulation/src/runtime.ts` is empty. The rewrite lives as a sibling commit `f69dfbf` (April 13) plus 45 untracked files and ~48 modified files in the working tree. `origin/main` has advanced 10 commits since the rewrite branched (`0d07fcc` → current HEAD).
- **Production is the legacy monolith.** Client `VITE_WS_URL` default is `wss://border-empires.fly.dev/ws`, which is the `border-empires` Fly app (`fly.server.toml`). `packages/server/src/main.ts` is still 10,224 lines and is still being modified.
- **The new apps cannot boot in production yet.** `fly.gateway.toml` and `fly.simulation.toml` do not set `DATABASE_URL`; both services throw on startup in production when it is missing (see `apps/{simulation,realtime-gateway}/src/runtime-env.ts`). In-memory fallback only works outside production.
- **The domain boundary is porous.** `packages/game-domain` is 247 lines. `apps/simulation/src/runtime.ts` is 4,285 lines of re-implementation, and both new apps import from `../../../packages/server/src/server-game-constants.js`, `server-worldgen-*`, `server-shared-types.js`, `town-names.js` in at least 15 places. `Dockerfile.gateway` and `Dockerfile.simulation` both `COPY packages/server` into the image.
- **AI isolation is partial.** `command-lane.ts` correctly routes AI-originated commands to the `ai` lane, protecting *ingress*, but AI *planning* still executes inside the simulation process. The plan requires a worker thread or sibling process.
- **Acceptance gates have not been run.** No harness results exist for the p95/p99/backlog numbers in §1.

Bug 1 (settled town and tiles vanish after restart) and Bug 2 (attack at 100% win chance neither captures nor charges manpower) are each diagnostic of a different unfinished acceptance area in this plan. They motivate the test architecture in §9.

---

## 3. Plan shape

Seven phases. Each phase is mergeable on its own, each lands behind a kill-switch flag that keeps production on the legacy monolith until Phase 6. Phases 1 and 2 can run in parallel with Phase 3. Phases 4, 5 are sequential. Phase 6 is the cutover. Phase 7 is deletion.

| Phase | Title | Prod risk | Mergeable behind flag |
|---|---|---|---|
| 0 | Land rewrite onto `main` behind a kill-switch | None | Yes |
| 1 | Clean the domain boundary | None | Yes |
| 2 | Postgres-authoritative persistence (staging) | None | Yes |
| 3 | AI and system jobs off the authoritative loop | None | Yes |
| 4 | Feature-parity sweep and test coverage | None | Yes |
| 5 | Observability and load-test gates | None | Yes |
| 6 | Beta cutover → full cutover | Controlled | No (this is the switch) |
| 7 | Delete legacy monolith | Low | N/A |

---

## 4. Phase 0 — Land the rewrite onto `main` behind a kill-switch

### Goal

Stop working out of a dirty checkout. Get the rewrite stack into `origin/main` so CI runs against it, so drift against main stops accumulating, and so the next threads are not manually reconstructing state.

### Deliverables

1. Rebase `f69dfbf` onto current `origin/main`, resolving conflicts against the 10 intervening commits (alliance UX, HQ summary, settlement capture fix, barbarian maintenance, opportunistic AI tuning, server runtime split).
2. Commit all 45 untracked rewrite files and ~48 modifications from the working tree (see `git status` listing in §2).
3. Add a client-side backend kill-switch:
   - `packages/client/src/client-app-runtime-env.ts`: prod default `VITE_WS_URL` stays `wss://border-empires.fly.dev/ws` (legacy).
   - New env var `VITE_GATEWAY_WS_URL` (undefined in prod today).
   - New URL param `?backend=gateway|legacy` and cookie `be-backend=gateway|legacy` that override the default.
   - State on the client: `state.activeBackend: "legacy" | "gateway"` exposed in the HUD debug badge.
4. CI matrix update (`.github/workflows/*` if present; otherwise add `scripts/ci-rewrite-test.sh`):
   - `pnpm --filter @border-empires/{shared,game-domain,client-protocol,sim-protocol,realtime-gateway,simulation} test`
   - `pnpm --filter @border-empires/client test`
   - `pnpm --filter @border-empires/server test` (legacy stays green until Phase 7)
   - `pnpm lint` across the workspace.
5. README update: how to run `pnpm dev` (rewrite) vs `pnpm dev:legacy`, and how to open the client against either backend.

### Tests to add in this phase

- `packages/client/src/client-backend-selector.test.ts`: URL param overrides cookie overrides env default; default in prod is legacy; default on localhost is rewrite.
- `packages/client/src/client-backend-selector.integration.test.ts`: toggling the cookie mid-session is surfaced in the HUD badge on next reconnect.

### Acceptance

- `git status` is clean on `main`.
- `git diff origin/main --stat` is zero after push.
- CI is green.
- Opening the prod client with no override still connects to legacy.
- Opening with `?backend=gateway` against a local gateway connects to the rewrite stack.

### Rollback

Revert the merge commit. Production default was never changed.

---

## 5. Phase 1 — Clean the domain boundary

### Goal

Make the simulation independent of `packages/server`. Prevent `apps/*` from reaching into `packages/server/*`.

### Deliverables

1. Move these modules out of `packages/server` into a new package `packages/game-domain` (absorbing what's already there):
   - `packages/server/src/server-game-constants.ts`
   - `packages/server/src/server-shared-types.ts`
   - `packages/server/src/server-worldgen-clusters.ts`
   - `packages/server/src/server-worldgen-docks.ts`
   - `packages/server/src/server-worldgen-shards.ts`
   - `packages/server/src/server-worldgen-terrain.ts`
   - `packages/server/src/server-worldgen-towns.ts`
   - `packages/server/src/town-names.ts`
   - `packages/shared/src/frontier-combat.ts` (make this the one true combat module)
2. Leave re-export shims in `packages/server/src/*.ts` for back-compat so the legacy monolith still builds. Shims import from `@border-empires/game-domain` and re-export.
3. Replace every `../../../packages/server/src/server-*` import in `apps/simulation/src/*` and `apps/realtime-gateway/src/*` with `@border-empires/game-domain`.
4. Add a lint rule that forbids cross-package relative imports:
   - `eslint-plugin-import` `no-restricted-paths`, or equivalent tsconfig project-reference check.
   - Pattern: `apps/**` may not import from `packages/server/**` by any path.
5. Remove `COPY packages/server` from `Dockerfile.gateway` and `Dockerfile.simulation`. If the build still needs it, that is a boundary violation that must be fixed before this phase closes.

### Tests to add

- `packages/game-domain/src/boundary.test.ts`: no import of anything under `packages/server/src/*` from the domain package (parse imports statically).
- CI job `scripts/check-no-cross-package-imports.sh`: `rg "../../../packages/server" apps/` returns zero matches.
- Preserve every existing server test: moving the files must not break `packages/server/test` suites.

### Acceptance

- `grep -r "packages/server" apps/simulation/src apps/realtime-gateway/src` returns nothing.
- `docker build -f Dockerfile.simulation .` succeeds without `packages/server` in the context.
- Legacy monolith (`pnpm dev:legacy`) still boots and plays end-to-end.

### Rollback

Revert the phase branch. Re-export shims mean the legacy server keeps working either way.

---

## 6. Phase 2 — Postgres-authoritative persistence

### Goal

DB is source of truth for commands, events, and snapshots in staging and prod. Snapshot files become a warm-start optimization only.

### Deliverables

1. Provision Postgres in Fly:
   - One shared `border-empires-postgres` cluster (staging + prod separate databases, separate roles).
   - Staging DB name `border_empires_staging`, prod DB name `border_empires_prod`.
   - Fly secrets: `DATABASE_URL` set on both `border-empires-gateway` and `border-empires-simulation` (and their staging siblings — see below).
2. Create staging Fly apps:
   - `border-empires-gateway-staging` (`fly.gateway.staging.toml`)
   - `border-empires-simulation-staging` (`fly.simulation.staging.toml`)
   - Same Dockerfiles, separate DATABASE_URLs, `NODE_ENV=staging`, different memory/CPU if needed.
3. Run migrations on both DBs:
   - `apps/realtime-gateway/sql/0001_command_store.sql`
   - `apps/simulation/sql/0001_world_events.sql`
   - `apps/simulation/sql/0002_command_store.sql`
   - `apps/simulation/sql/0003_world_snapshots.sql`
   - New: `apps/simulation/sql/0004_player_projection.sql` (player projection table from the plan)
   - New: `apps/simulation/sql/0005_tile_projection.sql`
   - New: `apps/simulation/sql/0006_combat_lock_projection.sql`
   - New: `apps/simulation/sql/0007_visibility_projection.sql`
4. Snapshot-on-checkpoint writes the full authoritative world state to `world_snapshots` AND the per-projection tables. Recovery path: latest snapshot → replay `world_events` from snapshot's event_id forward.
5. Add a one-shot importer (`scripts/rewrite-db-import-legacy-snapshot.ts`) that reads a legacy snapshot file and writes it as `world_snapshots` row + projections. This is how we bootstrap staging from prod data and is how we eventually seed prod on cutover day.
6. Remove `GATEWAY_ALLOW_SEED_FALLBACK=0` assumption; require DB in non-dev environments. Keep seed fallback available only when `NODE_ENV=development`.

### Tests to add

**Persistence integrity (Bug 1 class — see §9.1 for details):**

- `apps/simulation/src/restart-parity.integration.test.ts`: parameterized over every mutating command type. For each:
  1. Boot sim with in-memory + optional pg-test container.
  2. Apply the command, let it resolve.
  3. Capture `PlayerSubscriptionSnapshot` and `WorldStatusSnapshot`.
  4. Kill the sim, drop the in-memory state, restart from DB only.
  5. Assert snapshots byte-equal.
- `apps/simulation/src/snapshot-projection.test.ts`: world_events + projections are consistent after every resolved command.
- `apps/simulation/src/crash-recovery.test.ts`: kill the process mid-checkpoint write; restart; no command or event is lost (every durable command either has a `command_results` row or is retried).
- `apps/simulation/src/migration-idempotent.test.ts`: running all migrations twice is a no-op.

**Command and event store:**

- Expand `postgres-command-store.test.ts` and `postgres-event-store.test.ts` to cover:
  - Duplicate `commandId` is rejected with the same row (idempotent submit).
  - `(playerId, clientSeq)` uniqueness violation maps to a named error the gateway can handle.
  - Event stream `event_id` is strictly monotonic per world.
  - Snapshot `eventId` watermark advances monotonically.

### Acceptance

- Staging stack boots purely from Postgres (no snapshot file needed).
- A command submitted via staging gateway round-trips through `commands` → `world_events` → projections, then the same state is visible on a fresh sim boot with no snapshot file.
- `SIMULATION_DATABASE_URL` set and working on both staging apps; running `fly deploy` against staging passes health checks.

### Rollback

Staging is isolated; nothing to roll back in prod. Legacy monolith keeps running unchanged.

---

## 7. Phase 3 — AI and system jobs off the authoritative loop

### Goal

No AI or system planning work executes in the simulation event loop that hosts human command acceptance. This is the phase that actually fixes the original bug, not just relocates it.

### Deliverables

1. `apps/simulation/src/ai-planner-worker.ts` — new worker-thread entry point.
   - Receives `PlannerWorldView` (read-only subset) via `postMessage`.
   - Emits `CommandEnvelope`s back to the main thread, which submits them to the same command bus as humans.
   - Owns the AI autopilot tick (no more `setInterval` on the main thread).
2. `apps/simulation/src/system-job-worker.ts` — same pattern for barbarian maintenance, truce expiry, ability cooldown expiry, structure upkeep.
3. `apps/simulation/src/simulation-service.ts` main thread keeps only:
   - gRPC server
   - command bus (priority queue)
   - authoritative state mutation
   - event emission
   - snapshot/event persistence queue (already exists)
4. Backpressure rules, enforced and tested:
   - If `human_interactive` backlog is non-empty, AI worker is paused (`postMessage("pause")`).
   - If simulation event-loop max over the last 1s exceeds 75ms, system worker is paused.
   - Neither pause can starve humans; system and AI workers get explicit wake-up when human backlog drains.
5. Delete the legacy in-process AI planner orchestration from `runtime.ts`. If code is shared, extract it into `packages/game-domain/src/ai/*` first.

### Tests to add

- `apps/simulation/src/ai-isolation.load.test.ts` (slow, tagged): runs a seeded world with N=40 AI at full tick rate. Asserts:
  - simulation event-loop max < 100ms over 60s
  - `human_interactive` backlog age p99 < 250ms
  - Attack command p95 accept latency < 100ms
- `apps/simulation/src/ai-pause-resume.test.ts`: injecting a human command must pause AI within 50ms and resume after drain.
- `apps/simulation/src/system-job-worker.test.ts`: barbarian expiry runs to completion outside main thread; no long task blocks acceptance.

### Acceptance

- The load test above runs green in CI (nightly).
- `NODE_OPTIONS=--prof` CPU profile of the simulation process shows > 90% of main-thread time in command ingress/acceptance/event emission; < 10% in AI or planning.

### Rollback

Feature-flag `SIMULATION_AI_WORKER=0` keeps AI inline for a week while we watch staging.

---

## 8. Phase 4 — Feature-parity sweep

### Goal

Close the parity gaps called out in the week summary and prove they stay closed.

### Feature-parity checklist (every item needs a test; see §9)

Command and action surface — already routed in `command-lane.ts`, needs proof-of-correct-behavior per §9:

- `ATTACK`, `EXPAND`, `BREAKTHROUGH_ATTACK`, `ATTACK_PREVIEW`
- `SETTLE`, `CANCEL_CAPTURE`, `UNCAPTURE_TILE`
- `BUILD_FORT`, `BUILD_OBSERVATORY`, `BUILD_SIEGE_OUTPOST`, `BUILD_ECONOMIC_STRUCTURE`
- `CANCEL_FORT_BUILD`, `CANCEL_STRUCTURE_BUILD`, `CANCEL_SIEGE_OUTPOST_BUILD`, `REMOVE_STRUCTURE`
- `COLLECT_TILE`, `COLLECT_VISIBLE`, `COLLECT_SHARD`
- `CHOOSE_TECH`, `CHOOSE_DOMAIN`
- `SET_TILE_COLOR`, `SET_PROFILE`
- `OVERLOAD_SYNTHESIZER`, `SET_CONVERTER_STRUCTURE_ENABLED`
- `REVEAL_EMPIRE`, `REVEAL_EMPIRE_STATS`
- `CAST_AETHER_BRIDGE`, `CAST_AETHER_WALL`
- `SIPHON_TILE`, `PURGE_SIPHON`
- `CREATE_MOUNTAIN`, `REMOVE_MOUNTAIN`
- `AIRPORT_BOMBARD`
- `ALLIANCE_{REQUEST,ACCEPT,REJECT,CANCEL,BREAK}`
- `TRUCE_{REQUEST,ACCEPT,REJECT,CANCEL,BREAK}`

Render and UX parity — each gets a dedicated parity test (legacy vs rewrite snapshot diff):

- Town overview (town type, population tier, gold/min, support, population, is-fed)
- Economy breakdown (gold sources, per-minute rates, strategic production)
- Visibility (vision radius, revealed-state masks, observatory effect)
- Frontier ownership display (contested states, combat locks, attacker indicator)
- Structure render (forts, observatories, siege outposts, economic buildings, sabotage, shard sites)
- Docks and sea-tile rendering
- Leaderboard (by tiles, income, techs; self entry)
- Season victory cards (all paths, progress labels, hold remaining)
- Attack preview / win-chance display
- Frontier claim UX (capture timer, cancel, relocate)
- Bootstrap performance (time-to-first-playable-state)

Reconnect and persistence:

- Reconnect with in-flight command on every command type
- Reconnect mid-capture (settled, not yet resolved)
- Reconnect mid-combat (lock still live)
- Reconnect mid-structure-build
- Reconnect after siphon cast
- Reconnect across a simulation restart (requires Phase 2)

### Deliverables

1. `apps/simulation/src/*` and `apps/realtime-gateway/src/*` port or fix every item above. Whatever fails the parity test in §9.3 gets a bug fix with a regression test.
2. `packages/client/src/*` UX parity for the items that are render-driven.
3. Each checklist item moves from "unverified" to "test in CI" before being considered closed.

### Tests to add

All tests described in §9. Bug 2's failure mode specifically is covered by §9.2 and §9.3.

### Acceptance

- Every checklist item has a green test in CI.
- Parity harness output (legacy vs rewrite) diff is empty for a 5-minute canonical scenario replay.

---

## 9. Test architecture

This section exists because the prompt called out two bugs the author shouldn't have had to find manually. The tests below are written to catch each bug's *class*, not just the instance.

### 9.1 Bug 1 class — "state vanishes on restart"

**Diagnostic:** A command was accepted and visible, but after a server restart, the world shows as if the command never happened. This means one of:

- The event was not durably written before ack.
- The event was written but not replayed on recovery.
- The snapshot was written with stale projection state.
- The projection had a bug that's only visible after a cold start.

**Test pattern — `restart-parity.integration.test.ts`:**

```ts
describe.each(ALL_MUTATING_COMMAND_TYPES)("restart parity: %s", (cmdType) => {
  it("state is identical after a cold restart from DB", async () => {
    const { sim, db } = await bootFreshSim({ seed: CANONICAL_SEED });
    const setup = await applyPreconditions(sim, cmdType);
    const result = await submitAndResolve(sim, buildCommand(cmdType, setup));
    const before = await captureWorldState(sim, setup.playerId);
    await sim.shutdown();

    const { sim: sim2 } = await bootSimFromDb(db);
    const after = await captureWorldState(sim2, setup.playerId);
    expect(after).toEqual(before);
  });
});
```

**Required sub-tests:**

- Settle: settled tile, adjacent radius, town metadata all survive.
- Structure build (every type): in-progress builds, completed builds, upkeep state.
- Combat lock: if a combat resolves at T+5s and sim restarts at T+2s, the lock is restored with the same `resolvesAt`.
- Ability casts (siphon, aether bridge/wall, reveal): active effect with expiry timestamp survives.
- Tech/domain choices: the player's tech set and root survive.
- Alliances, truces: state with request timestamps survives.

**Property assertion for every command type:**

After resolution, `world_events` contains exactly one terminal event for this `commandId`. If the command would have been rejected, a `CommandRejected` row exists. Neither acceptance nor resolution silently omits a durable record.

### 9.2 Bug 2 class — "acceptance and resolution disagree"

**Diagnostic:** The client saw `ATTACK_PREVIEW` report 100% win chance. The command was accepted. Resolution produced no ownership change, no manpower deduction, no loss record. This means either:

- Preview uses a different RNG/inputs than the resolution code.
- Resolution short-circuited on an unreported error.
- Acceptance stage reserved resources that the resolution stage silently unreserved.
- The rewrite emits an acceptance event but the actual state mutation runs on the legacy process.

**Test pattern 1 — preview/resolution consistency:**

```ts
describe("attack preview matches resolution", () => {
  it.each(PREVIEW_RESOLUTION_MATRIX)("p(win)=%f matches empirical win rate", async (pWin) => {
    const scenario = buildCombatScenario({ pWin });
    const preview = computeAttackPreview(scenario);
    const outcomes = Array.from({ length: 2000 }, () =>
      rollFrontierCombat(scenario, createSeededRng()).attackerWon
    );
    const empirical = outcomes.filter(Boolean).length / outcomes.length;
    expect(preview.pWin).toBeCloseTo(empirical, 2);
  });
});
```

**Test pattern 2 — acceptance → resolution contract:**

```ts
it("every COMMAND_ACCEPTED must produce exactly one terminal event", async () => {
  const { sim } = await bootFreshSim();
  const events = await runScenario(sim, CANONICAL_MIXED_LOAD);
  const accepted = events.filter(e => e.eventType === "COMMAND_ACCEPTED");
  for (const a of accepted) {
    const terminals = events.filter(e =>
      e.commandId === a.commandId &&
      TERMINAL_EVENT_TYPES.has(e.eventType)
    );
    expect(terminals).toHaveLength(1);
  }
});
```

**Test pattern 3 — state-change invariant:**

```ts
it("accepted command changes at least one documented field", async () => {
  for (const cmdType of ALL_MUTATING_COMMAND_TYPES) {
    const { sim } = await bootFreshSim();
    const setup = await applyPreconditions(sim, cmdType);
    const before = await captureWorldState(sim, setup.playerId);
    const result = await submitAndResolve(sim, buildCommand(cmdType, setup));
    if (result.accepted) {
      const after = await captureWorldState(sim, setup.playerId);
      const diff = diffState(before, after);
      expect(diff.changedFields.length).toBeGreaterThan(0);
    }
  }
});
```

**Test pattern 4 — attack at deterministic 100% win must capture:**

```ts
it("100% win chance always captures and charges manpower", async () => {
  const scenario = buildCombatScenario({ pWin: 1 });
  for (let i = 0; i < 50; i++) {
    const { sim } = await bootFreshSim({ seed: i });
    await applyCombatPreconditions(sim, scenario);
    const before = await captureWorldState(sim, scenario.attackerId);
    const result = await submitAndResolve(sim, buildAttackCommand(scenario));
    expect(result.accepted).toBe(true);
    expect(result.attackerWon).toBe(true);
    const after = await captureWorldState(sim, scenario.attackerId);
    expect(after.tiles[scenario.targetKey].ownerId).toBe(scenario.attackerId);
    expect(after.player.manpower).toBeLessThan(before.player.manpower);
  }
});
```

**Test pattern 5 — no cross-path divergence:**

```ts
it("preview and resolve call the same combat module", () => {
  const previewImpl = requireFn("computeAttackPreview").__combatModule;
  const resolveImpl = requireFn("rollFrontierCombat").__combatModule;
  expect(previewImpl).toBe(resolveImpl);
});
```

(Tag both functions with a shared `__combatModule` symbol so this assertion is mechanical.)

### 9.3 Parity harness — legacy vs rewrite

**Purpose:** Detect any silent behavioral drift before a beta tester finds it.

**Design:**

- `scripts/parity-harness.mjs` boots both stacks against the same seed and the same scripted sequence of commands.
- After each command, both stacks export their `PlayerSubscriptionSnapshot`, `WorldStatusSnapshot`, and full tile projection as JSON.
- The harness diffs the two. Any difference is a test failure.
- The command sequence covers the feature-parity checklist in §8 and runs for 5 simulated minutes with AI off and then 2 minutes with AI on.

**Where it runs:**

- Locally via `pnpm parity`.
- In CI nightly.
- Automatic failure at any diff; no "known-difference" allowlist until a human explicitly approves one.

### 9.4 Reconnect harness

- `scripts/reconnect-harness.mjs` submits each command type, then drops the socket before any response, reconnects after 500ms, and asserts:
  - Exactly one server-side occurrence of the command.
  - Client does not double-send.
  - `COMMAND_QUEUED` arrives on the reconnected socket if the resolution had not yet emitted a terminal event.
  - A terminal event eventually arrives on the reconnected socket.

### 9.5 Coverage enforcement

- `packages/sim-protocol/src/command-coverage.test.ts`:
  - Read every value of the `DurableCommandTypeSchema` union.
  - Assert a matching parameterized test exists in §9.1, §9.2, §9.4.
  - If a new command type is added without these tests, CI fails. This is the "don't ship unverified commands" rail.

### 9.6 Load test (nightly)

`scripts/rewrite-load-harness.mjs`:

- 1 human client at max frontier click rate.
- 40 AI players on.
- Barbarians, system jobs, chunk subscriptions all on.
- Persistence on, DB-backed.
- 10 minutes.

Exports the plan's acceptance numbers (p50/p95/p99/max of accept latency, event-loop max, backlog age) and fails CI if any gate regresses.

---

## 10. Phase 5 — Observability and gates

### Deliverables

1. Gateway emits structured metrics every 1s:
   - `gateway_event_loop_max_ms`, `gateway_ws_sessions`, `gateway_command_submit_latency_ms` (p50/p95/p99), `gateway_sim_rpc_latency_ms`, `gateway_backend_connected`.
2. Simulation emits:
   - `sim_event_loop_max_ms`, `sim_command_accept_latency_ms` (per lane), `sim_human_interactive_backlog_ms`, `sim_ai_planner_breaches`, `sim_checkpoint_rss_mb`, `sim_event_store_write_ms`.
3. A `/metrics` Prometheus-style endpoint on both services, scrape-friendly.
4. Fly log-stream alerts on:
   - `gateway_event_loop_max_ms > 100` for 3 consecutive samples.
   - `sim_human_interactive_backlog_ms > 500`.
   - `sim_checkpoint_rss_mb > 400` (OOM pre-alarm).
5. Client debug badge surfaces the active backend and a live "accept latency p95" read from `world-status` events.

### Tests

- `apps/*/src/metrics.test.ts`: metrics increment correctly.
- `apps/realtime-gateway/src/metrics.integration.test.ts`: p95 computation matches a known input series.

### Acceptance

- A dashboard (or just `curl /metrics | sort`) shows every gate from §1 live.
- The nightly load harness writes its results to a file stored at `docs/load-results/YYYY-MM-DD.json`.

---

## 11. Phase 6 — Cutover

### Pre-flight

- All phases 0-5 complete.
- Nightly load harness green for 3 consecutive nights.
- Parity harness green against a 5-minute scenario.
- Staging has been running the rewrite stack for 7 consecutive days without an unresolved issue.

### Cutover steps (day-of)

1. **T-24h**: freeze all non-cutover merges to `main`. Tag current prod legacy build as `legacy-v-cutover-<date>`.
2. **T-2h**: import latest prod snapshot into prod Postgres via `scripts/rewrite-db-import-legacy-snapshot.ts`.
3. **T-1h**: deploy `border-empires-simulation` and `border-empires-gateway` to prod, DB-backed. Health-check `/healthz` on both, verify runtime provenance matches the imported snapshot.
4. **T-0**: flip the beta testers' cookie (or deploy a client build where the small beta-tester list's default `VITE_GATEWAY_WS_URL` is set). Legacy monolith keeps running untouched.
5. **T+30m**: read the gates:
   - If green: deploy client with default `VITE_WS_URL` pointing at the gateway for all users.
   - If any gate fails: flip cookie back. Legacy is unchanged, beta testers resume on legacy. No data loss because beta testers played against a fresh DB-backed world seeded from the imported snapshot, and the legacy world was not mutated during the window.
6. **T+1d**: keep legacy `border-empires` app running but no traffic routed. Monitor new stack for 72h before Phase 7.

### Data-loss risk during cutover

The cutover is a forward-only import. Because the beta testers are the *only* live players, and because we freeze their actions at T-2h for the snapshot capture, the window of possible data loss is the 2 hours between snapshot and go-live. We accept this by announcing a maintenance window to the beta testers.

### Rollback

- Client cookie flip back to legacy (`be-backend=legacy` or deploy a client build that points at legacy).
- Legacy DB and snapshot state are untouched.
- The new stack's DB can be wiped and re-seeded for the next attempt.

---

## 12. Phase 7 — Delete legacy

Only after the new stack has run cleanly in prod for 7 days:

1. Delete `fly.server.toml`.
2. Delete `Dockerfile.server`.
3. Delete `packages/server/` entirely. Move any remaining shared logic into `packages/game-domain` or `packages/shared`.
4. Delete `dev:legacy` and all `scripts/server-*` scripts.
5. Rename `apps/realtime-gateway` to `apps/gateway` if the name has settled. Same for `apps/simulation`. Update all imports.
6. Run full test suite and parity harness one last time to confirm.

### Acceptance

- `git grep packages/server` in the root returns nothing.
- Fresh clone, `pnpm install && pnpm build && pnpm test` all green.
- Client prod still works.

---

## 13. Risk register

| Risk | Mitigation |
|---|---|
| Rebase of `f69dfbf` onto main is painful | Pair-review the rebase; keep every phase behind a flag; the 10 intervening commits are small (mostly UX and AI tuning) — the conflict surface is in `client-*` files. |
| Postgres becomes a new single point of failure | Fly Postgres HA. Daily logical backup to S3 (`pg_dump`). Recovery runbook tested quarterly. |
| AI worker communication overhead eats the savings | Measure in Phase 3 load test. If `postMessage` cost dominates, move AI to a sibling process with gRPC. Transport is a swap-out, not a rewrite. |
| Parity harness produces too many diffs to be useful | Start narrow (only `WorldStatusSnapshot` + player projection). Expand after those are green. |
| Beta testers on legacy hit a new legacy bug while we're mid-cutover | Legacy is frozen in Phase 0; no gameplay changes allowed until Phase 7 closes. |
| New stack OOMs in prod | Fly alert at 400MB (target budget is 320MB per simulation, 512MB machine). Checkpoint deferral and streaming writes already in `snapshot-checkpoint-manager.ts`. |
| Hidden inline AI/system work re-enters the main thread during later refactors | Add a runtime assertion: if `perf_hooks.monitorEventLoopDelay()` p99 exceeds 50ms for 5s, emit a `RuntimeAlert` and log a stack sample. |

---

## 14. Work tracking

Create one GitHub issue per phase, labeled `rewrite-p0` through `rewrite-p7`. Each issue has a checklist of the deliverables and tests above. No issue closes until its Acceptance criteria are green in CI, not on someone's laptop.

The plan is complete when all seven issues close and the load harness has posted 7 consecutive green nightly runs against prod.

---

## 15. Summary: what the next coding thread should start with

1. Run `git status` and confirm the untracked rewrite files match the list in §2. If they don't, read §2 and update this doc before doing anything else.
2. Open Phase 0, do the rebase, land the kill-switch, get CI green. Do not start Phase 1 until Phase 0 is merged to `origin/main`.
3. Do not make any gameplay-visible changes on the legacy monolith until Phase 7. Bug fixes that only touch `packages/server` are allowed only if they also apply to `apps/simulation`.
4. Every new test should be one of the patterns in §9. If a new bug is found that isn't caught by an existing pattern, add a new pattern and backfill coverage — then fix the bug.

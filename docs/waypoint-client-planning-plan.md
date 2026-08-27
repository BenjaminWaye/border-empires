# Waypoint: client-side planning + server-side offline replay

Status: plan (not yet implemented).
Scope decisions confirmed with the repo owner up front; see "Decisions" for the
options that were considered and rejected, so a later reader doesn't re-open them.

## Goal

Today the route only exists in the browser: `planWaypoint()` produces an ordered
`steps[]` list that is never sent anywhere, and the wire carries only the final
destination (`WAYPOINT_ENQUEUE {x, y, trackBarbarian?}`). The server's
`tryDrainWaypointQueue` therefore has to guess: it fires a single synthetic
EXPAND/ATTACK straight at the *final* target with a deliberately invalid origin
and leans on `handleFrontierCommandImpl`'s origin fallback. That can only ever
succeed when the destination already happens to be adjacent to owned territory,
so no real multi-hop waypoint makes any progress while the player is offline.

After this change:

- The **client is the only planner.** It computes the full route and sends it.
- The **server is a replayer.** While the player is offline it walks the
  client-supplied `steps[]` in order, one leg at a time, on the sim tick.
- While the player is online, the client drives, exactly as it does today.

## Decisions

| Question | Chosen | Rejected |
| --- | --- | --- |
| Wire payload | Full `steps[]`, server replays verbatim | Server re-plans on failure; target-only + server-side A* |
| Offline definition | Socket close **+ grace period**; handback on reconnect | Immediate on disconnect; server-always-drains |
| Drain cadence | Simulation tick, rate-matched to online pacing | Coarse interval timer; event-driven only |
| Barbarian tracking | **Frozen while offline**, resumes on reconnect | Server re-targets the moving unit |

Explicitly **not** in scope for this branch (all real, all separable):

- Auto-cancelling permanently-stuck entries server-side (the "halted flag still
  eats your `WAYPOINT_QUEUE_FULL` cap forever" problem).
- The cold-load replan race in `restorePersistedWaypointQueueForPlayer` (a
  waypoint restored during INIT is planned against an empty `state.tiles`, comes
  back `NO_OWNED_TERRITORY`, and nothing guarantees a refresh once chunks land).
- Mirroring `pauseWaypointForManpowerIfNeeded`'s explicit pause bookkeeping
  server-side. Not needed here: `INSUFFICIENT_MANPOWER` is already in
  `RETRYABLE_WAYPOINT_DRAIN_CODES`, so a tick-driven drain naturally defers and
  retries on regen. Behaviour matches; only the feed message is missing, and
  there is no feed to write to while offline.

The shared A* in `packages/shared/src/waypoint-planner/` stays where it is.
It was relocated out of the client so `apps/simulation` *could* import it; under
this design the sim still doesn't, and that's now a deliberate end state rather
than an unfinished migration. **Add a note to that effect in the planner's
header comment** so the next reader doesn't "finish" the migration.

## Design

### 1. Wire: carry the plan

`WAYPOINT_ENQUEUE` gains a `steps` field (`packages/shared/src/messages/messages.ts`,
`packages/client-protocol`, `apps/realtime-gateway/src/dev-queue-waypoint-message/`,
`packages/sim-protocol` command-coverage sets):

```ts
{ type: "WAYPOINT_ENQUEUE", x, y, trackBarbarian?, planId, plannedAt, steps: WaypointWireStep[] }
```

`WaypointWireStep` is a deliberately narrow projection of `WaypointStep` — only
what a replayer needs, not the costing fields the client uses for its own UI:

```ts
type WaypointWireStep = { origin: {x,y}; target: {x,y}; action: "EXPAND" | "ATTACK" };
```

Keep it a new **optional** field for one deploy so an old client (or a replayed
command from the gateway's durable SQLite log) still parses. A target-only
enqueue keeps today's single-leg drain behaviour as the degenerate case.

Bound the list: reject any enqueue whose `steps.length` exceeds a new
`WAYPOINT_MAX_WIRE_STEPS` (shared constant; suggest 256, the client already
refuses to render anything near that). This is a growable structure written into
a snapshot — see `docs/agents/state-and-persistence-discipline.md` — so the cap
is not optional and the queue's total step count should be gauged.

Re-plan/replace semantics: `waypointQueueEnqueue` currently rejects a duplicate
target outright as a no-op. Change it so an enqueue for an existing target with
a **newer `plannedAt`** *replaces* that entry's steps in place (keeping its queue
position and `queuedAt`), rather than being rejected. Without this the client can
never refresh a stale server-side plan short of cancel+re-enqueue, which would
briefly drop the entry and race the drain.

### 2. Server state

`ServerWaypointQueueEntry` (`apps/simulation/src/player-runtime-summary.ts`) grows:

```ts
{ target, trackBarbarian?, queuedAt, planId?, plannedAt?, steps?: WaypointWireStep[], cursor?: number, stalled?: boolean }
```

`cursor` is the index of the next unattempted step — the "current position along
the plan". It must round-trip through every place `waypointQueue` is already
serialized: `runtime-snapshot-sections.ts`, `runtime-state-export.ts`,
`runtime-visible-state.ts`, `event-recovery/event-recovery-player-state.ts`, and
`createPlayerRuntimeSummaryFromRecovered`. Missing any one of these reproduces
the class of bug that was #1618.

### 3. Offline gate: grace period

Replace the bare `isPlayerOnline(playerId)` gate with an
`isPlayerDrainEligible(playerId)` that is true only when the player has been
disconnected for at least `WAYPOINT_OFFLINE_GRACE_MS` (suggest 15s — long enough
that a page refresh or a flaky reconnect never triggers a server drain cycle).

This needs a `lastDisconnectedAt` per player. The sim already tracks
subscription state (`isPlayerSubscribed`); record the transition timestamp
alongside it rather than inventing a parallel presence source. Reconnect clears
it, which is what makes handback instantaneous — no in-flight server leg is
cancelled, but no new one starts.

### 4. Drain on the tick

Move the drain's trigger from "enqueue + `resolveLock`" to the simulation tick
loop, keeping the existing two call sites as harmless extra nudges. Per tick,
for each drain-eligible player with a non-empty queue:

- Skip if the player already has an in-flight frontier lock (one live dispatch
  at a time, same as the client's `state.actionInFlight` gate). This is what
  rate-matches offline progress to online progress: the leg's own duration and
  the player's manpower/cooldown gates do the pacing, not a timer.
- Take `queue[0]`, and from it `steps[cursor]`.
- Dispatch that leg with its **real** `origin` (`fromX/fromY`) — no more
  intentionally-invalid origin, no more origin fallback. If the step's origin is
  no longer owned, that's a stale plan (below), not something to paper over.
- Accepted → `cursor += 1`, return (one dispatch per tick per player). When
  `cursor` passes the last step, drop the entry: the waypoint is complete.
- Rejected with a `RETRYABLE_WAYPOINT_DRAIN_CODES` code → leave `cursor` alone
  and stop for this player this tick. Next tick retries. This is where the
  periodic-retry gap closes: a quiet offline window now gets an attempt per
  tick instead of zero attempts for hours.
- Rejected with anything else → **stall, don't drop.** Set `stalled: true` and
  stop draining that entry. The entry stays in the queue with its cursor intact.

Also skip drop-on-`target.ownerId === playerId` for the *final* target only, as
today; a mid-route step whose target is already owned should just advance the
cursor without dispatching (someone else's expansion, or a prior partial run,
already did that leg for free).

### 5. Stale plans (the cost of not re-planning server-side)

Because the server never re-plans, a plan can go stale: a mid-route tile gets
captured by a rival, a border moves, an origin is lost. The rule is: **the server
never invents a new route.** It marks the entry `stalled` and leaves it exactly
where it is. On reconnect the client — which does plan — sees `stalled: true`,
re-runs `planWaypoint()` from current state, and enqueues the fresh plan
(replace-in-place, per §1). If the target is genuinely unreachable, the existing
client-side halted/amber flag path handles it as it does today.

This is the honest trade of the chosen option and worth stating in the code
comment: offline progress on a contested route stops at the first surprise
rather than routing around it.

### 6. Handback on reconnect

`applyInitMessage` already reads `player.waypointQueue`. Extend the INIT payload
entries with `steps`, `cursor`, `planId`, and `stalled`. On restore the client:

- Adopts the server entry's remaining steps as its local `plan` when `planId`
  matches a plan it originated and `stalled` is false — so it resumes from where
  the server left off instead of re-planning blind (and instead of re-planning
  against an empty `state.tiles`, which sidesteps the cold-load race for this
  path even though the general fix is out of scope).
- Re-plans and re-enqueues when `stalled` is true or the plan is unrecognized.

### 7. Barbarian tracking

`trackBarbarian` entries are frozen while offline: the tick drain skips them
entirely (no dispatch, no cursor movement, no stall). The target is a moving
unit and the client's re-target logic (cancel old, enqueue new) has no offline
equivalent that wouldn't surprise the player. They resume normally the moment
the client reconnects and `topUpFromWaypoint` takes over.

## Files touched

| Area | Files |
| --- | --- |
| Wire/schema | `packages/shared/src/messages/messages.ts`, `packages/client-protocol/src/index.ts`, `packages/sim-protocol/src/command-coverage-sets/`, `apps/realtime-gateway/src/dev-queue-waypoint-message/` |
| Shared types/consts | `packages/shared/src/waypoint-planner/waypoint-planner-types.ts` (wire-step projection), `packages/shared/src/config.ts` (`WAYPOINT_MAX_WIRE_STEPS`, `WAYPOINT_OFFLINE_GRACE_MS`) |
| Sim state | `apps/simulation/src/player-runtime-summary.ts`, `runtime-snapshot-sections.ts`, `runtime-state-export.ts`, `runtime-visible-state.ts`, `event-recovery/event-recovery-player-state.ts` |
| Sim logic | `apps/simulation/src/runtime-waypoint-queue.ts`, `runtime-waypoint-queue-command-handlers.ts`, presence/`lastDisconnectedAt` + tick hook in `runtime/runtime.ts` |
| Client | `client-waypoint-planner/client-waypoint-persistence.ts` (send steps), `client-queue-logic/client-queue-logic.ts` (resume-from-cursor), `client-network-init-message/client-network-init-message.ts` (restore steps/cursor/stalled) |

`runtime/runtime.ts` is already over the 500-line cap, so the presence-timestamp
and tick-hook work must land as an extracted module (e.g.
`runtime-waypoint-drain-scheduler/`) wired in from `runtime.ts`, keeping that
file net smaller. `runtime-waypoint-queue-command-handlers.ts` is at 223 lines
and will grow past the cap with the replay loop — split the drain out into
`runtime-waypoint-drain/` in the same branch, leaving the command handlers file
to handle enqueue/cancel only.

## Tests

Regression tests are merge blockers here; each of these should fail before the
corresponding change.

1. `steps[]` survives enqueue → snapshot → export → recovery round-trip, cursor
   included (the #1618 shape of bug).
2. A 3-step plan enqueued, player offline past the grace period: ticks dispatch
   leg 1, 2, 3 in order with the real origins, one per tick, and the entry is
   dropped after the last.
3. Same plan, player online: zero server dispatches at any tick.
4. Disconnect inside the grace window: zero dispatches; after the window, drains.
5. Reconnect mid-plan: no further server dispatch, INIT carries `cursor: 1`, and
   the client resumes at step 2 without re-planning.
6. Stale mid-route step (origin lost) → entry marked `stalled`, still present,
   cursor unchanged, no further dispatch; a fresh enqueue with a newer
   `plannedAt` replaces it in place at the same queue position.
7. Retryable rejection (`INSUFFICIENT_MANPOWER`) defers without advancing the
   cursor, and the *next* tick retries — the periodic-retry gap.
8. `trackBarbarian` entry is untouched by the offline drain.
9. `steps.length > WAYPOINT_MAX_WIRE_STEPS` is rejected at the handler boundary.
10. Legacy target-only enqueue (no `steps`) still behaves as today.

## Rollout

- Ship the optional-field wire change and the sim-side read path first; the sim
  tolerating a missing `steps` is what makes the client deploy independent.
- Keep the `[waypoint-diag]` logging in place through this change — it
  instruments every point the server queue can shrink, and this change adds two
  new ones (cursor completion, stall). Extend it rather than removing it; the
  disappearing-waypoint observation in §10 of the architecture report is still
  unexplained and this branch is not the fix for it.
- Client-visible behaviour change → needs a `CLIENT_CHANGELOG_ENTRIES` entry in
  the same branch (`packages/client/src/client-changelog/client-changelog-data.ts`,
  `createdAt: Date.now()`), per `AGENTS.md`.
- Verification gate is local: `pnpm lint`, `pnpm test`, `pnpm check:file-lines`.
  There is no PR CI in this repo.

## Open risks

- **Two drivers, one tile.** The grace period narrows but does not close the
  window where a server leg is in flight as the client reconnects. The in-flight
  leg resolves normally and the client picks up from the resulting cursor; the
  worst case is one duplicate attempt bouncing off `LOCKED`. Worth asserting in
  test 5 rather than assuming.
- **Plan size in snapshots.** 20 queued waypoints × up to 256 steps is the new
  worst case for a player summary. Gauge it before raising either cap.
- **Trust.** The server now replays a client-supplied route. Every leg still goes
  through the full `validateFrontierCommand` pass, so a forged plan buys nothing
  a forged click wouldn't — but the step cap and the per-tick single-dispatch
  gate are the only things bounding how much work a client can queue, and both
  should be treated as security-relevant, not just tidiness.

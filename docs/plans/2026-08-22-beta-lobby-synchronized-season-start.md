# Beta tester onboarding: synchronized season start

Status: proposed
Context: ~100 beta testers, one month-long season, spread across time zones.

## Problem

A season today is "started" by being created. `createInitialSeasonState`
(`apps/simulation/src/season-lifecycle.ts:28`) hardcodes `status: "active"`, and
`SeasonLifecycleStatus` (`packages/sim-protocol/src/index.ts:160`) is only
`"active" | "ended"`. `JOIN_SEASON`
(`apps/realtime-gateway/src/gateway-app/handle-join-season-message.ts`) admits a
player immediately into whatever world is running.

For a month-long PvP season that means whoever connects first starts compounding
territory and economy while the rest of the cohort is still asleep. With testers
trickling in across time zones over a day, the last arrivals join a world that
has already been shaped by the first, which is both unfair and a bad read on
balance. It also smears the arrival curve, so the beta never exercises the
"100 clients connect at once" path that a real launch would.

## Recommendation

Announce a fixed UTC start time, hold early arrivals on a countdown screen, and
flip the season to active on a timer. Do **not** gate the start on a check-in
threshold — with 100 invited testers, a "start when 70% are here" rule hands a
handful of no-shows the power to stall everyone, and the failure mode is silent.
A fixed time with a manual override is easier to reason about and easier to
communicate.

## Phasing

### Phase 0 — prove 100 concurrent joins first (do this before anything else)

`scripts/rewrite-load-harness.mjs` (291 lines) drives repeated sequential
EXPAND/ATTACK batches from effectively one authenticated client against a
pre-seeded fixture world. Nothing in the repo has ever exercised N clients
connecting and calling `JOIN_SEASON` simultaneously.

A synchronized start deliberately manufactures a thundering herd. If the join
path cannot take it, the beta discovers that with 100 real testers watching.

- Add a concurrent-join mode to the harness: open N websockets, authenticate,
  and fire `JOIN_SEASON` inside a narrow window.
- Measure join latency distribution, gateway CPU/heap, and simulation tick
  drift during the burst.
- Run at 25 / 50 / 100 / 150 before committing to a launch time.

This phase has standalone value even if the lobby is never built.

### Phase 1 — `pending` season status (simulation + protocol)

- Widen `SeasonLifecycleStatus` to `"pending" | "active" | "ended"`. Every
  existing `status === "ended"` branch needs auditing for the new third state —
  `updateSeasonVictoryTrackers` in particular must no-op while pending rather
  than accrue hold timers.
- Add `scheduledStartAt?: number` to `SimulationSeasonState`.
- `createInitialSeasonState` takes an optional `scheduledStartAt`; when present
  and in the future, create as `pending`. Absent it, keep today's behaviour so
  nothing else changes.
- Add the transition (timer-driven, plus an explicit trigger for manual
  override) that flips `pending` → `active`, stamps `startedAt`, and fires the
  existing season-start notification.
- Persisted seasons predate this field: treat missing `status` handling the way
  `mapStyle` and `joinedPlayerIds` are already treated — absent means the
  historical default, never the current env's setting.

### Phase 2 — hold arrivals (gateway + client)

- `JOIN_SEASON` against a pending season returns a `SEASON_PENDING` response
  carrying `scheduledStartAt` instead of spawning. Reuse the shape of the
  existing `SEASON_FULL` path in `handle-join-season-message.ts`.
- Broadcast the flip so held clients enter without a reload.
- Client shows a countdown screen: start time in the viewer's local timezone
  (the whole point is that testers are not all in one), and an auto-enter when
  it hits zero.
- **Constraint:** `gateway-app.ts` is 3152 lines and already over the 500-line
  limit, so it may not grow. Extract the new handling into a sibling module
  under `apps/realtime-gateway/src/gateway-app/`, the way
  `handle-join-season-message.ts` already was.
- Client-visible, so this needs a `CLIENT_CHANGELOG_ENTRIES` entry in the same
  branch per AGENTS.md.

### Phase 3 — the start email (mostly already built)

`notifySeasonStarted` (`apps/realtime-gateway/src/season-start-notify/`) already
emails every player with a bound address via Resend, with a previous-winner
recap. Wiring it to the pending→active flip is close to free.

What it does not do is send *ahead* of the start. A reminder at T-24h and T-1h
is what actually gets a cohort to show up on time, and needs a scheduled send
plus a distinct template. Check the `dailyLimit` throttle in
`email-alerts/email-alerts.ts` before broadcasting to 100 recipients three
times.

## Raise the player cap

`SIMULATION_MAX_SEASON_PLAYERS` defaults to exactly 100
(`apps/simulation/src/season-join-capacity.ts`), which is precisely the cohort
size and therefore has zero headroom. One tester with a second account, or one
stale binding, and a real invitee gets `SEASON_FULL` at launch. Set it to ~120
for the beta.

## Explicitly out of scope

- **Lobby roster / presence / chat.** Nice, not load-bearing. The countdown is
  what makes the start fair; seeing who else is waiting does not.
- **Beta allow-list / invite codes.** Auth is currently open email/password
  registration (`packages/client/src/client-auth-flow/`) with no invite model.
  Worth having before public marketing, but it is a separate piece of work and
  it does not block a private beta with a shared start time.

## Open question

Whether to keep the season joinable after the synchronized start. Recommend yes
— late arrivals are inevitable at 100 testers and locking them out wastes
scarce testers. The head start problem is bounded once everyone begins within
the same hour, which the countdown achieves.

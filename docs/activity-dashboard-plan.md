# Activity dashboard and 24-hour player history

## 0. Status

**Phase 0 shipped** — [PR #2074](https://github.com/BenjaminWaye/border-empires/pull/2074),
merged into `develop`. No player-visible change (old Activity Feed and
`player-event-log` are untouched). What actually landed, with exact
locations for whoever picks up Phase 1:

- Shared wire types live in **`packages/game-domain/src/personal-activity-timeline-types.ts`**,
  not `packages/client-protocol` as §4.3 below originally suggested —
  `packages/client` doesn't depend on `client-protocol` at all, and
  `client-protocol` is dependency-free by design (can't import
  `game-domain`). `game-domain` is already depended on by `apps/simulation`,
  `apps/realtime-gateway`, and `packages/client`, matching the existing
  `ActivityDashboardSnapshot` precedent (`activity-dashboard-types.ts`) —
  re-exported via `packages/game-domain/src/index/index.ts`. Exports
  `PersonalActivityTimeline`, `PersonalActivityCard` (currently
  `TERRITORY_FLIP_GROUP` | `COMBAT` | `TRUNCATION_NOTE` — no waystation/town/
  building card kinds yet, see Phase 2), `PersonalActivitySummary`, and
  `PERSONAL_ACTIVITY_TIMELINE_CARD_CAP` (100).
- Pure aggregation module: **`apps/simulation/src/personal-activity-aggregation/`**
  (`personal-activity-aggregation.ts` orchestrator +
  `personal-activity-territory-grouping.ts` + `personal-activity-combat-cards.ts`
  + `personal-activity-cap.ts` + `personal-activity-timeline-rpc-handler.ts`).
  `aggregatePersonalActivity(playerId, {from, to}, flips, combat)` already
  computes real `tilesClaimed`/`tilesLost`/`manpowerSpentAttacking` and
  groups territory flips into cards. **`goldPlundered`/`goldRaidedFromYou`
  are hardcoded to `0`** — Phase 1 step 1 (§3.3) needs to both extend
  `CombatManpowerLoss` and update this orchestrator to sum the new fields
  instead of the hardcoded zeros. No `playerNames` parameter was threaded
  through, by design: cards carry only stable player IDs, so a future
  renamed/deleted player still renders correctly if the client resolves
  display names at render time from its own roster (this also satisfies the
  §7 test requirement about renamed/deleted players "for free").
- `GetPersonalActivityTimeline` gRPC RPC (`packages/sim-protocol/src/simulation.proto`,
  `SimulationRuntime.getPersonalActivityTimeline()` in `runtime.ts`) — the
  RPC/wire plumbing for the whole pipeline is proven end-to-end by
  `apps/realtime-gateway/src/gateway-app/activity-timeline.integration.test.ts`
  (spins up a real simulation + gateway; template to copy for Phase 1/2
  round-trip tests, since every other Phase 0 test mocks its own layer and
  none of them could have caught a wire-level proto mismatch).
- `REQUEST_PERSONAL_ACTIVITY` / `ACKNOWLEDGE_ACTIVITY_SEEN` WS messages
  (`packages/shared/src/messages/messages.ts`, handled in
  `apps/realtime-gateway/src/gateway-app/handle-activity-timeline-messages.ts`).
  **The client does not send either of these yet** — Phase 1's dashboard is
  the first real consumer. `REQUEST_PERSONAL_ACTIVITY` always requests
  exactly the trailing 24h from `session.playerId`; the `[max(last_activity_seen_at,
  now - 24h), now]` interval semantics from §4.2 are NOT wired up client-side
  yet (the aggregator's `truncated` flag already supports it correctly if
  Phase 1 passes the true unclamped `last_activity_seen_at` as `from` — no
  client-side pre-clamping needed, see the orchestrator's doc comment).
- `last_activity_seen_at`/`last_activity_seen_season_id` SQLite migration +
  monotonic, season-scoped `setActivitySeen` (`sqlite-player-profile-store.ts`,
  `player-profile-store.ts`). **No separate `getActivitySeen` method** —
  the existing `.get(playerId)` already returns these fields, so a
  dedicated getter would have been dead code.
- `INIT` carries the already-cached watermark as a new `activitySeen: {
  lastActivitySeenAt, lastActivitySeenSeasonId }` field
  (`gateway-app.ts`) — **deliberately no sim RPC added to the INIT/login
  path**, given this project's history of login-latency regressions from
  synchronous sim round-trips there. The "is there anything new" decision
  (§2.1's auto-open logic) is unbuilt — Phase 1 must compute it client-side
  after its own `REQUEST_PERSONAL_ACTIVITY` fetch, comparing the newest
  card's `occurredAt` against `activitySeen.lastActivitySeenAt`, not by
  adding a second sim call to INIT.
- Payload-byte gauge: `gateway_activity_timeline_payload_bytes`
  (`apps/realtime-gateway/src/metrics/metrics.ts`).

Not started: everything in §5 (client implementation), the personal-impact-log
(§3.2), the combat-record extension (§3.3), World Pulse (§2.4), and Updates
absorption (§5.1's changelog migration). See the phase breakdown in §6 for
what's next.

## 1. Decision

Replace the current client **Activity Feed** as the player-facing history
surface with one persistent **Activity** dashboard. It is the place for both
live activity and a return-to-game briefing; it is not a second feed beside
the existing one.

The dashboard has three views:

1. **Yours** — a personal, 24-hour rolling timeline and the "Since you were
   away" briefing.
2. **World Pulse** — a small, curated world digest and at-a-glance season
   statistics.
3. **Updates** — the existing client changelog, moved out of its independent
   popup into this dashboard.

The activity button remains permanently available in the HUD. A returning
player gets the same dashboard as a modal only when there is new, meaningful
personal activity; dismissing it never discards the timeline. Reopening the
HUD button shows the full trailing 24-hour window until its events expire.

This replaces the *player-facing Activity Feed*, not all transient feedback.
Action failures, connection diagnostics, and short-lived toasts remain
ephemeral notifications; they are not historical game events and must not
pollute the dashboard.

## 2. Player experience

### 2.1 Opening and persistence

- On a fresh authenticated session, request the personal activity preview.
  If there are unseen meaningful personal events since the player's most
  recently acknowledged dashboard view, open the Activity dashboard after
  profile setup and the initial game state are ready.
- Do not reopen it for an in-place socket reconnect or browser refresh after
  acknowledgement. The HUD activity button carries an unread badge instead.
- Opening **Yours** acknowledges the delivered personal-activity watermark.
  The dashboard remains readable for the full rolling window after that
  acknowledgement. Opening **World Pulse** or **Updates** does not mark
  personal events read.
- The existing changelog `seenAt` remains a local release-notes preference.
  It must not be conflated with a player's server-side activity acknowledgement.
- Do not show an empty modal. The HUD button still opens a useful dashboard
  with the current world snapshot and Updates.

The server-side marker is named `last_activity_seen_at`, not `lastSeenAt`.
It means "the newest personal activity the player has viewed," not last
disconnect or last login. The client acknowledges a server-issued
watermark only after it has received the timeline. The server advances the
value monotonically (`max(stored, acknowledged)`) so two devices cannot move
it backwards. A season identifier accompanies the marker so a new season
never inherits an old season's unread state.

### 2.2 Layout

The top of every dashboard view is a compact **World at a glance** row:

`Season 3 · Your rank #6 ↑2 · Leading powers: Osmond 842, Aria 791, …`

It contains no more than four facts. On small screens it collapses to one
line with an explicit expand control. Detailed economy, technology, map
controls, and the full leaderboard remain in their dedicated UI.

The Yours view, when activity exists, starts with two lines:

`+7 tiles claimed · −3 tiles lost · −240 gold raided · 1 waystation activated · +1 town captured · −1 town lost · 4 buildings completed`

`Effects: +120 manpower capacity · +18 gold/min · +1 TITANIUM slot`

The first line is counts and one-off transfers. The second is only resolved,
attributable effects. They must never be collapsed into a misleading single
"net gold" or "net manpower" value.

Below that is a newest-first timeline. Each card has a timestamp, readable
event outcome, effects where applicable, and a **Center** button whenever it
has a player-safe map location:

- `09:42 · Osmond captured a settled tile · 85 gold raided · Center`
- `10:03 · Waystation activated · +1 CRYSTAL slot · Center`
- `10:27 · Granary completed in Rivergate · +10,000 population · Center`

For a grouped territory or combat event, `Center` targets its largest spatial
cluster; it must not use the centroid of distant raids and place the player on
empty ground. The initial implementation may center the most recent,
highest-impact tile in the cluster. A later camera-fit action is allowed only
if it is implemented for both renderers.

The one exception to "normal technology is not unlocked while away" is a
waystation's existing automatic TECH reward. If a queued capture activates
one while the player is offline, its card says, for example, `Waystation
activated · granted Cartography`. Never present ordinary research as an
offline completion.

### 2.3 Manpower and gold language

Manpower is useful context for unattended muster flags, but is secondary:

- Record and show it as **manpower spent attacking**: the cost of the
  player's resolving attacks while away.
- Show the aggregate in the headline only when material: at least 250
  manpower and at least 5% of the player's report-end manpower cap. Keep
  smaller values in the relevant combat group only.
- Do not call the current `manpower` snapshot a historical loss, and do not
  invent a defending-manpower loss when the combat model did not deduct one.

Gold plunder is always explicit and directional:

- `−240 gold raided from you` means attackers captured the player's settled
  tiles and took that amount.
- `+130 gold plundered` means the player captured settled enemy tiles.
- Never net these two amounts together. Each combat card attributes the
  amount, attacker/defender, target, and result.

Use exact units for every reported effect: `manpower capacity`, `gold/min`,
`gold plundered`, `population`, and `+1 TITANIUM slot`. A dynamic economic
effect may appear in the summary only when the simulation supplied an
authoritative resolved delta; the client must not independently infer a
gold-rate increase from current state.

### 2.4 World Pulse and Updates

World Pulse uses the existing `buildDailyStory` material plus power-score
data. It is a significance-capped digest (three to five entries), not a raw
global event firehose. The player's own events are suppressed when they
already appear in Yours.

Barbarians are excluded before all World Pulse calculations and ranking:

- no barbarian power-score row in Leading powers;
- no barbarian participant in daily-story selection, significance ranking,
  war summaries, momentum, or frontline highlights;
- no barbarian fallback item when there are too few player stories.

This exclusion applies only to World Pulse. Barbarian attacks, captures,
raids, and waystation consequences remain in the affected player's Yours
timeline.

World Pulse contains no Center action unless the location is already legal
and visible to that player. The safe default is text-only; this dashboard must
not become a fog-of-war leak.

Updates reuses the changelog entries and release-note copy. It has its own
unread badge based on the existing local changelog marker.

## 3. Data model and retention

### 3.1 Contracts to keep

Do not turn `DomainPlayer.eventLog` into the 24-hour dashboard store. It is
a snapshot-persisted, 50-entry compatibility log and therefore cannot
guarantee one day under busy traffic. It presently powers waystation popup
catch-up and several existing notices; retain it while those consumers
migrate, then remove only after explicit replacement tests pass.

Do not put an unbounded activity array into player or world snapshots. The
activity dashboard is derived history, not reconstructable world state.

Keep and reuse the existing durable, bounded 24-hour logs:

- `territory-flip-log` is the authoritative source for tiles gained/lost and
  groups of player territory changes.
- `combat-manpower-log` is the source for manpower spent on attacks. Extend
  its record only with combat facts needed for the report, not presentation
  strings.
- `activity-log-persistence.ts` persists their bounded newest tail across
  restarts and is the model for every new rolling log.

### 3.2 New bounded personal-impact log

Create `personal-impact-log`, a single global-in-simulation rolling store
for high-signal personal events which existing logs cannot recover. It is
not a map attached to each player and not a broad hook on every emitted
event. It records only explicit, named producers:

- waystation activation and resolved reward details;
- town captured/lost, including town name, tier, survive-versus-raze result,
  and relevant captured anchor/building outcome;
- building completion with type, location, town where relevant, and any
  authoritative instant or permanent effect;
- a settled-tile plunder outcome when it cannot be represented unambiguously
  by the extended combat record.

Every record has a stable event id, `playerId`, event type, occurred-at time,
optional coordinates, and a narrowly typed payload. It must use a 24-hour
TTL and an independent hard entry cap. Entries are append ordered; cap
eviction drops the oldest and increments an observable counter.

The persisted activity tail becomes:

```ts
type PersistedActivityLogs = {
  flips: TerritoryFlip[];
  combat: CombatManpowerLoss[];
  personalImpacts: PersonalImpactEvent[];
};
```

It uses the same restart restore/prune rules as the existing logs. Choose a
separate realistic cap for personal impacts after measuring production traffic
(initially no higher than the existing 5,000 persisted-tail cap), and gauge
the entry count, oldest/newest timestamps, cap hits, exported byte size, and
events discarded from a client response.

### 3.3 Required additions to existing records

Extend `CombatManpowerLoss` with typed numeric fields for the already
resolved settled-capture transfer:

- `pillagedGold` — amount credited to the attacker;
- `defenderGoldLoss` — amount removed from the defender;
- `targetWasSettled` — enough context to render the raid honestly.

Populate those values at the shared combat-resolution record site from the
already-calculated `pillagedGold` and `defenderGoldLoss`; do not recompute
plunder later from changed player state. Both regular players and barbarians
must populate the event where the combat rules apply.

Waystation impacts must carry the existing structured fields (effect, tech,
resource, receiving/revealed town coordinates) and add the actual population
amount where a population burst occurred. The report derives text from these
fields, never from a stale current tile.

Building impacts must record completion, not queue placement. If a building's
gold/manpower effect is conditional or economy-network-dependent, have the
simulation record the evaluated change through the same calculator used for
the real economy. Otherwise show completion without claiming a numeric rate.

## 4. Aggregation and delivery

### 4.1 Pure aggregation layer

Add a pure `personal-activity-aggregation` module beside the activity logs.
Its input is a player id, `[from, to]` interval, the three bounded logs, and
a read-only player/name snapshot. Its output is a typed, capped
`PersonalActivityTimeline`:

- summary counts: tiles claimed/lost, waystations activated, towns
  captured/lost, buildings completed;
- directional resource totals: gold plundered and gold raided from the
  player;
- authoritative effect totals: manpower capacity, gold/min, resource slots,
  population, and waystation-granted technology;
- conditional manpower-spent total and per-combat groups;
- timeline cards with one safe Center target each;
- a `truncated` flag when `from` precedes the 24-hour retention cutoff.

Territory flips are grouped by direction, counterparty, time bucket, and
spatial cluster. Repeated loss/capture of the same tile stays historically
truthful: show both outcomes in chronology rather than overwriting an earlier
event with the present owner.

Timeline output has an explicit cap (for example 100 cards). The aggregator
keeps highest-impact cards and adds a truthful "N smaller events not shown"
entry rather than silently dropping them. It must have a payload-byte gauge
at the gateway boundary.

### 4.2 Interval semantics

The normal dashboard always queries the trailing 24 hours. The automatic
return briefing queries:

`[max(last_activity_seen_at, now - 24h), now]`

If the player was gone longer than 24 hours, display both facts:

`You were away 3 days. This activity history covers the latest 24 hours.`

Never label a truncated report "since you were away." A first-time player
with no acknowledgement gets the trailing window but only sees the automatic
modal if it has meaningful activity.

### 4.3 Wire and profile changes

Add a dedicated authenticated activity request/response rather than appending
a full timeline to every `PLAYER_UPDATE`. `INIT` carries only a compact
preview/watermark sufficient to decide whether an automatic briefing request
is needed. The client fetches the full personal timeline after initial state
is usable and when the player opens or refreshes the dashboard.

Live high-signal activity is delivered as a single typed activity event (or a
monotonic activity revision that triggers one fetch), not by resending a
24-hour collection on ordinary player updates. This keeps network and render
cost proportional to actual activity.

Add `last_activity_seen_at` and `last_activity_seen_season_id` to the gateway
profile store using its idempotent `ALTER TABLE ADD COLUMN` convention. Add
an acknowledgement message containing the received watermark and season id;
validate that it cannot acknowledge a future time or another season.

The response type belongs in a small shared protocol module, with explicit
discriminated activity-card and effect types. Do not use `Record<string,
any>`, presentation HTML, or untyped dependency bags at the gateway/sim
composition boundaries.

(Phase 0 resolved this to `packages/game-domain`, not `packages/client-protocol`
— see §0.)

## 5. Client implementation

### 5.1 Replace the Activity Feed surface

Replace the existing HUD feed panel with the dashboard launcher and unread
count. Keep its small, non-persistent notification behavior privately scoped
to action feedback until those calls are migrated; it must no longer claim to
be the player's durable game history.

Create focused modules below `packages/client/src/client-activity-dashboard/`
for state/reducer, typed rendering, timeline formatting, map centering, and
event binding. Keep each new source file below 500 lines.

Reuse the current changelog overlay's dialog, backdrop, scroll restoration,
and accessible focus behavior, but replace it with one overlay coordinator:

- profile setup has priority;
- a newly-returning activity briefing can open after initialization;
- guide and renderer prompts must not compete with the dashboard;
- the new-player checklist/guide overlay has a lower z-index than the
  Activity dashboard and is hidden while that dashboard is open, so checklist
  UI can never render on top of a briefing card or intercept its controls;
- closing the modal retains the dashboard state and returns to play;
- the HUD control can reopen it in any view.

The old standalone `renderClientChangelogOverlay` is absorbed into the
Updates tab only after its existing visibility and seen-state tests have an
equivalent dashboard test.

### 5.2 Center action and renderer parity

Every Yours card with coordinates renders a button labelled `Center`.
Clicking it closes/collapses the dashboard as appropriate, uses the existing
focus-coordinate navigation primitive, selects the target tile, and refreshes
the view. The map action is shared camera state, so it must work in both the
2D canvas and true-3D renderers.

If implementation adds an activity-specific tile highlight or cluster bounds
overlay, implement it in both `isTrue3DRendererActive()` branches in the same
change. Before completion, grep that guard and record both paths in the PR
summary. The initial Center feature needs no new overlay.

## 6. Delivery phases

### Phase 0 — contracts and safety rails ✅ shipped (PR #2074, see §0)

1. ~~Add shared personal activity types, caps, retention constants, gauges, and
   pure aggregation fixtures.~~ Done — see §0 for exact locations.
2. ~~Add profile migration and acknowledgement semantics.~~ Done.
3. ~~Add protocol request/response plus authenticated authorization tests.~~
   Done, including a real end-to-end gRPC/WS integration test.
4. ~~Keep the old feed and player event log behavior intact in this phase.~~
   Confirmed untouched.

### Phase 1 — personal combat and territory history (next up)

1. Extend `CombatManpowerLoss` (`apps/simulation/src/combat-manpower-log/combat-manpower-log.ts`)
   with `pillagedGold`/`defenderGoldLoss`/`targetWasSettled`, populated at
   `buildLockedCombatResolution` (`apps/simulation/src/runtime-combat-support.ts`)
   from its already-computed `pillagedGold`/`defenderGoldLoss` — both
   regular players and barbarians. Then update
   `apps/simulation/src/personal-activity-aggregation/personal-activity-aggregation.ts`
   to sum the new fields into `goldPlundered`/`goldRaidedFromYou` instead of
   the current hardcoded `0`s, and extend `PersonalActivityCombatCard`
   (`packages/game-domain/src/personal-activity-timeline-types.ts`) with the
   plunder fields so a combat card can render them.
2. ~~Build the 24-hour personal aggregation from territory flips and
   combat.~~ Done in Phase 0 (real `tilesClaimed`/`tilesLost`/
   `manpowerSpentAttacking` today); this step is now "extend it with plunder"
   per (1), not "build it."
3. Deliver the Yours dashboard, return briefing, summary line, timeline,
   unread badge, and Center action, under
   `packages/client/src/client-activity-dashboard/` (§5.1). The client-side
   fetch (`REQUEST_PERSONAL_ACTIVITY`), acknowledgement
   (`ACKNOWLEDGE_ACTIVITY_SEEN`), and INIT watermark
   (`initMessage.activitySeen`) are already wired server-side and unused —
   this is the first real consumer. Requires a `CLIENT_CHANGELOG_ENTRIES`
   entry (player-visible; Phase 0 needed none).
4. Include barbarian events in Yours and exclude them from World Pulse from
   the first merge. (Phase 0's aggregator already includes barbarian
   participants in Yours by construction — no exclusion logic exists there
   — so this is only a World Pulse-side requirement once §2.4/Phase 3 lands.)

This phase delivers the highest-value catch-up: queued attacks, territory
gain/loss, raid loss, gold plunder, and material manpower spent.

### Phase 2 — durable milestone outcomes

1. Add the bounded personal-impact log and persistence/export/restore path.
2. Migrate waystation activation into it, preserving rich effect detail and
   retaining the old player-event-log popup bridge temporarily.
3. Add town capture/loss and build-completion producers.
4. Add exact effect summaries only where the simulation owns the resolved
   number.
5. Retire redundant event-log-to-feed paths only after their dashboard
   replacements are proven across INIT, reconnect, and another device.

### Phase 3 — World Pulse and Updates

1. Embed the existing daily story, leaderboard movement, and season facts.
2. Enforce the barbarian exclusion centrally before scoring/top-N selection.
3. Move changelog presentation into Updates and remove the competing
   standalone auto-overlay.
4. Add the compact World at a glance row, with responsive collapse behavior.

### Phase 4 — polish and calibration

1. Tune materiality thresholds and timeline caps from production metrics.
2. Evaluate a deliberate archive only if players need history beyond 24
   hours. It requires a separate bounded retention policy and schema; do not
   silently extend snapshot or log lifetimes.
3. Remove obsolete feed UI/state only after no live consumer depends on it.

## 7. Tests and release gates

Add tests beside each new module. At minimum cover:

- trailing-window cutoff, restart restore, hard cap, cap-hit metric, and
  exported-byte gauge for all rolling logs;
- exact aggregation for claimed/lost tiles, town and waystation outcomes,
  completed buildings, directional plunder, and material manpower thresholds;
- barbarian inclusion in personal history and exclusion from every World
  Pulse calculation and power-score list;
- waystation TECH exception, resource-slot effect, population amount, and
  no generic offline research-completion card;
- a player gone more than 24 hours receives the explicit truncation label;
- player names deleted/renamed after an event still render safely;
- unauthorized users cannot request another player's personal history;
- acknowledgement is idempotent, monotonic, season-scoped, and cannot skip
  future events;
- a dashboard Center action uses supplied coordinates; grouped activity picks
  a real event tile; no-coordinate cards have no Center button;
- responsive dashboard rendering, keyboard focus, Escape/backdrop behavior,
  reopening from the HUD, unread badges, and overlay priority;
- 2D and 3D Center navigation, plus both branches if a visual overlay is
  introduced;
- migration idempotence for new profile columns;
- existing waystation popup catch-up continues to work until intentionally
  replaced.

Every user-visible implementation phase adds a `CLIENT_CHANGELOG_ENTRIES`
entry with `createdAt: Date.now()`. Before opening the implementation PR,
run `pnpm lint`, `pnpm check:file-lines`, `pnpm build`, and `pnpm test`;
run the production-shape gate for changes to simulation persistence, runtime
combat, or checkpoint/export behavior.

## 8. Reference map

- `packages/client/src/client-alerts/client-alerts.ts` — current 18-entry,
  transient client feed and existing map-focus primitives.
- `packages/client/src/client-event-log-html.ts` — event-log-to-feed bridge
  and its current 24-hour backfill behavior.
- `packages/game-domain/src/index/index.ts` (lines ~109–161) — the bounded
  50-entry compatibility log (`PlayerEventLogEntry`/
  `appendPlayerEventLogEntry`/`PLAYER_EVENT_LOG_MAX_ENTRIES`); explicitly not
  the new activity-history backing store. Despite the name, there is no
  standalone `player-event-log.ts` source file — only a test file
  (`player-event-log.test.ts`) uses that name.
- `apps/simulation/src/territory-flip-log/` — durable 24-hour tile history
  source and aggregation style.
- `apps/simulation/src/combat-manpower-log/` — attack manpower source to
  extend with resolved plunder facts.
- `apps/simulation/src/activity-dashboard/activity-log-persistence.ts` —
  persistence/export/restore model and existing tail bound.
- `apps/simulation/src/runtime-waystation-activation.ts` — automatic
  waystation effects and their structured details.
- `apps/realtime-gateway/src/activity-api/daily-story.ts` — World Pulse
  source.
- `apps/realtime-gateway/src/sqlite-player-profile-store.ts` — idempotent
  profile-schema migration pattern.
- `packages/client/src/client-changelog/` — Updates-tab migration source.
- `docs/agents/state-and-persistence-discipline.md` — mandatory constraints
  for every log, persistence, and snapshot decision in this work.
- `packages/game-domain/src/personal-activity-timeline-types.ts` — Phase 0
  shared wire types (see §0). Extend `PersonalActivityCard` here for Phase 1
  plunder fields and Phase 2 waystation/town/building card kinds.
- `apps/simulation/src/personal-activity-aggregation/` — Phase 0 pure
  aggregation module; Phase 1 extends the orchestrator for plunder totals,
  Phase 2 adds a `personalImpacts` input once `personal-impact-log` exists.
- `apps/realtime-gateway/src/gateway-app/handle-activity-timeline-messages.ts`
  and `activity-timeline.integration.test.ts` — Phase 0's WS handlers and
  their real end-to-end gRPC/WS round-trip test; copy the integration-test
  pattern for Phase 1/2 additions rather than only mocking each layer.
- `apps/realtime-gateway/src/sim-client/sim-client-personal-activity-timeline.ts`
  and `apps/simulation/src/personal-activity-aggregation/personal-activity-timeline-rpc-handler.ts`
  — the `GetPersonalActivityTimeline` gRPC touch points, following the
  `GetActivityDashboard` template exactly (useful as the template for the
  Phase 2 personal-impact-log RPC too, if one turns out to be needed).

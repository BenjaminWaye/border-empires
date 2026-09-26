# Activity dashboard and 24-hour player history

Status: active proposal (Phase 0 shipped; later phases pending)

## 0. Status

**Phase 0 shipped** — [PR #2074](https://github.com/BenjaminWaye/border-empires/pull/2074),
merged into `develop`. No player-visible change (old Activity Feed and
`player-event-log` are untouched). What landed at Phase 0 completion:

- Shared wire types live in **`packages/game-domain/src/personal-activity-timeline-types.ts`**,
  not `packages/client-protocol` as §4.3 below originally suggested —
  `packages/client` doesn't depend on `client-protocol` at all, and
  `client-protocol` is dependency-free by design (can't import
  `game-domain`). `game-domain` is already depended on by `apps/simulation`,
  `apps/realtime-gateway`, and `packages/client`, matching the existing
  `ActivityDashboardSnapshot` precedent (`activity-dashboard-types.ts`) —
  re-exported via `packages/game-domain/src/index/index.ts`. Exports
  `PersonalActivityTimeline`, `PersonalActivityCard`, `PersonalActivitySummary`,
  and `PERSONAL_ACTIVITY_TIMELINE_CARD_CAP` (100). Phase 2 extended the card
  union with waystation activation, town capture/loss, and building-completion
  cards; it is no longer a combat-and-territory-only contract.
- Pure aggregation module: **`apps/simulation/src/personal-activity-aggregation/`**
  (`personal-activity-aggregation.ts` orchestrator +
  `personal-activity-territory-grouping.ts` + `personal-activity-combat-cards.ts`
  + `personal-activity-cap.ts` + `personal-activity-timeline-rpc-handler.ts`).
  `aggregatePersonalActivity(playerId, {from, to}, flips, combat)` already
  computes real `tilesClaimed`/`tilesLost`/`manpowerSpentAttacking` and
  groups territory flips into cards. Phase 1 subsequently replaced the
  original hardcoded gold totals with resolved plunder values. No
  `playerNames` parameter was threaded through: cards carry only stable IDs,
  so the client resolves renamed/deleted players from its current roster.
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
  Phase 1 made the Activity dashboard their first client consumer. It fetches
  once on the true first INIT and on manual dashboard open; it does not add a
  synchronous simulation round trip to login. The automatic briefing still
  uses a trailing-24-hour interval, so the longer-absence truncation wording
  in §4.2 remains a follow-up.
- `last_activity_seen_at`/`last_activity_seen_season_id` SQLite migration +
  monotonic, season-scoped `setActivitySeen` (`sqlite-player-profile-store.ts`,
  `player-profile-store.ts`). **No separate `getActivitySeen` method** —
  the existing `.get(playerId)` already returns these fields, so a
  dedicated getter would have been dead code.
- `INIT` carries the already-cached watermark as a new `activitySeen: {
  lastActivitySeenAt, lastActivitySeenSeasonId }` field
  (`gateway-app.ts`) — **deliberately no sim RPC added to the INIT/login
  path**, given this project's history of login-latency regressions from
  synchronous sim round-trips there. Phase 1 compares the fetched timeline's
  newest card with this watermark client-side to decide whether to auto-open.
- Payload-byte gauge: `gateway_activity_timeline_payload_bytes`
  (`apps/realtime-gateway/src/metrics/metrics.ts`).

**Phase 1 shipped** — [PR #2080](https://github.com/BenjaminWaye/border-empires/pull/2080),
merged into `develop` on 2026-09-22. It added exact settled-capture plunder
to `CombatManpowerLoss`, real `goldPlundered`/`goldRaidedFromYou` aggregation,
the Yours dashboard with Center actions and unread state, and a persistent
Activity HUD control. It deliberately kept the legacy Feed/Alerts panel in
place: `pushFeed` and `pushFeedEntry` have many mixed notification callers,
so removing it needs a dedicated migration rather than an unsafe bulk swap.

**Phase 2 shipped** — [PR #2077](https://github.com/BenjaminWaye/border-empires/pull/2077),
merged into `develop` on 2026-09-26. It added the durable, bounded personal
impact log; exact waystation, town, and completed-building outcomes; the
corresponding Yours cards and summary counts; and the mobile/escaping
regressions found in review.

**Phase 3 shipped** — [PR #2114](https://github.com/BenjaminWaye/border-empires/pull/2114),
merged into `develop` on 2026-09-26. It unified Yours, World Pulse, and
Updates in one Activity modal; added a bounded, player-safe World Pulse
projection; moved release notes out of their standalone overlay; and made the
dashboard reliably sit above the new-player checklist.

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

It contains no more than four facts. The rank arrow means movement since the
player last viewed World Pulse in this season; it is omitted on the first
view of a season rather than invented from a browser-session value. On small
screens it collapses to one line with an explicit expand control. Detailed
economy, technology, map controls, and the full leaderboard remain in their
dedicated UI.

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

### Phase 1 — personal combat and territory history ✅ shipped (PR #2080)

Phase 1 delivered territory gain/loss, raid loss, directional gold plunder,
material manpower spent, the Yours dashboard, Center actions, unread state,
and first-session auto-open. Barbarians are included in Yours. The remaining
24-hour truncation wording and Feed/Alerts consolidation are explicit
follow-ups, not hidden omissions.

### Phase 2 — durable milestone outcomes ✅ shipped (PR #2077)

Phase 2 delivered the bounded personal-impact log, restart persistence,
waystation activation details, town capture/loss cards, and building-completion
cards. It also delivered their timeline aggregation, Center behaviour, and
summary counts. The compatibility event-log/Alerts bridge remains deliberately
in place until a separate feed migration proves that its transient callers
have replacements.

### Phase 3 — World Pulse, Updates, and one dashboard shell ✅ shipped (PR #2114)

Phase 3 turned the Yours-only modal into the three-view Activity dashboard
promised in §1, without adding a simulation log or putting a collection into
snapshots. The subsections below are the retained implementation record and
acceptance contract for the shipped behaviour.

#### 3.1 Scope and player contract

- Add `YOURS`, `WORLD_PULSE`, and `UPDATES` as an explicit dashboard view
  union in the client activity-dashboard state. The HUD control opens the
  last selected view; an automatic return briefing always opens **Yours**.
- The dashboard modal gets one tablist, one dialog, and one close path. Tab
  changes do not refetch personal history, do not acknowledge it, and do not
  close the modal. Only rendering a received Yours timeline advances
  `last_activity_seen_at`.
- **World at a glance** appears above all three views. Initial content is a
  human-readable season label when one is available, current eligible-player
  rank, and the leading three powers (configurable cap of five). Do not turn
  an opaque internal season id into a misleading `Season 3` label; use
  `Current season` until the server supplies a presentation label.
- Store a player's last World Pulse rank and its season id in the existing
  profile store. The authenticated World Pulse response compares the current
  eligible-player rank with that prior value and then updates it. Render
  `↑2`, `↓1`, or no arrow only for the same season; omit the arrow on a first
  read or a season change. This is a low-frequency profile write triggered by
  opening/refreshing the dashboard, not a simulation hot-path write.
- This phase makes the dashboard the historical Activity surface, but it does
  **not** delete `pushFeed`/`pushFeedEntry`, action errors, or short-lived
  alerts. Those are a later, independently testable Feed/Alerts migration.

#### 3.2 Deliver a player-safe World Pulse projection

Keep `GET /api/activity` and its Slack/digest consumers intact. Reuse its
response builder behind a separate, one-value 45-second cache for the new
authenticated `REQUEST_WORLD_PULSE` WebSocket handler. The handler knows the
requesting player id, which is required for truthful rank and personal-story
suppression; a client-side fetch of the public route does not.

Add a compact `WorldPulse` shared type in `packages/game-domain` with only:

- `generatedAt`, optional `seasonLabel`, and the requester's eligible rank
  plus an optional rank delta;
- a top-three-to-five `leadingPowers` list of `{ playerId, name, score, rank }`;
- three-to-five `stories` of `{ type, headline, text, participantIds }`;
- no tile coordinates, map bounds, raw activity rows, or generic `unknown`
  payloads.

Build it in a pure `apps/realtime-gateway/src/activity-api/world-pulse.ts`
projection. Give `DailyStoryEvent` stable `participantIds` in addition to its
display-name list, and make deduplication use ids rather than names. Every
story builder must supply ids, including social events. This fixes both
same-name ambiguity and the existing inability to safely identify a player's
own story.

The projection must first remove barbarian-involving source rows, then run
significance ranking, deduplication, and top-N selection on the remaining
data. Filtering only the final DOM list is explicitly forbidden. In practice:

- remove barbarian power rows and territory/growth rows;
- discard wars, battles, toughest-target/fiercest-attacker records, alliances,
  and frontline hotspots with a barbarian participant rather than retaining a
  one-sided remnant of a barbarian fight;
- ensure the ranking and the player's own rank use the same eligible-player
  set; and
- never insert a barbarian item to pad a quiet digest.

Use the canonical barbarian player-id predicate/constants, not display-name
matching. This rule is deliberately limited to World Pulse: the existing
personal activity aggregation continues to report barbarian raids, plunder,
captures, and waystation consequences to affected players.

The World Pulse payload is text-only. Existing `DailyStoryEvent.text` can
contain coordinates for the public digest, so add a separately authored,
coordinate-free dashboard string for every story producer and use that string
only in `WorldPulse`. Do not strip coordinates with a regex. World Pulse has
no Center button in this phase, preventing both direct and narrative
fog-of-war leaks. Finally, remove stories containing the requesting player's
id: Yours already supplies that player's 24-hour history. A quiet eligible
world renders an honest empty state, not a barbarian fallback.

#### 3.3 Move What's New into Updates

Retain the existing changelog data, sorting, local `seenAt` storage key, and
escape/render helpers, but move its body into the dashboard's **Updates**
view. The old `#changelog-overlay` and standalone
`renderClientChangelogOverlay` stop rendering once the dashboard equivalent
has regression coverage; do not maintain two competing modals.

Startup priority becomes: profile setup first; then an unseen personal
briefing in Yours; then unseen release notes in Updates; then guide/checklist
and renderer prompts. Closing or reading Updates marks only the local
changelog marker. Opening World Pulse or Updates never acknowledges personal
activity. The HUD activity control exposes separate unobtrusive indicators
for personal activity and changelog updates rather than conflating their
watermarks.

Keep the guide/checklist functionally hidden while the dashboard is open and
also give the dashboard a strictly higher stacking level than the guide. The
current two overlays both use z-index 31; Phase 3 must make the relationship
explicit in their isolated styles (for example dashboard 32, guide 31), so a
future render-order regression cannot put a new-player checklist above a
briefing card or intercept a tab/Center control.

#### 3.4 Client composition and responsive behaviour

Split the new renderer into small modules below
`packages/client/src/client-activity-dashboard/`: tab/coordinator state,
World Pulse network handling, World at a glance formatting, and Updates body.
Keep the existing Yours formatter and Center module focused. The activity
dashboard stylesheet owns all new tabs and compact-summary styles; do not grow
the already-large shared `style.css`.

Desktop shows the full at-a-glance facts beside/above the tabs. Mobile shows
one bounded line and a labelled expand/collapse control for the remaining
facts, with the existing `box-sizing`, `min-width: 0`, and
`overflow-wrap:anywhere` guarantees preserved for names and scores. No new
map highlight is required, so renderer-parity work is not introduced by this
phase.

#### 3.5 Delivered implementation and verification

1. Added the shared World Pulse contract, profile-rank migration, pure
   projection tests, and a 45-second one-value gateway cache.
2. Added the authenticated request/response handler while preserving the
   public `/api/activity` contract and its digest consumers.
3. Added the tab shell, at-a-glance rank/powers strip, World Pulse
   loading/quiet states, and coordinate-free story rendering.
4. Moved changelog body and seen-state into Updates, removed the standalone
   overlay DOM/HUD composition, and gave the dashboard z-index 32 above the
   guide at 31. Desktop shows all at-a-glance facts; mobile has an explicit
   “Show leading powers” disclosure.
5. Added the required `CLIENT_CHANGELOG_ENTRIES` entry and ran the full
   workspace test, build, lint, file-limit, and changelog checks.

Phase 3 verification proves all of the following:

- every barbarian-bearing input is excluded **before** World Pulse ranking,
  story selection, and leading-power/rank calculation, while the equivalent
  barbarian event still appears in Yours;
- same display names cannot cause an incorrect personal-story suppression;
- World Pulse sends no coordinates and its authored text contains none;
- a first read and a new season show no rank arrow, while a later eligible
  rank change yields the correct signed delta;
- a quiet non-barbarian world has a useful empty state rather than synthetic
  activity;
- `/api/activity` cache behaviour and daily Slack digest output remain
  compatible;
- opening Updates cannot mark Yours read, and the inverse cannot mark the
  changelog seen; automatic opening follows the stated priority; and
- mobile collapse, Escape/backdrop close, focusable tabs, and lower-z-index
  checklist behaviour all remain correct.

World Pulse response bytes are gauged at the gateway boundary and tests assert
the leading-power cap. It remains a derived, cache-backed response: no new
simulation persistence, player-event log, or per-tile reveal tracking was
introduced.

### Phase 4 — polish and calibration

1. Tune materiality thresholds and timeline caps from production metrics.
2. Evaluate a deliberate archive only if players need history beyond 24
   hours. It requires a separate bounded retention policy and schema; do not
   silently extend snapshot or log lifetimes.
3. Finish the Feed/Alerts migration only after an inventory proves every live
   `pushFeed`/`pushFeedEntry` consumer has an equivalent transient alert or
   durable dashboard card. Do not erase action errors or attack alerts while
   doing this.
4. If testing shows players miss release-note state before opening Activity,
   add a distinct, non-numeric Updates indicator to the Activity HUD button;
   keep it separate from the personal-timeline unread count.

#### Phase 4a — production-metrics calibration pass (2026-09-26)

**Evidence at the start of this pass.** PR #2114 (`feat: unify the Activity
dashboard`) was still open against `develop`, so this pass must not depend on
its client surface or change user-facing thresholds. The rewrite stack already
has bounded source gauges: `territory-flip-log.ts`, `combat-manpower-log.ts`,
and `personal-impact-log.ts` each expose `entryCount`, timestamps, and
`capHits`; `personal-activity-cap.ts` produces an explicit truncation-note
card; and the gateway already samples serialized personal-timeline bytes at
the websocket boundary. Before this pass, those log gauges were not exported
through simulation Prometheus metrics, the gateway did not measure timeline
cardinality/truncation, and the `GET /api/activity` response used as the World
Pulse source had no payload-byte metric.

**Smallest safe implementation.** Land the following instrumentation without
changing the 24-hour window, `PERSONAL_ACTIVITY_TIMELINE_CARD_CAP`, daily-story
ranking, or any materiality threshold:

- `apps/simulation/src/metrics/metrics-activity-logs.ts` owns exactly four
  scalar values; `simulation-service.ts` samples the already-bounded log
  gauges once per metrics tick. Export `sim_territory_flip_log_entries`,
  `sim_combat_manpower_log_entries`, `sim_personal_impact_log_entries`, and
  `sim_personal_impact_log_cap_hits_total`. The final value is a counter from
  the personal-impact hard-cap guard, not a new event log.
- `apps/realtime-gateway/src/gateway-app/handle-activity-timeline-messages.ts`
  records the existing serialized response bytes plus card count and whether
  the response says `truncated`. Export gateway samples as
  `gateway_activity_timeline_payload_bytes` and
  `gateway_activity_timeline_card_count` (p50/p95/p99), plus
  `gateway_activity_timeline_truncated_total`.
- `apps/realtime-gateway/src/activity-api/activity-api-route.ts` records the
  UTF-8 JSON byte size only when it builds a fresh cached `GET /api/activity`
  response. Export it as `gateway_world_pulse_payload_bytes` (p50/p95/p99).
  This is the current World Pulse source response; cache hits intentionally do
  not distort the producer-size sample.

All gateway quantiles retain only the existing fixed-size sample arrays. The
simulation change retains four numbers only. No metric has a player id,
coordinates, activity-card content, snapshot payload, or per-player map;
nothing changes persistence or adds snapshot state. This keeps barbarian
handling unchanged: their events remain eligible for Yours, while World Pulse
continues to apply its existing pre-ranking exclusion. World Pulse remains
text-only, and this pass does not affect checklist layering, Feed/Alerts,
`pushFeed`/`pushFeedEntry`, action errors, or attack alerts.

**Regression coverage.** Add/update tests in
`apps/simulation/src/metrics/metrics.test.ts`,
`apps/realtime-gateway/src/metrics/metrics.test.ts`,
`apps/realtime-gateway/src/gateway-app/handle-activity-timeline-messages.test.ts`,
and `apps/realtime-gateway/src/activity-api/activity-api-route.test.ts` to
prove each metric is emitted, a non-truncated timeline does not increment the
counter, a truncated one does, and cached World Pulse responses do not add a
second source-size sample. Existing log tests remain the regression coverage
for TTL/cap behavior.

**Rollout and calibration criteria.** Deploy this metrics-only change through
the normal rewrite-stack staging path and observe at least seven days (or a
full representative high-activity weekend) before changing thresholds. Keep
the current cap if timeline-card p95 stays comfortably below it and truncation
is absent or rare; investigate grouping/materiality before raising a cap when
truncation rises. Treat any personal-impact cap hit as a correctness and
retention incident: inspect named producers first, then revise the explicit
cap only with measured rate and memory/export-size evidence. Choose any new
materiality threshold only after comparing card-count/payload p95 and player
feedback against the current fixed rule; do not derive thresholds from a
global average. Keep World Pulse byte p95 bounded relative to the existing
activity endpoint budget before adding entries or fields.

**Rollback.** These metrics are observational and do not gate gameplay. If
they produce meaningful CPU, memory, or scrape noise, revert this commit (or
remove the three gateway observations and four simulation exposition lines);
the dashboard behavior, log caps, persistence, and client contracts remain
unchanged. Do not respond by disabling the existing hard caps or extending
retention.

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
  source. Phase 3 adds stable participant ids and coordinate-free dashboard
  copy here rather than attempting to infer either from prose.
- `apps/realtime-gateway/src/activity-api/activity-api-response.ts`,
  `activity-api-route.ts`, and `activity-api-cache.ts` — the existing builder
  and bounded-cache pattern reused for the authenticated World Pulse request.
- `apps/realtime-gateway/src/activity-api/world-pulse.ts` — planned pure,
  barbarian-filtered, player-aware projection. It is intentionally a gateway
  projection rather than another simulation history log.
- `apps/realtime-gateway/src/sqlite-player-profile-store.ts` — idempotent
  profile-schema migration pattern; Phase 3's per-season World Pulse rank
  baseline belongs here.
- `packages/client/src/client-changelog/` — Updates-tab migration source.
- `packages/client/src/client-activity-dashboard/` and
  `client-activity-dashboard-style.css` — current Yours-only modal and the
  isolated, mobile-safe style home to extend for tabs and World at a glance.
- `packages/client/src/client-guide-overlay.ts` — functional overlay priority
  check; pair it with an explicit lower stacking layer than the dashboard.
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

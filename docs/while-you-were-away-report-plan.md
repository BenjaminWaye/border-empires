# "While You Were Away" Report — Implementation Plan

> **Status:** Plan, not yet built. Scope is a two-part return surface shown
> when a player opens the game: **(1) a personal, aggregated report** of what
> happened to them and what they accomplished while offline, each line
> centering the map on where it happened, and **(2) a world digest** of what
> happened everywhere else.
>
> Origin: this is the concrete form of the "what happened while I was asleep"
> hook identified in `docs/opening-experience-exploration-brief.md` §5.2–5.3.
> Read that section first for why this is the retention mechanic worth
> building rather than an "inventory screen".

---

## 1. Headline: most of the data already exists

Two **durable, bounded, 24h-rolling** logs already record everything the
personal combat half of this report needs. Neither requires new sim
instrumentation.

| Log | Record shape | Gives us |
|---|---|---|
| `territory-flip-log` | `{ tileId, x, y, fromOwner, toOwner, at }` | Filter `fromOwner === me` → **tiles lost**, grouped by `toOwner` → **"X took 7 tiles from you"**, with x/y for centering. Filter `toOwner === me` → tiles gained. |
| `combat-manpower-log` | `{ attackerId, defenderId, attackerWon, manpowerLoss, x, y, at }` | Filter `defenderId === me` → **who attacked you, how hard, where, and whether they won**. |

Both are persisted across restarts on the season-summary cadence
(`activity-dashboard/activity-log-persistence.ts`), bounded at 50,000
entries in memory with a 5,000-entry persisted tail, and already gauged.
Real prod traffic is hundreds of entries per 24h, so the whole window fits
comfortably.

**Barbarian attacks populate these too.** `recordCombatManpowerLoss` fires
from the shared lock-resolution path with `attackerId = lock.playerId`
(`runtime-combat-support.ts:305-313`), and barbarians attack through that
same path. So the report has content even at today's low player density —
it is not blocked on the density work in the opening brief's §4.1, though
its *ceiling* still is (see §7).

Three more existing pieces to reuse rather than rebuild:

- **`buildDailyStory`** (`activity-api/daily-story.ts`) already produces the
  world digest: `OPEN_WAR`, `BIGGEST_DEFEAT`, `BLOODIEST_BATTLE`,
  `FIERCEST_ATTACKER`, `TOUGHEST_TARGET`, `ALLIANCE_FORMED`,
  `ALLIANCE_BROKEN`, `FASTEST_EXPANSION`, `STRONGEST_EMPIRE` — ranked by a
  cross-metric significance scale calibrated against real prod output
  (`daily-story-significance.ts`). It currently goes only to Slack.
- **The per-player event channel** (`PlayerEventLogEntry` →
  `client-event-log-html.ts`) already carries server-pushed entries with
  optional `x`/`y`, and already folds into the Activity Feed.
- **The "go to tile" primitive** exists: feed entries carry
  `focusX`/`focusY` with `actionLabel: "Go to tile"`
  (`client-alerts.ts:152-155`), and `client-capture-effects.ts` has a Center
  button. Centering is a solved interaction, not new work.

## 2. What is actually missing

1. **No durable `lastSeenAt`**, so there is no away window. The only
   disconnect timestamp is in-memory in
   `runtime-waypoint-drain-scheduler.ts` and is cleared on reconnect.
2. **No aggregation layer.** Both logs are per-event. The report wants
   "Osmond took 7 tiles from you", not seven lines.
3. **No `TILE_LOST` event type.** `PlayerEventLogEntryType` has `TOWN_LOST`
   but nothing for ordinary tiles — though see §4, which argues the report
   should *not* be built on the event log at all.
4. **No build-completion instrumentation** anywhere. "You built 3
   farmsteads" has no source today.
5. **No server-side "revealed while away" source.** "You discovered a town"
   would need the visibility-coverage tracker to record reveals, which it
   does not.
6. **The daily story is not player-scoped or player-delivered.**

## 3. The window problem — decide this first

The logs are **24h rolling**. An away window can be longer. A player gone
three days would get a silently truncated report presented as complete.

**Recommendation: cap the report at 24h and label it honestly** — "Since
yesterday" rather than "While you were away", with a line like *"You've been
away 3 days — showing the last 24 hours"* when the gap exceeds the window.

Why not persist a per-player summary at disconnect instead:

- It keeps the feature entirely on existing bounded, gauged, already-
  persisted infrastructure.
- `docs/agents/state-and-persistence-discipline.md` is explicit that
  snapshots carry state, not logs, and that every growable structure needs
  its own hard bound and a gauge. A per-player, per-session report blob is a
  new growable structure on the persistence path, which is exactly the shape
  that caused the PR #615 checkpoint freeze.
- It matches the game's own cadence assumption: manpower regen and offline
  yield accrual are tuned for twice-a-day play, and `OFFLINE_YIELD_ACCUM_MAX_MS`
  already caps accrual at 12h. A 24h report window is consistent with
  systems that already stop rewarding longer absences.
- A player gone three days does not want a three-day diary; they want to
  know where they stand now.

## 4. Architectural constraint: derive, don't store

**Do not grow `player.eventLog` into this feature.** It is a 50-entry ring
buffer living on the player object (`PLAYER_EVENT_LOG_MAX_ENTRIES = 50`)
that is serialized into every player snapshot
(`runtime-snapshot-sections.ts`, `player-snapshot.ts`,
`runtime-state-export.ts`). It is already at the edge of what the
persistence-discipline doc permits, and it is the wrong substrate for a
report that wants grouping, counts and centroids.

Build the report as a **read-time aggregation** over the two existing logs,
computed on demand for one player over one window, returning a bounded
summary. Nothing new is written on the sim's hot path, and nothing new
enters a snapshot.

The logs live in the simulation; the existing activity dashboard already
crosses to the gateway by RPC
(`activity-dashboard/activity-dashboard-rpc-handler.ts`). Follow that path
rather than inventing a second one.

## 5. Phased build order

### Phase 1 — Personal combat report *(no new instrumentation)*

The emotionally load-bearing half, and the cheapest.

1. Add `last_seen_at` to `player_profiles`. The store has a clean
   `ALTER TABLE ... ADD COLUMN` migration pattern already used for six
   columns (`sqlite-player-profile-store.ts:65-95`). Write it on disconnect
   and on session end.
2. Add a sim-side aggregator: `(playerId, sinceMs, nowMs)` → a bounded
   summary built by scanning both logs once:
   - **Attacked by X** — group `combat-manpower-log` entries with
     `defenderId === me` by `attackerId`: attack count, manpower lost,
     win/loss split, and a centroid (or bounding box) of the x/y values.
   - **Tiles lost to X** — group `territory-flip-log` entries with
     `fromOwner === me` by `toOwner`, with the same centroid.
   - **Tiles gained** — the `toOwner === me` mirror, which covers offline
     waypoint-drain and auto-settle results for free.
   Cap the group count and label the remainder ("and 3 others") so the
   payload is bounded by construction.
3. Expose it over the existing activity RPC path, attached to INIT (so the
   panel can render on load without a second round trip).
4. Client: a "Since yesterday" panel on load, one line per group, each with
   the existing Go-to-tile/Center affordance pointed at the group centroid.

**Centroid vs bounding box** is a real UX decision worth prototyping: a
centroid of two widely separated raids centers on empty ground between them.
Prefer a bounding box the camera fits, or center on the *largest* cluster
and note the rest.

### Phase 2 — World digest *(re-aim existing output)*

Render `buildDailyStory`'s ranked events beneath the personal section, as
"Elsewhere in the world". The generator, the significance ranking and the
calibration already exist; this is a delivery change, not a feature.

Two things to decide: how many events to show (the Slack digest shows all,
plus a top-3 power score — three to five is probably right in-client), and
whether to suppress events the player was personally part of, since those
already appear above.

### Phase 3 — Your own actions *(needs new instrumentation)*

"You built 3 farmsteads", "you discovered 2 towns". Deliberately last:

- It is the least emotionally load-bearing content. "X took 7 tiles from
  you" is news; "you built 3 farmsteads" is a receipt.
- It is the most invasive. Builds need a completion hook that does not exist,
  and discoveries need the visibility-coverage tracker to start recording
  reveals — a new write on a genuinely hot path. Re-read
  `state-and-persistence-discipline.md`'s "a broad chokepoint must not apply
  a policy to everything by default" before adding either.
- Tiles gained (Phase 1, step 2) already covers the most interesting part of
  "what did my plans accomplish" at zero cost.

If a cheap version of "you discovered towns" is wanted sooner, the
discovery-tip system (`client-discovery-tips.ts`, already has a `TOWN` tip
and server-synced dismissal state) is a closer starting point than the
visibility tracker.

## 6. Test and gate checklist

- Aggregator unit tests beside the module (repo convention: no flat test
  files under `src/` roots) covering: empty window, window longer than the
  log's 24h retention, a player with no losses, group-count capping, and
  barbarian attackers rendering with a sensible name rather than a raw
  `barbarian-*` id.
- A regression test for the truncation label — a >24h gap must not present a
  24h report as complete.
- `last_seen_at` migration must be idempotent, matching the existing
  `ADD COLUMN` guards.
- Gauge the aggregator's output size; the persistence-discipline doc's rule
  is to gauge anything whose size depends on load *before* it causes an
  incident.
- This is user-visible, so it needs a `CLIENT_CHANGELOG_ENTRIES` entry in
  the same branch (AGENTS.md changelog gate).

## 7. The honest caveat

The report's ceiling is set by how much happens to a player. At five
maximally-dispersed AI, most players most days will see "quiet day" for the
PvP half — the same density ceiling the opening brief's §4.1 describes.
Barbarian activity keeps it from being empty, and Phase 1's tiles-gained
line gives every player something, but a report is a mirror: it is only as
interesting as the world it reflects.

That is an argument for building it *alongside* the density work, not
instead of it — and it is also why Phase 1 is scoped to reuse existing logs
rather than justify new instrumentation on traffic that does not yet exist.

## 8. Reference map

- `apps/simulation/src/territory-flip-log/territory-flip-log.ts` — `TerritoryFlip`, the tiles-lost/gained source.
- `apps/simulation/src/combat-manpower-log/combat-manpower-log.ts` — `CombatManpowerLoss`, the attacked-by source.
- `apps/simulation/src/runtime-combat-support.ts:305-313` — the single record site, shared by player and barbarian attacks.
- `apps/simulation/src/activity-dashboard/activity-log-persistence.ts` — how both logs survive restarts, and the bounding rationale to follow.
- `apps/realtime-gateway/src/activity-api/daily-story.ts` + `daily-story-significance.ts` — the Phase 2 world digest, already built and calibrated.
- `apps/realtime-gateway/src/sqlite-player-profile-store.ts:55-95` — the `ADD COLUMN` migration pattern for `last_seen_at`.
- `packages/game-domain/src/index/player-event-log.ts` — the existing 50-entry per-player ring buffer, and why §4 says not to build on it.
- `packages/client/src/client-alerts/client-alerts.ts:152-155` — the existing `focusX`/`focusY` "Go to tile" affordance to reuse.
- `packages/client/src/client-waystation-activation/client-waystation-activation-catchup.ts` — the precedent for rendering a rich catch-up view of something missed while offline.
- `docs/agents/state-and-persistence-discipline.md` — mandatory read before Phase 3.
- `docs/opening-experience-exploration-brief.md` §5 — why this feature is the hook worth building.
- `docs/opening-and-retention-roadmap.md` — where this feature sits in the overall build order (it is Phase 2).

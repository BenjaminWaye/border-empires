# Explore: Scout Drones — Design Proposal

Status: implemented (2026-11-14); see §12 for what differs from this design

> **Status:** Design agreed with the owner on 2026-11-14 and built the same
> day. The live rules are in `docs/game-mechanics.md` (Explore, §1). Numbers
> marked *(tunable)* are starting values for a playtest, not settled balance.

## 1. Summary

Tapping an unexplored tile shows an **Explore** button instead of Expand To.
Explore launches a **scout drone** from the player's AFC. The drone flies
toward the tapped tile, reveals the land along its path, claims nothing, and
flies home. When it lands it files a **scout report** listing what it found.

The first version is free. The player can have only one drone in the air at
a time.

## 2. Why

- **Scout is the first of the five player verbs, but it has no action.**
  `docs/core-loop.md` §0 lists Scout as verb 1. Today vision comes only from
  ownership and structures: radius 1 around the reach border, plus
  watchtowers, waystations, beacons, observatories and Survey Sweep, which
  spends an Aether Tower shot. The player never chooses to look somewhere.
- **Expand To is used as a paid peek.** Expand To into unexplored land costs
  manpower (10 MP and up, `expandManpowerCostForFrontierCount`) and 7.5s per
  tile (`FRONTIER_CLAIM_MS`). Unless the path ends on a town or dock, those
  tiles decay after 5 minutes (`docs/core-loop.md` §2). Part of that spending
  is really a scouting tax, and the decaying tiles flash on neighbours' maps.
  *(Hypothesis: the share of Expand To claims that decay can be measured in
  PostHog before and after launch.)*
- **The opening has a step with no button.** The new-player checklist starts
  "find a town → Expand To it → find food → Expand To 4 food slots"
  (`docs/core-loop.md` §8). Explore gives "find" an action.
- **It fits the visit rhythm.** A launch, a short wait and a report match the
  report → act → seal orders shape in `docs/visit-as-a-turn.md`.
- **The game already moved this way once.** Tapping an unexplored tile that
  doesn't touch the player's land shows March To instead of Expand To, because
  "the player wants to explore that way, not claim that exact tile"
  (`docs/game-mechanics.md`, March To on an unexplored tile). Explore finishes
  that split without needing a war flag.

## 3. Rules

| Rule | Decision |
|---|---|
| Button | **Explore** replaces Expand To and March To on **every** unexplored tile, including one touching the player's land |
| Launch point | The player's AFC (nearest one if they hold several) |
| Drones | One in the air per player *(tunable; a tech could raise it)* |
| Cost | **Free** in the first version |
| Speed | Same pace as Expand To: 7.5s per tile, ×1.5 over forest or hills *(tunable)* |
| Range | Up to **15 tiles beyond the player's reach border** *(tunable)*. The flight to the border over owned land doesn't count |
| Path | Straight line to the target, cut short at maximum range or at a blocking border, then straight back |
| Vision | **Radius 3** around the drone while it flies *(tunable; radius 5 is a candidate tech or domain upgrade)* |
| Claims | None. No FRONTIER, no capture, no waystation reward |
| Can fly over | Sea, neutral land, Planetary Defense (barbarian) land, own land, allied land |
| Turned back by | Land of any player who is not an ally |
| Interception | None. The drone can't be attacked or destroyed |
| After it passes | Tiles fall back to remembered fog, exactly as other temporary vision does |
| Queueing | Manual launches only in the first version (see §9) |

### 3.1 Flight

1. The player taps an unexplored tile. Its menu shows a single **Explore**
   button. If the drone is already out, the button is disabled with the time
   until it is back.
2. The server works out the path: a straight line from the launch point,
   stopping at the target, at the range limit or one tile before the first
   blocking tile.
3. The drone moves one tile per step at Expand To pace. Each step it adds
   radius-3 vision around itself.
4. At the end of the path it turns around and flies straight home, still
   revealing. It is available again on landing.

A 15-tile trip past the border takes roughly 2 minutes out and 2 minutes
back, plus the time to cross the player's own land.

### 3.2 Blocking at rival borders

The drone stops when its next tile belongs to a player who is not an ally.
With radius-3 vision it still shows the first three rows of that land. That
player gets the **foreign scouts sighted** alert (§5).

### 3.3 Planetary Defense

Planetary Defense tiles act only while some player can see them
(`runtime-barb-activation-vision.ts`). Drone vision counts as normal player
vision, so tiles under the flight path wake for as long as the drone sees
them, typically 30–45 seconds. With a 15s rest after each action
(`BARBARIAN_TILE_REST_MS`) that is one or two moves per tile, usually a walk
into neutral land. Once the drone moves on they stop again. No new sleep rule
is needed.

This makes scouting near Planetary Defense almost risk-free. If playtests
show scouting should carry risk, the change would be a linger rule (tiles stay
awake for some minutes after being seen). That is out of scope here.

## 4. Scout report

Showing discoveries only as revealed map isn't enough: the player would have
to hunt for what changed. On landing the drone files a report.

- It lists only what matters: towns, docks, waystations, watchtowers,
  resource tiles by type, Planetary Defense tiles and rival borders. For
  example: *"Scout returned: 1 town, 1 dock, 2 waystations, 4 food tiles,
  Planetary Defense (6 tiles)."*
- Each line can be tapped to move the camera there. A town or dock line
  offers its next action, such as *"Expand To path: 5 tiles, 50 MP"*.
- It appears in the Activity dashboard (`docs/activity-dashboard-plan.md`),
  so a player who launched and logged off sees it on their next visit.
- A report naming a town or dock can feed the existing email or push alerts.

### 4.1 Offline

The flight runs on the server and completes whether the player is online or
not. Remembered fog keeps the last-seen state of what the drone passed over,
the report waits in the Activity dashboard, and Planetary Defense and rival
alerts happen as normal.

## 5. Rival alert

When a drone is turned back at a player's border, that player gets
*"Foreign scouts sighted near (x, y)"*, naming the scouting empire. This
happens whether the player is online or not, at most once per scouting empire
per border area per hour *(tunable)* so repeated flights don't spam.

## 6. Effects on other actions

### 6.1 Expand To

Expand To no longer works on unexplored tiles. It still works on visible and
fogged (previously seen) tiles, including the path out to a town or dock past
the reach edge. Reaching an unseen town is now two steps: Explore, then
Expand To the path the report offers.

### 6.2 March To and March Attack

- The unexplored-tile March To menu
  (`packages/client/src/client-march-origin-picking/`) is replaced by Explore.
- **A march target must have been seen at least once**, live or as
  remembered fog. A player can't attack what they have never seen.
- Route measuring may keep treating unexplored tiles as passable
  (`client-march-route.ts`). Only the target needs to have been seen.
- To march deep into rival land, the player scouts to the border (which shows
  the first rows), captures forward (each capture reveals more), or uses the
  existing tools: Survey Sweep, Reveal Empire Stats and observatories.

### 6.3 Onboarding

The checklist goal "find a town" points at Explore. The tutorial step that
reaches the first town can open with a drone launch, so a new player sees the
verb in their first minutes.

### 6.4 AI

AI empires should use Explore in place of any Expand To they make only to
reveal land (see `apps/simulation/src/ai/direct-frontier-planner.ts`). This is
wanted but not required for launch (`docs/core-loop.md` §1.1). Read
`docs/agents/ai-guardrails.md` before changing the planner.

## 7. Fiction

The AFC already sends **courier drones** from its crown to carry parts to
building sites (`docs/lore/galactic-lore.md` §12, "AFCs as industrial seeds").
A scout drone is one of those drones sent out with sensors instead of a crate
pod. That explains why it launches from the AFC, why it can cross the sea, and
why it costs nothing extra in the first version: the House already has the
drones.

Turning back at a rival's border fits the existing description of reach as a
House's local control field (§10). A rival's field would jam the drone's link.
Planetary Defense has no such field, so drones can fly over it.

This is a proposal. The world bible gets its canon text when the feature is
built, in the same branch (`docs/lore/README.md`). §14 there records the open
question meanwhile.

## 8. Pillar change

The owner has decided to drop pillar 1, "Territory is the unit. There are no
unit pieces" (`docs/core-loop.md` §1). Muster flags already move manpower
across the map, and the scout drone is another moving piece. The concern the
pillar protected stays as a guardrail:

> **No babysitting.** Anything that moves on the map runs on its own once
> ordered. Nothing needs attention between visits.

The drone meets it: launch, fly, return, report.

## 9. Open questions

| Question | Note |
|---|---|
| Should players be able to queue several targets? | Fits "seal orders, then come back", but reveals much more map per day. Decide after measuring free manual scouting |
| Cost if free reveals too much | Options: a cooldown between launches, or a small manpower cost per launch (not per tile) |
| A House with no AFC | Launch from the capital town instead, or no scouting until a replacement AFC lands (`docs/afc-recovery-plan.md`) |
| Can the drone see into fogged land it passes, or only unexplored land? | Proposed: it gives normal live vision everywhere it flies |
| Does Explore need a tech? | Proposed: available from the start, since it replaces part of Expand To |
| Allied scouting | Should a drone's vision be shared with allies the way other vision is? Proposed: yes, as normal allied vision |

## 10. Work list

Read `docs/agents/state-and-persistence-discipline.md` before adding the
mission state, and `docs/agents/implementation-rules.md` before source work.

1. **Shared rules** (`packages/shared`): drone constants (range, vision,
   pace), the path function including the blocking rule, and a predicate for
   "tile has been seen".
2. **Simulation** (`apps/simulation`): an EXPLORE command, a per-player
   mission record saved in snapshots and reloaded after restart, step-by-step
   movement, temporary vision feeding fog and barbarian activation
   (`reach-border-vision.ts`, `runtime-barb-activation-vision.ts`), the
   rival alert, and the report on landing.
3. **Protocols** (`packages/sim-protocol`, `packages/client-protocol`): the
   command, mission state for the owner, the report and the alert.
4. **Gateway** (`apps/realtime-gateway`): relay the command, mission state,
   report and alert.
5. **Expand To and March changes**: reject Expand To on unexplored tiles on
   the server and the client; require a seen target for March To and March
   Attack; replace the unexplored-tile menu
   (`client-tile-interaction.ts`, `client-march-origin-picking/`).
6. **Client**: the Explore button and its disabled state, the drone and its
   path, and the reveal, in **both** the 2D canvas and true-3D renderers
   (guarded by `isTrue3DRendererActive()`); the report in the Activity
   dashboard; the rival alert in the feed.
7. **Onboarding**: checklist and tutorial copy.
8. **AI**: use Explore instead of reveal-only Expand To.
9. **Docs and lore**: `docs/game-mechanics.md` (fog, Expand To, March To),
   `docs/core-loop.md` (§0 Scout verb, §1 pillar, §3 verbs, §8 onboarding),
   world bible §12 and §14.
10. **Changelog**: a `CLIENT_CHANGELOG_ENTRIES` entry.
11. **Tests**: path and blocking rules, persistence across restart, vision
    expiry, barbarian wake and sleep, Expand To rejection on unexplored tiles,
    March target rule, alert rate limit, and both renderers.

## 11. What to measure after launch

- Tiles revealed per player per day, compared with before. If free scouting
  reveals too much, add a cooldown or cost (§9).
- Share of Expand To claims that decay. It should fall.
- Time from first login to first town claimed. It should fall.
- How many launches end at a rival border, and how often the alert leads to a
  response (fort, flag) from the scouted player.

## 12. As built

What shipped, and where it differs from the sections above:

- **Shared rules**: `packages/shared/src/scout-drone/scout-drone.ts` holds the
  constants, the flight planner (`planScoutDroneFlight`) and the payloads, so
  the client draws exactly the flight the server runs.
- **Server**: `apps/simulation/src/scout-drone/`. The drone launches from the
  AFC **nearest the target**. Own and allied land is crossed at 1s per tile
  (up to 80 tiles) so a large empire's drone doesn't spend minutes reaching
  its border; only tiles past that land count toward the 15-tile range and
  take Expand To's 7.5s. Its vision is a temporary reveal moved tile by tile,
  so fog and Planetary Defense wake-up needed no new rule.
- **Restarts dock the drone.** Flights live only in simulation memory, not in
  snapshots (§10 had planned a saved mission record). A flight lasts minutes
  and costs nothing, so a restart loses at most one trip. Its report is lost
  with it; reports already filed are kept with the Activity log.
- **"Unexplored" is a client rule.** The server keeps no per-player record of
  which tiles a player has ever seen, so it accepts EXPLORE toward any tile and
  cannot refuse Expand To or a march toward unexplored ground on that basis.
  The client offers only Explore on unexplored tiles.
- **Rival alert**: a `SCOUT_SIGHTED` player message plus a "scouts sighted"
  Activity card, so an offline rival still sees it.
- **Client**: every unexplored tile, including one next to the player's
  land, offers only Explore. The drone is drawn in both renderers
  (`client-map-3d-scout-drone/`, `client-map-render-2d-scout-drone/`) and the
  report and rival alert reach the feed and the Activity dashboard. Storybook:
  `packages/storybook/src/map/overlays/ScoutDrone*.stories.ts`.
- **Not built yet**: AI empires don't launch drones (§6.4), there is no
  queueing (§9), and allied vision sharing of the drone was not added. The
  client doesn't check for an AFC before offering Explore; the server answers
  `SCOUT_NO_AFC`. The old unexplored-tile March To pick-origin code
  (`client-march-origin-picking/`) is now unreachable and can be removed.


# Muster Fronts — Commit Rule + Shield Flags (proposal)

> **Status:** Proposal agreed in design discussion (2026-09-23), not yet built.
> Part of the replenishment update (`docs/replenishment-update-plan.md`).
> Builds on the live muster system (`apps/simulation/src/runtime-muster-tick/`).

## 1. Problems it solves

1. A muster flag should express **"how much do I invest in pushing this
   direction"**.
2. **My flag should be able to counter another player's flag.** Today flags
   never interact. The only counter is capturing the flag's tile, which already
   destroys the manpower on it (`runtime-lock-resolution.ts`).
3. **Every tile stays its own battle**, with today's animation.
4. **No shared global tick.** Everything resolves continuously.
5. **Defense works while the defender is offline.**

## 2. How muster works today (verified in code)

- Modes: `HOLD`, `ADVANCE` (nearest enemy tile within 10 BFS hops), `MARCH`
  (steers to a target, and can also EXPAND onto neutral tiles inside reach).
  See `MusterState` in `packages/shared/src/muster-state.ts`.
- A flag fills from the player's pool at `MUSTER_BASE_RATE_PER_MIN` (180/min),
  split across that player's active flags and boosted by depots. The flag's cap
  is `musterFlagCap`: 10% of the manpower cap (at most 150), plus "Expand
  Capacity" upgrades (free today). Base limit of 2 flags (`MUSTER_MAX_TILES`). Flags go stale
  after 2 days and are refunded.
- Each attack deducts the **full** required amount from the flag
  (`consumeOriginMuster`, amount = `requiredMusterForTarget`: 10 for barbarians,
  15 for enemy FRONTIER, then the fort ladder's maximum of 60 / 150 / 300 / 480 /
  960). Up to 3 attacks per flag can be in flight at once
  (`MUSTER_MAX_CONCURRENT_ACTIONS`).
- Win chance = atk² / (atk² + def²) (`frontier-combat.ts`).

## 3. The commit rule (single attacks and flags)

- **Committed MP is always lost**, win or lose. The random 40–60 loss range
  becomes a fixed cost equal to what was committed.
- **Commitment is counted in multiples of the target's base cost:**
  `odds = (commit / base)² × base_odds`, so 2× base gives the same boost on any
  target.
- **Base costs are the existing attack-muster ladder:** settled **60**,
  Palisade 150, Fort 300, Titanium Bastion 480, Thunder Bastion 960
  (`requiredMusterForFort`). 1× gives today's win chance. (The simulation below
  uses 30 for a settled tile; only the ratio matters there.)
- **No cap.** Committing 10,000 MP is a huge loss if it fails, but buying speed
  is a legitimate choice.
- **Rule of thumb for players:** "match their defense". The cheapest point per
  tile taken is about a 50–55% win chance. Committing more buys certainty and
  speed at a higher cost per tile.

## 4. Shield flags (the chosen design)

- **Defend mode (today's HOLD) shields an area**, e.g. Chebyshev radius 3 around
  the flag.
- In every battle inside that area, the shield **matches the attacker's
  commitment** automatically (up to what it holds). Defense factor =
  `1 + shield_commit / base`. **Both sides pay** what they committed.
- **Extra shield beyond the attacker's commitment adds nothing.** Matching is
  enough, which keeps defense cheap to understand.
- Attacking straight into a full shield is poor value (about 14% per battle), so
  the smart play is to **attack the shield flag's own tile**. Capturing it
  destroys the manpower on it, as today. Flanking becomes real tactics.
- An attacking flag **shields only its own tile**, so it isn't a free target.

## 5. Simulation results

Monte Carlo simulation, 3,000 runs per cell: `docs/sims/fronts_sim.py`.
Simplified: a line of plain settled tiles, base 30, 40% at 1×, attacker commits
to about 55% per battle. No reach, terrain, forts or exposure; the numbers show
direction, not final balance.

Tiles taken by a 600 MP attacker, by the size of the defender's flag:

| Design | 0 | 150 | 300 | 450 | 600 | 900 | 1,200 |
|---|---|---|---|---|---|---|---|
| Today (with the commit rule, flags don't interact) | 8.2 | 8.0 | 8.2 | 8.1 | 8.1 | 8.1 | 8.1 |
| **Shield: defender matches the commitment** | 8.2 | 6.2 | 5.2 | 3.7 | **2.9** | 2.8 | 2.9 |
| Garrison: standing defense, worn down by attrition | 8.2 | 5.7 | 3.2 | 2.3 | 1.9 | 1.6 | 1.3 |
| Duel: flags fight each other first (Lanchester) | 8.2 | 7.7 | 7.1 | 5.3 | 0.0 | 0.0 | 0.0 |
| Auction: both commit 10% per battle | 8.1 | 6.0 | 4.7 | 3.8 | 3.1 | 2.3 | 1.7 |

| Scenario | Shield | Garrison | Duel | Auction |
|---|---|---|---|---|
| 600 vs 600: tile battles / defender MP spent | 20 / 600 | 4 / 258 | 0 / 600 | 16 / 489 |
| Late counter (+600 after 5 battles): tiles taken | 4.6 | 3.9 | 2.7 | 4.4 |
| 10,000 vs 1,500: tiles taken | 122 | 100 | 134 | 30 |

- **Duel:** all or nothing (a cliff at equal flags), no tile battles while the
  flags fight, and the bigger force barely loses anything.
- **Auction:** a fixed fraction wastes a big attacker's manpower (10,000 → only 30
  tiles) and takes the investment decision away from the player.
- **Garrison:** defense is 2.3× more efficient than attack, which encourages
  turtling, and there are few battles to watch.
- **Shield:** smooth and proportional, a 1:1 trade, the most tile battles, late
  counters work, it holds while the defender is offline, and a big attacker still
  pays.

## 6. UX: one gesture and one confirm

- **Attack:** drag an arrow from your border to the target.
  - Desktop: **right-drag**. A plain right-click keeps its current "cancel"
    behaviour, and a left-drag that starts on one of your own flags also works.
  - Mobile: **long-press about 0.3s, then drag**. An ordinary drag still pans.
  - Fallback without gestures: tap the flag → "Set target" → tap a tile.
- **While dragging, the arrow:**
  - follows the real MARCH route (`buildTerrainDistanceField`) and snaps to tiles
  - is green on open ground, amber through an enemy shield (size shown), red when
    out of range
  - has a label at the cursor, e.g. "~8 tiles · Osmond's shield 450"
- **Sheet on release:** a size slider with a smart default and a forecast, an
  **Efficient / Fast** toggle (Efficient is the default, about 55% per battle),
  and **Go**. The per-attack commitment is chosen automatically and isn't a
  setting.
- **Defend:** tap your own tile → "Defend here" → Go. No new warning; the
  existing attack alerts already tell the player they're under attack.
- **After Go:** the arrow stays on the map as the flag's order and shortens as
  tiles fall. **Only its owner sees it.** Enemies never see the arrow, only
  the battles on their own tiles.
- **Renderer parity:** the arrow, the shield area and the front highlight must be
  built for both the 2D canvas and the true-3D renderer.

## 7. Open questions

1. Shield radius (3?) and whether overlapping shields add up or only the largest
   counts.
2. ~~How much of an enemy arrow is revealed.~~ Decided: never.
3. ~~Fort interaction.~~ Decided: base costs are the existing attack ladder, and
   the fort's defense multiplier stays as it is.
4. ~~Flag caps.~~ Decided: no cap. `musterFlagCap` and "Expand Capacity" go
   away. The upgrade is free today, so nothing is refunded.
5. AI: the planner's muster usage needs the commit rule and shield awareness.

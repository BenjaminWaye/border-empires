# Tech Tree Revision Proposal

## Current State Findings

- Tech unlocks are immediate. `researchTimeSeconds` exists in `packages/server/data/tech-tree.json`, but `applyTech()` in `packages/server/src/main.ts` spends resources and grants the tech immediately.
- Current full-tree cost is:
  - `370,000` gold
  - `1,120 FOOD`
  - `990 IRON`
  - `1,755 SUPPLY`
  - `2,670 CRYSTAL`
  - `0 SHARD`
- Current full-tree research time in data is `289,200` seconds, or `80.3` hours. Even if timers were enforced as-is, that is only `3.35` days of queue time.
- The current tree is strongest in early unlocks and weakest in late-era identity. Too many later techs are percentage refinements rather than new map verbs or new structures.

## Simulation Summary

Source: `scripts/tech-balance-analysis.mjs`

### 3-town gold output using current town formula

Assumptions:
- 3 connected towns
- full support
- fed
- connected-town bonus from current formula at 2 links = `0.9`
- `Market` = `+50%`
- `Bank` proposal = `+50%`

Results:

- TOWN tier:
  - Base: `22.8 gpm` total
  - Market: `34.2 gpm`
  - Market + Bank: `51.3 gpm`
  - Market + Bank + Caravanary x2: `75.6 gpm`
  - Market + Bank + Caravanary x1.5: `63.45 gpm`
- CITY tier:
  - Base: `34.2 gpm`
  - Market: `51.3 gpm`
  - Market + Bank: `76.95 gpm`
  - Market + Bank + Caravanary x2: `113.4 gpm`
  - Market + Bank + Caravanary x1.5: `95.18 gpm`

Conclusion:
- `Bank` is already very strong in the current formula environment.
- A literal `Caravanary` that doubles connected-city bonus is too explosive.
- Even `x1.5` connected bonus is still very strong.
- Recommended `Caravanary` tuning:
  - Not `x2`
  - Start at `+25% connected-town bonus`
  - Revisit after live testing

### Tall vs wide pacing under current tree costs

Conservative scenario assumptions:

- Tall:
  - 3 connected towns, all marketed
  - 4 improved food sites
  - 2 improved iron sites
  - 2 improved supply sites
  - 2 improved crystal sites
- Wide:
  - 8 towns
  - 4 marketed core towns
  - broader resource footprint
  - 8 improved food sites
  - 5 improved iron sites
  - 5 improved supply sites
  - 4 improved crystal sites

Results:

- Tall current full-tree bottleneck:
  - `24.7 days`
  - crystal bottleneck
- Wide current full-tree bottleneck:
  - `12.4 days`
  - crystal bottleneck

Conclusion:
- Both strategies can work today.
- Wide is much faster through the current tree.
- If a player gets above the conservative crystal assumptions, the tree collapses even faster.
- Without research timers, month-long season pacing is not credible.

## Core Design Rules

1. Techs should primarily unlock new capabilities, structures, or map interactions.
2. Techs can still grant percentages, but those should be secondary.
3. Domains should remain the main home for style-defining multipliers.
4. Tall needs dedicated city-network tools.
5. Wide needs land-management and logistics tools.
6. Full-tree completion should target roughly `26-30` days if the player is very active, because the season target is at least a month.

## Required System Change Before Balance Tuning

### Research must become timed

This is the single most important change.

If research remains instant:
- early unlocks feel fine
- late unlocks arrive too fast for active wide players
- any cost increase large enough to force month pacing will make the early game feel punitive

Recommendation:
- Add a single research queue with one active slot
- Use `researchTimeSeconds` for actual unlock timing
- Allow future domains/techs to reduce research time or add a second queue only very late if needed

Target pacing:
- Tier 1 total: `~10h`
- Tier 2 total: `~24h`
- Tier 3 total: `~64h`
- Tier 4 total: `~112h`
- Tier 5 total: `~180h`
- Tier 6 total: `~288h`
- Full tree total: `~678h` or `28.25 days`

This is the cleanest way to keep the season-long arc challenging.

## Structure Revisions

### Granary

- Unlock: `Pottery`
- Supported town effect:
  - `+20%` population growth
  - `+20%` town gold storage cap

Reason:
- Matches the actual town growth and gold-cap systems already in code
- Cleaner and less inflated than the current `+50% cap`

### Bank

- Unlock: `Coinage`
- Supported town effect:
  - `+50%` town income
  - `+1 flat gold per minute` to the supported town

Important:
- Do not implement the `+1` as a literal increase to `TOWN_BASE_GOLD_PER_MIN` before all multipliers.
- In the current formula, a true base-income increase compounds too hard.

### Caravanary

- Unlock: `Ledger Keeping`
- Placement: town support tile, like `Market` / `Granary` / `Bank`
- Supported town effect:
  - `+25%` connected-town bonus

Reason:
- This directly improves the current connected-town system.
- A full doubling is too large.

### Foundry

- Unlock: `Industrial Extraction`
- Placement: empty land, can be built on neutral or owned land
- Effect:
  - all `Mine` output in radius `10` is doubled

Reason:
- This creates a real map objective.
- It is much more interesting than another passive mining percentage.

### Warehouse

- Unlock: `Harborcraft`
- Placement: empty land adjacent to a dock
- Effect:
  - `+10%` dock gold output for that dock
  - `+50%` dock gold storage cap for that dock

Reason:
- The dock branch needs an early physical unlock, not just visibility and percentages.

### Customs House

- Unlock: `Maritime Trade`
- Placement: empty land adjacent to a dock
- Effect:
  - `+1 gold per minute` per connected owned dock route on that dock

Reason:
- This makes the route network matter as a buildable economy engine.

### Supply Depot

- Unlock: `Organized Supply`
- Placement: empty settled land
- Radius: `10`
- Effect:
  - `-25%` siege outpost supply upkeep in radius
  - `+10%` siege outpost attack from origin tiles in radius

Reason:
- The logistics branch should create real forward infrastructure on the map.

### Governor's Office

- Unlock: `Civil Service`
- Placement: empty settled land near cities
- Radius: `10`
- Effect:
  - `-20%` town food upkeep for towns in radius
  - `-20%` settled-tile gold upkeep for owned settled tiles in radius

Reason:
- This plugs directly into the existing town food upkeep and settled-tile upkeep systems.
- It gives tall empires resilience through administration, not through fake mechanics the game does not have.

### Garrison Hall

- Unlock: `Standing Army`
- Placement: empty settled land
- Radius: `10`
- Effect:
  - `+10%` defense on owned settled tiles in radius

Reason:
- This fits the current combat model.
- It supports dense, defended cores without replacing forts.

### Airport

- Unlock: `Aeronautics`
- Landmark structure
- Bombard radius: `30`
- Attack target area: `3x3`
- Upkeep and attack consume `OIL`

### Radar System

- Unlock: `Radar`
- Landmark structure
- Effect:
  - blocks airport bombard in radius `30`
  - defender gets early warning in feed that includes bombard origin tile

### Oil

- Keep `OIL` as a new strategic resource.
- Do not replace `CRYSTAL`.
- Airports can discover oil fields.
- `Plastics` should improve oil use or oil efficiency, not delete crystal play.

### Refinery

- Unlock: `Plastics`
- Placement: empty land near oil fields
- Radius: `10`
- Effect:
  - `+50%` OIL output in radius
  - optional late follow-up: reduce airport oil attack cost by `-20%`

Reason:
- The oil branch needs a real economic structure, not only a resource flag and an airport cost.

## Revised Tech Table

## Tier 1: Founding Age

| Tech | Prereqs | Cost | Time | Unlock / Effect | Secondary Bonus |
|---|---|---:|---:|---|---|
| Agriculture | - | 2,000 gold, 40 FOOD | 2h | Unlock `Farmstead` | `+5%` farm/fish output, `+5%` pop growth |
| Toolmaking | - | 2,000 gold, 40 SUPPLY | 2h | Foundation tech | `+5%` settlement speed |
| Trade | - | 2,500 gold, 25 CRYSTAL | 2h | Unlock `Market` | none |
| Cartography | - | 2,500 gold, 25 CRYSTAL | 2h | Unlock `Observatory` | `+1` vision |
| Warbands | - | 2,500 gold, 25 IRON | 2h | Military opener | `+5%` attack |

## Tier 2: Fortified Settlements

| Tech | Prereqs | Cost | Time | Unlock / Effect | Secondary Bonus |
|---|---|---:|---:|---|---|
| Leatherworking | Toolmaking | 3,500 gold, 50 SUPPLY | 4h | Unlock `Camp`, `Siege Outpost` | none |
| Masonry | Toolmaking | 3,500 gold, 50 IRON | 4h | Unlock `Fort` | `+5%` settled defense |
| Mining | Toolmaking | 3,500 gold, 45 IRON | 4h | Unlock `Mine` | `+5%` iron/crystal output |
| Irrigation | Agriculture | 4,500 gold, 90 FOOD | 4h | Food stability tech | `-10%` town food upkeep, `+10%` pop growth |
| Signal Fires | Cartography | 5,000 gold, 60 CRYSTAL | 4h | Unlock `Reveal Region` | `+1` vision |
| Harborcraft | Trade | 5,000 gold, 50 SUPPLY, 30 CRYSTAL | 4h | Unlock `Warehouse`, dock routes become visible | `+10%` dock gold output |

## Tier 3: City-State Age

| Tech | Prereqs | Cost | Time | Unlock / Effect | Secondary Bonus |
|---|---|---:|---:|---|---|
| Bronze Working | Warbands | 6,000 gold, 90 IRON | 8h | Military scaling | `+10%` attack |
| Pottery | Agriculture | 5,500 gold, 80 FOOD | 8h | Unlock `Granary` | none |
| Coinage | Trade | 6,500 gold, 90 CRYSTAL | 8h | Unlock `Bank` | none |
| Ledger Keeping | Coinage | 7,000 gold, 110 CRYSTAL | 8h | Unlock `Caravanary` | none |
| Surveying | Cartography, Toolmaking | 7,000 gold, 60 SUPPLY, 60 CRYSTAL | 8h | Strategic planning tech | `+1` vision |
| Fortified Walls | Masonry | 6,500 gold, 100 IRON | 8h | Defense scaling | `+10%` settled defense |
| Siegecraft | Leatherworking, Bronze Working | 7,500 gold, 90 IRON, 90 SUPPLY | 8h | Siege specialization | `+15%` outpost attack |
| Logistics | Toolmaking | 7,000 gold, 80 SUPPLY | 8h | Operational logistics | `+10%` operational tempo |

## Tier 4: Network Age

| Tech | Prereqs | Cost | Time | Unlock / Effect | Secondary Bonus |
|---|---|---:|---:|---|---|
| Navigation | Harborcraft, Signal Fires | 9,000 gold, 120 SUPPLY, 100 CRYSTAL | 16h | Unlock `Naval Infiltration` | none |
| Mountaineering | Surveying | 9,000 gold, 100 SUPPLY, 80 CRYSTAL | 16h | Unlock `Mountain Pass` | none |
| Port Infrastructure | Maritime Trade, Masonry | 10,000 gold, 120 SUPPLY, 100 CRYSTAL | 16h | Dock infrastructure tech | `+25%` dock output, `+50%` dock cap |
| Beacon Towers | Signal Fires, Surveying | 9,500 gold, 120 CRYSTAL | 16h | Observatory refinement | `+1` vision |
| Organized Supply | Leatherworking, Irrigation | 9,500 gold, 140 SUPPLY | 16h | Unlock `Supply Depot` | `-20%` outpost supply upkeep, `+10%` tempo |
| Industrial Extraction | Mining | 10,500 gold, 150 IRON | 16h | Unlock `Foundry` | none |
| Maritime Trade | Harborcraft, Trade | 8,500 gold, 80 CRYSTAL | 16h | Unlock `Customs House` | `+0.5` dock link value |

## Tier 5: Imperial Age

| Tech | Prereqs | Cost | Time | Unlock / Effect | Secondary Bonus |
|---|---|---:|---:|---|---|
| Deep Operations | Siegecraft, Organized Supply | 14,000 gold, 180 SUPPLY, 140 CRYSTAL, 1 SHARD | 30h | Unlock `Deep Strike` | `+10%` tempo |
| Cryptography | Beacon Towers, Ledger Keeping | 14,000 gold, 200 CRYSTAL, 1 SHARD | 30h | Unlock `Reveal Empire`, `Sabotage` | none |
| Terrain Engineering | Surveying, Mountaineering | 14,000 gold, 180 SUPPLY, 120 CRYSTAL, 1 SHARD | 30h | Unlock `Terrain Shaping` | none |
| Breach Doctrine | Siegecraft, Fortified Walls | 15,000 gold, 200 IRON, 120 SUPPLY, 1 SHARD | 30h | Unlock `Breach Attack` | none |
| Banking | Coinage, Ledger Keeping | 15,000 gold, 160 FOOD, 180 CRYSTAL, 1 SHARD | 30h | Strengthens the banking branch | `+10%` town cap, `+0.05` connected-town step bonus |
| Civil Service | Banking, Irrigation | 15,000 gold, 180 FOOD, 140 CRYSTAL, 1 SHARD | 30h | Unlock `Governor's Office` | none |
| Global Trade Networks | Maritime Trade, Port Infrastructure | 15,000 gold, 160 SUPPLY, 220 CRYSTAL, 1 SHARD | 30h | Late dock trade branch | `+20%` dock gold output |

## Tier 6: Modern Age

| Tech | Prereqs | Cost | Time | Unlock / Effect | Secondary Bonus |
|---|---|---:|---:|---|---|
| Steelworking | Bronze Working, Fortified Walls | 22,000 gold, 320 IRON, 2 SHARD | 48h | Heavy war branch | `+15%` attack, `+10%` attack vs forts |
| Grand Cartography | Cryptography, Beacon Towers | 22,000 gold, 260 CRYSTAL, 2 SHARD | 48h | Late intel branch | `+1` vision, `-20%` reveal upkeep |
| Imperial Roads | Organized Supply, Surveying | 22,000 gold, 280 SUPPLY, 2 SHARD | 48h | Logistics branch | `+15%` settlement speed, `+10%` tempo |
| Mass Commerce | Banking, Coinage | 22,000 gold, 180 FOOD, 220 CRYSTAL, 2 SHARD | 48h | Urban economy branch | `+10%` market income bonus, `+10%` population income |
| Standing Army | Civil Service, Masonry | 22,000 gold, 240 IRON, 180 SUPPLY, 2 SHARD | 48h | Unlock `Garrison Hall` | none |
| Aeronautics | Steelworking, Grand Cartography | 24,000 gold, 240 IRON, 260 CRYSTAL, 2 SHARD | 48h | Unlock `Airport` | none |
| Radar | Aeronautics, Cryptography | 24,000 gold, 280 CRYSTAL, 2 SHARD | 48h | Unlock `Radar System` | none |
| Plastics | Industrial Extraction, Aeronautics | 24,000 gold, 220 SUPPLY, 180 CRYSTAL, 2 SHARD | 48h | Unlock `Refinery` | `-20%` airport/radar oil upkeep |

## Verification Notes

- `Coinage -> Bank` is correct and directly meaningful.
- `Ledger Keeping -> Caravanary` fits the actual connected-town mechanic better than any treasury fantasy.
- `Industrial Extraction -> Foundry` is a better expression of industrial power than a generic mine multiplier.
- `Harborcraft -> Warehouse` gives the dock branch an actual early structure.
- `Maritime Trade -> Customs House` makes dock-route economies something you build, not only something you own.
- `Organized Supply -> Supply Depot` makes the logistics branch physical on the map.
- `Civil Service -> Governor's Office` plugs into actual upkeep systems already present.
- `Standing Army -> Garrison Hall` plugs into actual settled defense math already present.
- `Radar` only makes sense in the same tier block as `Aeronautics`.
- `Plastics -> Refinery` gives oil an economic branch instead of leaving it as a one-use fuel.

## Tall vs Wide Outcome After Revision

Expected outcome if research timers are real:

- Tall:
  - Stronger city stacking through `Bank`, `Caravanary`, `Governor's Office`
  - Better local resilience
  - Fewer but stronger economic centers
- Wide:
  - Faster early map coverage
  - Better resource breadth
  - Reaches more branches but pays more upkeep and has more coordination burden

This keeps both strategies viable:
- tall wins through compounding city quality
- wide wins through map control and strategic breadth

## Crystal vs Oil

Do not replace `CRYSTAL` with `OIL`.

Reason:
- it invalidates earlier investments
- it makes players feel like their previous branch was deleted
- it creates a theme transition by subtraction instead of addition

Better approach:
- keep `CRYSTAL` as the pre-modern advanced material used for observatories, intel, sabotage, and terrain shaping
- add `OIL` as the modern mobility and bombard resource
- move new modern unlocks toward `OIL`
- leave existing crystal systems intact

If a future season wants less “magic” tone:
- reinterpret crystal as rare advanced material, signal crystal, or rare-earth electronics substrate
- do not remove it from the economy mid-progression

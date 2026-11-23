# Town focus — plan

Status: active proposal (draft for owner review, 2026-11-23). Nothing here is
implemented. Numbers marked "starting value" are for a balance pass.
Owner: Benjamin Waye (product decisions); implementing agent (delivery)
Last verified: 2026-11-23
Replaces: none

## Problem

A visit ends when manpower runs out. The owner's intent is that "optimising is
the fun" and that "players should control town growth more directly"
(`docs/core-loop.md` §1.1), but once the pool is empty there is little left to
adjust:

- Every physical verb costs manpower (`docs/core-loop.md` §3).
- The free levers that exist (converter mode, refinery field, auto-settle
  preferences) mostly have one right answer and are set once.
- Resource slots cannot be shuffled: a structure holds its slots from build
  start until removal, even while inactive
  (`docs/product/resource-and-manpower-economy.md`, "Shortfall and dormancy").
- A town's output is fixed by its tier, terrain profile and buildings. The
  player has no say in what the town's people do.

Other games fill this gap with free reallocation: the same people or tiles
moved between jobs at no cost (assigning citizens in Civilization, jobs in
Stellaris). Border Empires has no equivalent.

Two earlier ideas were considered and dropped in
`docs/territory-development-plan.md`: town roles (they only restricted
buildings that are already one per town) and FOOD-as-growth (chores without a
clear payoff). This plan avoids both: it restricts no building and adds no
upkeep, requirement or new resource.

## Proposed change

Each owned town gets a **focus**, chosen by the player, that shifts the town's
own output between its three products. Changing it costs no manpower, Coin,
development slot or cooldown resource.

### The four settings

| Focus | Population growth | Manpower regen | Coin |
|---|---|---|---|
| **Balanced** (default) | ×1 | ×1 | ×1 |
| **Growth** | ×1.2 | ×0.9 | ×0.9 |
| **Levy** | ×0.9 | ×1.2 | ×0.9 |
| **Commerce** | ×0.9 | ×0.9 | ×1.2 |

All multipliers are starting values. For scale, a town's own regen per
4-hour refill is 50 / 100 / 150 / 250 / 450 manpower by tier before terrain,
biota and settlement-index weights (`TOWN_MANPOWER_BY_TIER`), so Levy adds
about 10 to 90 manpower per refill per town.

What each multiplier touches:

- **Growth** multiplies the town's growth rate, alongside the existing
  factors (Incubation Engine, long peace, integrity) in `tickPopulationGrowth`
  (`apps/simulation/src/runtime-population-growth.ts`). It does not lift any
  pause: an unfed town, a town near fighting or in capture shock still does
  not grow.
- **Levy** multiplies the town's manpower **regen only**, at the point where
  its per-town base is computed (`biotaAdjustedTownManpower` callers in
  `apps/simulation/src/runtime-manpower.ts`), before the settlement-index
  weight. The cap is untouched, so switching focus never clamps or inflates
  the pool. The AFC's own 720 cap and 0.4/min are not a town and are not
  affected.
- **Commerce** multiplies the town's Coin in `townGoldPerMinuteForPlayer`
  (`apps/simulation/src/player-update-economy/player-update-economy.ts`),
  including the Manufactory and converter shares attributed to that town. It
  does not change the Coin cap.

Focus multiplies on top of the town's terrain profile
(`packages/shared/src/town-terrain-profile.ts`), so the two combine into real
specialisation: a Trade Town (Coin ×1.6) gains more from Commerce than a
Tundra Town does, and a Fertile Town gains more from Levy.

### Why the choice is real

- Growth is investment: a higher tier raises manpower cap, regen and Coin
  later. Levy and Commerce are spending now.
- Manpower is the pacing currency and Coin pays for techs and tier upgrades,
  so the right mix changes with the player's plan for the next day.
- Conditions change the answer. A front-line town whose growth is paused by
  nearby fighting loses nothing by going to Levy; a safe heartland town is the
  place to grow; a town at its population ceiling has nothing left to grow.

### When a change takes effect

A change is **queued and applies at the owner's next manpower refill**
(`nextManpowerRefillAtMs`, a pure function of player id and time, so the
client can show the countdown without new wire data). Until then the town
keeps its current focus. The player can change their mind any number of times
before the refill; only the last choice counts.

Reasons:

- It fits the rhythm: one decision per town per "turn" (`docs/core-loop.md`
  §1.1), made while waiting for that same refill.
- It removes any reward for reacting minute by minute (pillar 3: check in a
  couple of times a day). The tightest useful cadence is once per four hours.
- Manpower already banks continuously at the rate in force (`accrueManpower`),
  and growth and Coin are per-minute, so a focus pays only for the time it is
  active. There is nothing to gain from timing a switch around the refill.

### Ownership changes

- A captured town resets to Balanced, and any queued change is dropped. The
  captor chooses again.
- A town returned by diplomacy
  (`apps/simulation/src/diplomacy-town-return/`) also resets to Balanced.
- A new or newly settled town starts Balanced.

### Scale: 5 towns and 50 towns

Per-town decisions must stay manageable at 50 towns (`docs/core-loop.md`
§1.1).

- Balanced is the default and equals today's numbers, so ignoring the feature
  costs nothing against the current game.
- An **empire default** focus applies to towns the player has not set by
  hand.
- A **town list** shows every town with tier, terrain profile, current and
  queued focus, and whether growth is paused or at its ceiling. It supports
  multi-select and "set all selected".
- The list shows the empire-wide result of the queued choices: manpower at
  the next refill, Coin per day, and time to next tier per town, against the
  current setup.

### Client

- **Town panel** (HUD v2 town view,
  `packages/client/src/client-hud-v2/client-hud-v2-town.ts`, and the classic
  side panel): four buttons, the numbers each would give this town, the
  queued choice and the time until it applies.
- **Map**: a small focus badge on the town, for the owner only. It must be
  drawn in both the 2D canvas and true-3D renderers, guarded by
  `isTrue3DRendererActive()`.
- **Previews use the server's arithmetic.** The multipliers live in
  `packages/shared` and both the simulation and the client preview call the
  same functions.
- **Guide**: one line in the in-game guide and the tutorial's town chapter.
- A `CLIENT_CHANGELOG_ENTRIES` entry when it ships.

### Simulation, protocol and state

- **State**: two optional fields on the town record, the active focus and
  the queued focus with its effective time. Absent means Balanced, so
  existing seasons need no migration. Read
  `docs/agents/state-and-persistence-discipline.md` before adding them; they
  belong on the town tile state so checkpoints, capture and town return
  already carry them.
- **Command**: `SET_TOWN_FOCUS` taking a list of town tiles and one focus, so
  a bulk change is one command. Validation: caller owns each town. No cost.
  A second command or field sets the empire default.
- **Applying the queue**: the effective focus is resolved from the queued
  field and the current time, and the player's manpower and economy caches
  are invalidated when a queued change comes due, so the new rates apply from
  the boundary.
- **Wire**: the owner's town summary
  (`packages/shared/src/town-wire-summary.ts`) carries active and queued
  focus. Other players do not receive a rival town's focus.
- **AI Houses**: Balanced at launch, which matches their current output. A
  later phase can give the planner a simple rule (Levy near a front, Growth
  in safe ground below the top tier). Read `docs/agents/ai-guardrails.md` and
  `docs/agents/topics/ai-planner.md` first.

### What does not change

- No building is restricted or unlocked by focus.
- No new resource, upkeep or requirement.
- Manpower cap, Coin cap, FOOD and biota demand, support, defense and
  victory counts are untouched.
- Money buys nothing here (`docs/gdd.md` §8).

## Pillar check

| Pillar (`docs/gdd.md` §4) | Effect |
|---|---|
| No babysitting | A focus runs on its own once set. |
| Manpower is the real currency | Unchanged; Levy trades growth and Coin for a modest regen gain. |
| Check in a couple of times a day | Changes apply at the refill, so more frequent visits gain nothing. |
| Tall is viable against wide | Helps tall play: a few well-tuned towns gain the same percentage as many. Levy on towns past the fifth is discounted by the existing settlement-index regen weights. |
| Several ways to win | Commerce supports the Coin path, Growth the town-tier path. |

## Open questions for the owner

1. **Names.** "Levy" matches the lore's wording for town manpower
   (`docs/lore/galactic-lore.md`: "the towns whose levies hold it") but also
   appears in Titanium Levy, Iron Levy and the Imperial Exchange levy.
   Alternatives: Recruitment, Conscription.
2. **Size of the shift.** +20% / −10% is deliberately mild. A stronger
   version (+30% / −15%) makes the choice matter more and Balanced weaker.
3. **Towns at their population ceiling.** Growth does nothing there, so Levy
   or Commerce is a free +20% on one output at −10% on the other. Accept this
   as a reward for a fully grown town, or reduce the bonus when growth is
   capped?
4. **Should Levy also apply to large-town biota blending?** As drafted it
   multiplies the regen after the biota share, so an undersupplied city gains
   proportionally less.
5. **Visibility.** Drafted as owner-only. Showing a rival's focus (for
   example through Reveal Empire) would add intelligence value.
6. **Delay.** Next refill is drafted. An alternative is "applies now, then
   locked for four hours", which feels more responsive but rewards being
   online at a particular moment.

## Phases

Each phase ships and is played before the next starts.

1. **Rules and one town.** Shared multipliers, state, `SET_TOWN_FOCUS`,
   queued application, capture reset, town-panel controls with previews.
2. **Scale.** Empire default, town list with multi-select and empire-wide
   projection, map badge in 2D and true-3D.
3. **AI.** Planner rule for AI Houses.

## Acceptance criteria

- A player with zero manpower can change any owned town's focus.
- A queued change has no effect before the owner's next refill and full
  effect after it; the panel shows the countdown.
- With every town Balanced, manpower regen, Coin and growth equal today's
  values exactly.
- Growth, Levy and Commerce each change only the three outputs in the table,
  by the stated multipliers, and never the manpower cap or Coin cap.
- A captured or returned town is Balanced with no queued change.
- The numbers previewed in the client equal the numbers the simulation
  applies.
- Setting 50 towns takes one action from the town list.
- The focus badge appears in both the 2D and true-3D renderers.
- A season saved before the feature loads with every town Balanced.

## Verification

- Shared: multiplier functions and effective-focus resolution at, before and
  after a refill boundary.
- Simulation: regen, Coin and growth per focus against the Balanced baseline;
  no change to caps; queued change applies at the boundary and not before;
  capture and town-return reset; checkpoint round trip; old snapshot loads
  Balanced.
- Client: preview equals server result; town panel and list; badge in both
  renderer adapters.
- First-day simulation (`apps/simulation/src/first-day-sim/`) with all-Levy
  and all-Growth empires, to size the effect before the balance pass.
- When delivered, move the rules into `docs/game-mechanics.md` and
  `docs/product/resource-and-manpower-economy.md`, add the owner decision to
  `docs/core-loop.md` §1.1, and add a line to `docs/lore/galactic-lore.md`
  §11 on what a town's focus means in the fiction.

## Relation to other plans

- `docs/territory-development-plan.md`: dropped town roles and
  FOOD-as-growth; see "Problem" for how this differs.
- `docs/stacking-adjacency-plan.md`: independent. If it lands, focus still
  multiplies the town's total.
- `docs/afc-specializations-plan.md`: specialisations are empire-wide and
  permanent per tier; focus is per town and reversible.

Lore reviewed; no canon change at proposal stage.

# Town focus — plan

Status: phase 1 implemented (2026-11-25), using the drafted answers to open
questions 1, 2 and 6 (name Levy, +20% / −10%, next refill) pending the
owner's decision. Numbers marked "starting value" are for a balance pass.
Current rules: `docs/game-mechanics.md`, "Town focus".

Phase 1 as shipped differs from the draft below in two ways: the controls
are four rows on the town's tile menu (shared by the 2D and true-3D maps)
rather than a dedicated panel with per-focus previews, and the focus is not
hidden from rivals (open question 5).
Owner: Benjamin Waye (product decisions); implementing agent (delivery)
Last verified: 2026-11-25
Replaces: none

## Problem

A visit ends when manpower runs out. The owner's intent is that "optimising is
the fun" and that "players should control town growth more directly"
(`docs/core-loop.md` §1.1), but once the pool is empty there is little left to
adjust:

- Every verb that changes the map costs manpower: expand, settle, build,
  beacon, muster (`docs/core-loop.md` §3). What stays available at zero
  manpower (research, a town tier upgrade, a scout route, queueing) is a
  handful of one-off purchases, not something to tune.
- The free levers that exist (converter mode, refinery field, auto-settle
  preferences) mostly have one right answer and are set once.
- Resource slots cannot be shuffled: a structure holds its slots from build
  start until removal, even while inactive
  (`docs/product/resource-and-manpower-economy.md`, "Resource slots").
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
- **Levy** multiplies the town's own base manpower **regen only**: the
  per-town figure from `biotaAdjustedTownManpower`, before the
  settlement-index weight. The cap is untouched, so switching focus never
  clamps or inflates the pool. Not affected: the AFC's 720 cap and 0.4/min,
  the Settlement-tier baseline the AFC also grants, and regen from structures
  that stand in a town (Ancillary Factory, Neural Works, Census Directorate).
  The multiplier is applied per town in the regen sum, never at the
  `TOWN_MANPOWER_BY_TIER` constant. That base is read in several places (the
  cap and regen sums and the biota-loss lines in
  `apps/simulation/src/runtime-manpower.ts`,
  `runtime-manpower-structure-bonus.ts`, and client call sites), so the
  regen-only rule needs one shared helper.
- **Commerce** multiplies the town's Coin in `townGoldPerMinuteForPlayer`
  (`apps/simulation/src/player-update-economy/player-update-economy.ts`),
  including the Manufactory and converter shares attributed to that town. It
  does not change the Coin cap.

Focus multiplies on top of the town's terrain profile
(`packages/shared/src/town-terrain-profile.ts`), so the two combine into real
specialisation: a Trade Town (Coin ×1.6) gains more from Commerce than a
Tundra Town does, and a coastal Standard Town (regen ×1.2) gains the most
from Levy.

### Why the choice is real

- Growth is investment: a higher tier raises manpower cap, regen and Coin
  later. Levy and Commerce are spending now.
- Manpower is the pacing currency and Coin pays for techs and tier upgrades,
  so the right mix changes with the player's plan for the next day.
- Position changes the answer. A town on a long-running front, where growth
  is paused most of the time, gives up little by going to Levy; a safe
  heartland town is the place to grow; a town near its maximum population
  has little left to grow.

There are states where one focus is plainly best, and the owner should decide
whether that is acceptable (open question 3): an unfed town above Settlement
tier earns no Coin and does not grow, so Levy costs it nothing; the same holds
during capture shock and a war pause.

### When a change takes effect

A change is **queued and applies at the owner's next manpower refill**
(`nextManpowerRefillAtMs`, a pure function of player id and time, so the
client can show the countdown without new wire data). Until then the town
keeps its current focus. The player can change their mind any number of times
before the refill; only the last choice counts.

Manpower earned in a window is paid at the end of that window
(`accrueManpower`). So a Levy queued now starts at the next refill and its
first larger payout arrives at the refill **after** that, up to eight hours
from the click. Growth and Coin change from the moment the focus starts. The
client must show both times and must not present the next refill as already
including the queued change.

Reasons:

- It fits the rhythm: one decision per town per "turn" (`docs/core-loop.md`
  §1.1), made while waiting for the refill.
- It removes any reward for reacting minute by minute (pillar 3: check in a
  couple of times a day). The tightest useful cadence is once per four hours.
- Manpower already banks continuously at the rate in force (`accrueManpower`),
  and growth and Coin are per-minute, so a focus pays only for the time it is
  active. There is nothing to gain from timing a switch around the refill.

Known limit: a war pause lasts 60 minutes (`NEARBY_WAR_PAUSE_MS`) and is
renewed by each nearby attack, which is faster than a focus can change. A
focus therefore cannot track individual raids, and is not meant to: it suits
a town's standing situation. Open question 6 covers the alternative.

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
- There is no stored empire default: a town with no focus set is always
  Balanced, which keeps the capture, return and old-season rules below
  unambiguous. "Select all" in the town list covers the same need.
- A **town list** shows every town with tier, terrain profile, current and
  queued focus, and whether growth is paused or at its ceiling. It supports
  multi-select and "set all selected".
- The list shows the empire-wide result of the queued choices against the
  current setup: manpower per refill once the choices are in force (labelled
  with the refill at which that first pays), Coin per day, and time to next
  tier per town.

### Client

- **Town panel** (HUD v2 town view,
  `packages/client/src/client-hud-v2/client-hud-v2-town.ts`; the classic HUD
  is retired): four buttons, the numbers each would give this town, the
  queued choice and the time until it applies.
- **Map**: a small focus badge on the town, for the owner only. It must be
  drawn in both the 2D canvas and true-3D renderers, guarded by
  `isTrue3DRendererActive()`.
- **Previews use the server's numbers.** The multipliers live in
  `packages/shared`, but Coin and growth are computed in the simulation from
  inputs the client lacks (support ratio, Clearing House network, integrity),
  and the client's manpower figure omits the settlement-index weight. The
  owner's town summary therefore carries the town's current manpower regen,
  Coin and growth as the server computed them, and the client derives each
  focus's preview from those and the shared multipliers.
- **Guide**: one line in the in-game guide and the tutorial guide.
- A `CLIENT_CHANGELOG_ENTRIES` entry when it ships.

### Simulation, protocol and state

- **State**: two optional fields on the town record, the active focus and
  the queued focus with its effective time. Absent means Balanced, so
  existing seasons need no migration. Read
  `docs/agents/state-and-persistence-discipline.md` before adding them; they
  belong on the town tile state so checkpoints carry them. Capture and town
  return must clear both fields explicitly.
- **Command**: `SET_TOWN_FOCUS` taking a list of town tiles and one focus, so
  a bulk change is one command. No cost. Bounds, because the command is free
  and writes town state: a capped list length (starting value: 100 tiles),
  duplicates ignored, tiles the caller does not own skipped while the rest
  apply, the normal command rate limit, and no write or delta for a town
  whose queued focus would not change.
- **Applying the queue**: manpower is settled at the single rate in force
  since the last settle, so a rate that flipped by clock alone would be paid
  retroactively. When a queued change comes due, the simulation must first
  settle the owner's manpower at the old rate up to the boundary, then
  promote queued to active in stored state and invalidate that player's
  manpower and economy caches. This needs a step at each player's refill
  boundary that also runs for offline players; whether the existing
  player-update tick covers them must be checked before phase 1.
- **Wire**: the owner's town summary
  (`packages/shared/src/town-wire-summary.ts`) carries active and queued
  focus. Hiding it from rivals needs per-recipient stripping of town fields,
  which must be confirmed to exist or be built. Even then a rival who can see
  the town's Coin or growth rate can infer the focus from the step at the
  owner's refill (open question 5).
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

## Proposed fiction

Proposal only; none of this is canon until the owner accepts it and
`docs/lore/galactic-lore.md` is updated. It adds no rule: every effect below
is already in the multiplier table.

The three focuses are three things a House does with a town's people. Two of
them take people away, which is why both slow growth.

- **Growth.** The House supplies and shelters the town, so its people stay
  and multiply. The nearest existing line is about luxury biota: "where the
  House supplies what they depend on, they stay put". That line is about
  control through supply, so this reading extends it.
- **Levy.** More of the town's people are remade into Ancillaries and kept
  by the House. This is existing canon ("bodies from towns") turned up.
- **Commerce.** The House signs the town's labour away offworld. Part of the
  population leaves as contracted crews, and creditors extend more Coin
  against the people who remain. This is new: in the world bible Coin buys
  "transported crews" from offworld and "is not local wages"; it does not say
  Houses export their own people. The proposal adds that the trade runs both
  ways.

### Why Manufactories still matter

A **Manufactory** raises what the town produces: it "grows the local
production that backs Coin". It is permanent, costs manpower and holds a
slot. **Commerce focus** is how hard the House cashes that backing in: a
reversible policy that liquidates instead of building, paid for in growth.
The two reinforce each other, because Commerce multiplies the town's Coin
including its Manufactory share.

### Limits

- Commerce and Levy slow growth; they never remove existing population.
  Forced Ancillarification remains the only lever that does (2% of the town,
  4-hour cooldown).
- Player-facing text states the trade plainly and does not soften it.

### What accepting this would change in the world bible

- §11 "Coin and local production": that a House's population counts toward
  the credit extended to it, and that Houses contract labour offworld.
- §11 "Manpower and materials": a line tying Levy to Ancillary intake.
- §14: remove the open question recorded with this proposal.

## Pillar check

| Pillar (`docs/gdd.md` §4) | Effect |
|---|---|
| No babysitting | A focus runs on its own once set. |
| Manpower is the real currency | Unchanged; Levy trades growth and Coin for a modest regen gain. |
| Check in a couple of times a day | Changes apply at the refill, so visits more often than once per refill gain nothing. A player who re-tunes at every refill does gain over one who sets it once; the size of that gain is for the balance pass. |
| Tall is viable against wide | Roughly neutral. Every town gains the same percentage, so Growth and Commerce scale with town count. Only Levy favours tall play, through the existing settlement-index regen weights. |
| Several ways to win | Commerce supports the Coin path, Growth the town-tier path. |
| A contest you don't win still pays off | No effect. |

## Open questions for the owner

1. **Names.** "Levy" matches the lore's wording for town manpower
   (`docs/lore/galactic-lore.md`: "the towns whose levies hold it") but also
   appears in Titanium Levy, Iron Levy and the Imperial Exchange levy.
   Alternatives: Recruitment, Conscription.
2. **Size of the shift.** +20% / −10% is deliberately mild. A stronger
   version (+30% / −15%) makes the choice matter more and Balanced weaker.
3. **States where one focus is plainly best.** Growth fades as a town nears
   its maximum population (growth is logistic, so there is no single
   "capped" moment), and it does nothing while a town is unfed, in capture
   shock or war-paused. In those states Levy or Commerce is a gain at little
   or no cost, and for an unfed town Levy partly offsets the penalty for not
   feeding it. Accept this, or suspend the bonus while the town's growth is
   blocked?
4. **Should Levy also apply to large-town biota blending?** As drafted it
   multiplies the regen after the biota share, so an undersupplied city gains
   proportionally less.
5. **Visibility.** Drafted as owner-only, but a rival who sees the town's
   rates can infer it. Either accept that, or make focus openly visible (for
   example through Reveal Empire) as intelligence.
6. **Delay.** Next refill is drafted, which means a Levy pays up to eight
   hours after the click and cannot follow a 60-minute war pause. An
   alternative is "applies now, then locked for four hours", which feels
   more responsive but rewards being online at a particular moment.
7. **How dark is Commerce?** Drafted as contracted crews (indenture), which
   fits the existing "transported crews" line. The stronger option is that
   people are sold outright, which says more about the Houses and the Court.
8. **Does population back Coin?** The world bible says Coin is backed by
   planetary output. Commerce as drafted adds that creditors also lend
   against the population a House controls.
9. **AI Houses.** Balanced at launch leaves them weaker than a human who
   tunes, against the "AI Houses are rivals" principle (`docs/gdd.md` §4).
   Ship phase 1 without AI support, or hold it for the planner rule?

## Phases

Each phase ships and is played before the next starts.

1. **Rules and one town.** Shared multipliers, state, `SET_TOWN_FOCUS`,
   queued application, capture reset, town-panel controls with previews.
2. **Scale.** Town list with multi-select and empire-wide projection, map badge in 2D and true-3D.
3. **AI.** Planner rule for AI Houses.

## Acceptance criteria

- A player with zero manpower can change any owned town's focus.
- A queued change has no effect before the owner's next refill. From that
  refill, growth and Coin run at the new multipliers and manpower banks at
  the new rate, first paid at the following refill. The panel shows both
  times.
- Manpower banked before the boundary is paid at the old rate, including for
  a player who was offline across it.
- With every town Balanced, manpower regen, Coin and growth equal today's
  values exactly.
- Growth, Levy and Commerce each change only the three outputs in the table,
  by the stated multipliers, and never the manpower cap or Coin cap.
- A captured or returned town is Balanced with no queued change.
- The numbers previewed in the client equal the numbers the simulation
  applies.
- Setting 50 towns takes one action from the town list and sends one
  command.
- A town with no focus set is Balanced in every case: new, captured,
  returned, or from an older season.
- The focus badge appears in both the 2D and true-3D renderers.
- A season saved before the feature loads with every town Balanced.

## Verification

- Shared: multiplier functions and effective-focus resolution at, before and
  after a refill boundary.
- Simulation: regen, Coin and growth per focus against the Balanced baseline;
  no change to caps; queued change applies at the boundary and not before,
  with no retroactive manpower for a player with no settle near the boundary;
  command bounds (list cap, duplicates, unowned tiles, no-op writes);
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

Lore reviewed; no canon change at proposal stage. The open question is
recorded in `docs/lore/galactic-lore.md` §14.

# Resource and Manpower Economy

Status: canonical reference

This is the current-rule reference for manpower, resource slots, gold,
structures, and economic dormancy. Verify a rule in
code and update this document in the same branch when the rule changes.
The [world bible](../lore/galactic-lore.md#11-houses-and-the-planetary-economy)
defines what these systems mean in the fiction; follow the
[lore maintenance policy](../lore/README.md) when a gameplay change affects it.

## Rule sources

| Concern | Authoritative implementation |
|---|---|
| Action costs and base/town manpower | `packages/shared/src/config.ts` |
| Structure slot requirements and supply constants | `packages/shared/src/structure-slots/structure-slots.ts` |
| Current manpower calculation | `apps/simulation/src/runtime-manpower.ts` |
| Allied income/capacity/refill contributions | `apps/simulation/src/afc-specializations/afc-coalition.ts`, `apps/simulation/src/runtime/runtime-manpower-economy.ts`, `apps/simulation/src/runtime/runtime-economy.ts` |
| Refill schedule (window, per-player offsets) | `packages/shared/src/manpower-refill.ts` |
| HUD manpower gauge and Development gears | `packages/client/src/client-manpower-gauge/`, `packages/client/src/client-dev-gears/` |
| Slot demand, supply, and dormancy selection | `apps/simulation/src/resource-slot-view/resource-slot-view.ts` |
| Gold income and town support | `apps/simulation/src/player-update-economy/` |
| Build costs and placement rules | `packages/shared/src/structure-costs/` and `packages/shared/data/structure-placement-metadata.json` |

## Manpower

- Manpower is capped and regenerates. The always-present starting capital adds
  **720 cap** and **0.4/minute**; it is additive with towns.
- Every new empire (a human on join, an AI empire at season start; not
  barbarians) lands with a one-time **+2,000** manpower reserve
  (`LANDING_MANPOWER_RESERVE`), granted at the player's first manpower settle
  in `refreshManpowerOnlyForPlayer`. An empire that lands after the season
  started also gets a late-join catch-up: what the starting capital alone
  (0.4/minute, **576/day**) would have regenerated since the active season's
  `startedAt` (`landingManpowerReserve` / `lateJoinManpowerCatchUp`), so a day-5
  joiner lands with 720 + 2,000 + 2,880. It is uncapped. Nothing is added while
  the season is pending or ended, or when the runtime has no season clock
  (`SimulationRuntimeOptions.seasonStartedAt`, wired by `seasonStartedAtClock`).
  A respawn after a true elimination (the player lost their last tile;
  `respawnIfEliminated` only, never the territory-holding settlement repair in
  `respawnPlayerOnUnownedLand`) lands anew and gets the same grant, base plus
  catch-up, on top of its restored starting manpower
  (`grantRespawnLandingReserve`, via `RuntimeRespawnContext.grantLandingReserve`),
  so a player wiped out late in the season can still stage a comeback. There is
  no ceiling on the catch-up. Like a Waystation grant it may sit above
  the cap (tracked as `waystationManpowerOverflow`), and regen pauses until it
  is spent back under the cap.
- **Shard Mobilization** (`SHARD_MOBILIZE`, `SHARD_MOBILIZE_SHARD_COST` = **1
  Shard**, donated to the Court for an Imperial delivery of ancillaries) refills
  manpower to the cap at once, from the Manpower panel. It
  settles manpower first, never goes above the cap (it is rejected when the
  pool is already at or over the cap, so overflow from the landing reserve or a
  Waystation is never trimmed), clears `manpowerBanked`, and is rejected while
  the Titanium Levy's regen freeze is active. It is the comeback lever for an
  empire that lost its pool while offline; see the comeback-weighted shard rain
  in [game mechanics §9](../game-mechanics.md#9-seasons-and-world-events).
  `apps/simulation/src/shard-mobilize/`
- **Regeneration is paid out in refills, not continuously.** Regen accrues at
  the per-minute rates below into a bank (`manpowerBanked`) that is settled at
  the current rate on every settle (every command and the 15s player-update
  tick), exactly like the old continuous model, but banked manpower only becomes
  spendable at the player's refill boundaries, every `MANPOWER_REFILL_WINDOW_MS`
  (**4 hours**). Because the bank is settled as it goes, a rate change (a
  captured or lost town, a new structure, the Iron Levy's regen freeze) applies
  only from when it happened, never to the whole window. Nothing accrues at or
  above the cap, and the bank never exceeds the room left under the cap. Each
  player's refill moments are offset by a stable hash of their player id
  (`manpowerRefillOffsetMs`), so refills are staggered across players.
  `manpowerBanked` round-trips through snapshots; the client derives the
  schedule from the player id and receives the payout through the normal
  periodic `PLAYER_UPDATE`. The schedule is computable by anyone who knows a
  player id; defending costs no manpower, so this is accepted.
- The HUD shows manpower as a gauge (spendable now, manpower staged in muster
  flags, countdown to the next refill; ember below an ordinary attack, green at
  the cap; below 1440px wide the gauge is a strip along the chip's bottom edge) and the Development chip as one gear per slot (busy slots spin).
- Town cap / regeneration by tier: Settlement 150 / 150÷720 per minute, Town
  300 / 300÷720, City 450 / 450÷720, Great City 750 / 750÷720, Metropolis
  1,350 / 1,350÷720. Terrain can adjust these values at runtime.
- Town regeneration weights: first five towns 100%, next ten 50%, later towns
  20%. The global regeneration floor is 0.15/minute.
- Structures and networks can add cap or regeneration. The runtime calculator
  is the source for those interactions (Ancillary Factory/Ancillary Depot,
  Reserve Lattice, Ancillary Factory, Neural Works, Census Directorate, seasonal
  bonuses).
- Core action anchors: **EXPAND 10** (base; it rises with the frontier tiles
  held, to 50 at 1,000 and 100 at 2,000 — see `expandManpowerCostForFrontierCount`),
  **SETTLE 20**, ordinary ATTACK **60**,
  and Deep Strike/Naval Infiltration **120** manpower. Structure costs are
  data-driven; inspect the registry instead of assuming a common price.

### Incubation Engine and Census Hall

Incubation Engine grants **+10,000 population once on completion** and **+10%
ongoing population growth** to its supported town. It does not boost Hydrogarden
output or reduce FOOD demand; it consumes a FOOD slot. Census Hall adds
**20,000 population capacity per connected town with an active Incubation Engine**
and reduces its own town's tier-upgrade Coin cost by **25%**.

Sources: `packages/shared/src/config.ts` (population constants),
`apps/simulation/src/runtime-structure-build-completion.ts`
(`grantIncubationEnginePopulationBurst`),
`packages/game-domain/src/server-game-constants/server-game-constants.ts`
(`incubationEngineGrowthMultiplier`), and
`apps/simulation/src/runtime-census-hall-bonus.ts`. Structure-info copy is
rendered from those shared constants in `client-population-structure-info/`;
old food-efficiency descriptions have been removed from current references.

### Forced Ancillarification

Selecting an active, owned, garrisoned Ancillary Factory offers **Forced
Ancillarification**. It permanently removes **2% of its assigned town's current
population, rounded up**, for **100 immediate manpower**. This reserve can exceed
the manpower cap, using the same overflow accounting as paid recruitment.
A town must retain at least **10,000 residents**; population loss can lower its
tier. There is a **4-hour cooldown per town**, shared by all factories supporting
it, retained through captures and restarts. Dormant, inactive, unfinished and
temporarily disabled factories cannot use it. Overlapping support rings use the
ordinary town assignment rule. The factory menu previews the exact population
cost as a resident count, without displaying the percentage, with the shared
calculation used by the server.

Sources: `packages/shared/src/forced-ancillarification/forced-ancillarification.ts`,
`apps/simulation/src/forced-ancillarification/forced-ancillarification-command.ts`,
`packages/client/src/client-forced-ancillarification/client-forced-ancillarification.ts`.

### Allied prosperity (Envoy Accreditation)

Envoy Accreditation adds 10% of each mutual ally’s Coin income, manpower
capacity and regeneration. Contributions use domestic values before Envoy
bonuses, so mutual upgrades cannot compound; allies retain their full amounts.
Coin is credited through normal passive income, and regeneration through normal
refills. This shares capacity and production, not current Coin or manpower
stockpiles. Ending an alliance removes its contribution; forming one changes
capacity without an immediate manpower grant. Reconnect source rows use the
same contribution as accrual, rather than estimating an ally’s hidden economy.

## Resource slots

FOOD, TITANIUM, CRYSTAL, and UMBRITE are **slot pools**, not stockpiled
currencies. Supply is global across a player's owned, settled resource tiles;
demand is across its consumers. Gold and Shard do not use this system.

| Settled tile resource | Base supply |
|---|---:|
| FARM | 1 FOOD slot |
| FISH | 2 FOOD slots |
| TITANIUM | 1 TITANIUM slot |
| GEMS | 1 CRYSTAL slot |
| UMBRITE | 1 UMBRITE slot |

- Hydrogarden adds 2 FOOD slots to its FARM tile. Mine and Umbrite Rig each add
  1 matching-resource slot. Hydroworks adds 2 FOOD slots to Hydrogardens in
  range; Ore Refinery adds 2 TITANIUM slots to Mines in range.
- Agrarian Works adds 1 FOOD slot per owned, settled FISH tile.
- A structure occupies its requirements from build start until removal
  completes, including while under construction or inactive. The full table is
  `STRUCTURE_SLOT_REQUIREMENTS`.
- Town FOOD demand: Settlement 0, Town 4, City 5, Great City 6, Metropolis 7,
  before applicable waivers.
- A synthesizer in `SYNTHESIZE` mode supplies its resource; in `EXCHANGE`
  mode it is a slot consumer. Check mode before treating converters alike.

## Shortfall and dormancy

When demand exceeds supply, contributors are sorted by most recent activation
(with stable key tie-break) and made dormant until the shortfall is covered. A
newly settled town participates in the same ordering. A multi-resource
structure can be short on one resource independently of another; manual
deactivation is distinct from automatic dormancy.

Resource loss can therefore make the newest relevant structures or towns
inactive. This is not periodic resource drain, and removal does not release a
slot until removal completes.

## Gold and town support

- Manufactories are repeatable town-industry buildings, replacing Mintworks.
  Each occupies 1 FOOD slot and retains the same income: +10 Coin on
  completion, +1 Coin/day, and an additive +10% town income per copy
  (+35% with an active local or connected Clearing House). The Industrial
  Tooling Module occupies one AFC module slot; constructing Manufactories
  requires it installed on an active owned AFC. Existing trade unlocks receive
  their module through the normal call-down system when an AFC slot is free.

- Gold is passive per-minute income, rescaled by `GOLD_RESCALE_DIVISOR = 288`.
  Baseline town income is `2 / 288` gold/minute and a dock is `0.5 / 288`;
  other modifiers and network effects are calculated in the economy module.
- Gold has a town-linked cap; overage is lost rather than stored indefinitely.
- Town support is a separate settled-territory calculation. An unfed town does
  not produce gold until support recovers. Support and FOOD slots are separate
  systems.
- FOOD has no per-minute production/upkeep ledger. FARM and FISH provide FOOD
  slot supply.

## Change checklist

1. Change the relevant shared constant, registry, or runtime computation.
2. Update or add focused tests beside that implementation.
3. Update this reference and [`../game-mechanics.md`](../game-mechanics.md)
   if the player-visible rule changes.
4. Confirm clients receive new economy/slot state through the relevant protocol
   path; a server-only update is not sufficient for a player-visible rule.

## Frontier resource networks

New seasons contain five economic deposits in addition to the slot resources.
They are visible when explored, but require a specialised Manifest and an
owned, settled matching extraction installation before supplying benefits.
Every new extraction installation occupies 1 FOOD slot and costs manpower:
Resin Extractor 40, Implant Foundry 50, Catalyst Refinery 50, Cultivation
Estate 33, Reclamation Works 60. Base construction seconds equal manpower.

Each active developed site supplies one renewable bonus slot, except an Implant
Foundry which supplies two conductive slots for two separate factories. One slot can
supply one eligible building; each building uses at most one slot of each
applicable resource. A supplied Ancillary Depot gains 12 Ancillaries per four-hour cycle from resin;
a supplied Ancillary Factory gains 6 per batch from conductive minerals. Conductive slots equal
twice the number of active supplied Implant Foundries. The actual empire bonus is 12×min(resin slots, active depots) + 6×min(mineral slots, active
factories), banked over the 240-minute refill interval. Extra factories cannot
reuse a slot. Unsupported factories retain normal output; there is no resource
stockpile, permanent depletion, diminishing tier or six-site cap. Storage cap
is unchanged and towns remain the source of bodies.

One catalyst or luxury-biota slot adds 1.5 Coin/day at one eligible Trade
Nexus; one salvage slot adds 1.5 Coin/day at one eligible Manufactory. A Nexus
may use one of each export slot. Existing fed-town and non-Settlement-tier
industry gates apply, as do applicable town-output modifiers. Slots allocate
once in stable town-key order, avoiding duplicated credit across towns.
Unused slots earn nothing until a beneficiary becomes available. Coin
breakdowns attribute the actual allocated credit to Frontier export concessions
and Precursor reclamation; town displays use the same allocation as income.

A site needs its owning House's required Manifest even after capture. Dormant,
inactive, unfinished, neutral and ungarrisoned installations contribute
nothing. Site and beneficiary losses invalidate the existing economy caches;
network owners settle accrued income and manpower at the old rate before a
relevant tile mutation. These exclusive supply slots reward concentrated
investment without requiring continent-wide collection.

New standard 640×320 maps target 1,000 tiles of each of the five resources,
in separated deposits of 1–3 tiles. Habitat preferences and secondary biomes
are documented in [the resource-network plan](../resource-networks-plan.md).
New frontier deposits avoid towns and all eight adjacent support tiles; their
installations do not require town support. Catalysts exclude coastal sand.
The decorative lone-tree pattern is removed; resin appears as distinct groves.
Saved campaigns preserve their existing geography on recovery.

Implant Foundry shares Reserve Custody Cadre (`organized-supply`) with the
Ancillary Depot. Reclamation Works shares Industrial Tooling Module (`trade`)
with the Manufactory. Resin Extractor and export installations retain their
separate warrant/charter. There are no additional implant or salvage warrants.

Sources: `packages/shared/src/resource-networks/`,
`apps/simulation/src/resource-networks/`, `resource-networks-worldgen.ts`.

## Diplomatic resource supply

All four upkeep resources and all five frontier resources can be negotiated in
independent Resource trade offers or alongside a truce/alliance. These are
exclusive renewable slots, not a new inventory of mined stockpiles. Shards remain
a one-time transfer. Only surplus beyond current domestic use and existing export
commitments may be newly promised. Received slots cannot back another export,
although imported FOOD may operate a domestic extraction site. Accepted exports
take priority over later domestic building demand.

Supply continues until either participating House ends the agreement. Both
resource deliveries pause when either supplier loses required output and resume
when output recovers. Ending supply releases both directions immediately after
old-rate income/manpower settlement. One-time Coin and Shard payments are not
refunded for a later shortage or cancellation. Supply contracts survive the
accompanying treaty ending. Active agreements persist through recovery; new
agreements have no expiry. Historical saved agreements may still contain an expiry
and retain deadline settlement during recovery.

Independent offers can be accepted, declined or withdrawn without creating a
truce or alliance. Unaccepted offers expire after 24 hours. A payment already
being resolved cannot be withdrawn: either party finishes/retries the same accepted
payment identity before deciding whether to end its resulting supply agreement.

Starting AI negotiation values per slot are FOOD 4 Coin, Titanium 4, Crystal 6,
Umbrite 4, resin 4, conductive minerals 2, and each credit resource 1.5. These are
one-day-equivalent negotiation weights for an open-ended promise, not recurring
charges, guaranteed market prices or playtest-proven balance. Human offers can
use other prices. Limits: 16 active supply agreements per House, 256 per world;
16 pending offers per House, 256 globally; 10,000 slots per resource per offer.

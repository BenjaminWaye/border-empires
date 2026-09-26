# Resource and Manpower Economy

Status: canonical reference

This is the current-rule reference for manpower, resource slots, gold,
structures, and economic dormancy. It replaces the delivered parts of
[`../manpower-economy-rewrite-plan.md`](../manpower-economy-rewrite-plan.md),
which remains a historical design and implementation record. Verify a rule in
code and update this document in the same branch when the rule changes.

## Rule sources

| Concern | Authoritative implementation |
|---|---|
| Action costs and base/town manpower | `packages/shared/src/config.ts` |
| Structure slot requirements and supply constants | `packages/shared/src/structure-slots/structure-slots.ts` |
| Current manpower calculation | `apps/simulation/src/runtime-manpower.ts` |
| Slot demand, supply, and dormancy selection | `apps/simulation/src/resource-slot-view/resource-slot-view.ts` |
| Gold income and town support | `apps/simulation/src/player-update-economy/` |
| Build costs and placement rules | `packages/shared/src/structure-costs/` and `packages/shared/data/structure-placement-metadata.json` |

## Manpower

- Manpower is capped and regenerates. The always-present starting capital adds
  **720 cap** and **0.4/minute**; it is additive with towns.
- Town cap / regeneration by tier: Settlement 150 / 150÷720 per minute, Town
  300 / 300÷720, City 450 / 450÷720, Great City 750 / 750÷720, Metropolis
  1,350 / 1,350÷720. Terrain can adjust these values at runtime.
- Town regeneration weights: first five towns 100%, next ten 50%, later towns
  20%. The global regeneration floor is 0.15/minute.
- Structures and networks can add cap or regeneration. The runtime calculator
  is the source for those interactions (Ancillary Factory/Garrison Hall,
  Assembly Works, Logistics Guild, Rail Depot, Population Bureau, seasonal
  bonuses).
- Core action anchors: **EXPAND 10**, **SETTLE 20**, ordinary ATTACK **60**,
  and Deep Strike/Naval Infiltration **120** manpower. Structure costs are
  data-driven; inspect the registry instead of assuming a common price.

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

- Farmstead adds 2 FOOD slots to its FARM tile. Mine and Umbrite Rig each add
  1 matching-resource slot. Waterworks adds 2 FOOD slots to Farmsteads in
  range; Foundry adds 2 TITANIUM slots to Mines in range.
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

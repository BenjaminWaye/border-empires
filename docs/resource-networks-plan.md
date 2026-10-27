# Frontier resource networks

Status: implementation and validation in progress on `agent/resource-networks`
Owner: Border Empires game design / this task
Last reviewed: 2026-10-26

## Intended play

A House can turn a defensible island into a valuable industrial heartland:
explore visible deposits, commission the specialised Manifest, garrison the
site, construct its extraction installation, then protect the resulting
empire-wide production network while preparing an offensive.

Towns supply the bodies remade into Ancillaries. These resources improve
remaking and equipment, never create people. Ancillary Depots and their
existing upgrades determine storage; none of these resources increases cap.
Coin income represents additional offworld campaign credit against valuable
planetary output, concessions and contracts, not local money printing.

Canonical meanings live in [the world bible](lore/galactic-lore.md#11-houses-and-the-planetary-economy).
The [economy reference](product/resource-and-manpower-economy.md) owns shipped
rules; this document records implementation scope, rollout and visual decisions.

## Starting balance

| Deposit | Installation | Build manpower / seconds | Ongoing occupancy | Benefit from one supply slot |
|---|---|---:|---|---|
| Neural resin | Resin Extractor | 120 / 120 | 1 FOOD slot | +12 Ancillaries at one factory per 4-hour batch |
| Conductive minerals | Implant Foundry | 150 / 150 | 1 FOOD slot | +6 Ancillaries at one factory per batch |
| Catalytic deposit | Catalyst Refinery | 150 / 150 | 1 FOOD slot | +1.5 Coin/day at one active supported Trade Nexus |
| Luxury biota | Cultivation Estate | 100 / 100 | 1 FOOD slot | +1.5 Coin/day at one active supported Trade Nexus |
| Precursor salvage | Reclamation Works | 180 / 180 | 1 FOOD slot | +1.5 Coin/day at one active supported Manufactory |

Build times above are base times; existing build-speed effects apply. Build
Coin costs are zero, matching the existing physical-construction economy.
These are additive bonuses, leaving current buildings' base output and other
network upgrades intact. They never grant an immediate batch or refill.

Each active extraction installation supplies **one renewable bonus slot** of
its resource. A beneficiary uses at most one slot of each applicable type.
A factory can therefore use one resin and one conductive-mineral slot; a
Trade Nexus can use one catalyst and one luxury slot. A Manufactory can use
one salvage slot. These are optional enhancements: an unsupplied beneficiary
retains normal output. Supply does not run out over time, and occupying a slot
does not consume the deposit. Spare slots remain available for new consumers.
There is no diminishing-return tier or six-site cap.

For each resource, supplied buildings = min(active developed sites, eligible
active beneficiaries). Extra factories cannot reuse already occupied slots.

Examples:

- One resin site and ten factories give +12 Ancillaries total per batch. Nine
  factories retain their normal output until another resin slot is developed.
- Two resin sites, one mineral site and three factories give +30 total per
  batch: 2×12 + 1×6. The same supply with one factory gives +18.
- One catalyst and one luxury site support +3 Coin/day total, whether the
  House owns one Trade Nexus or twenty. Each relevant slot needs a beneficiary.
- Two salvage sites and one Manufactory supply +1.5 Coin/day, with one salvage
  slot free. A second Manufactory can use the other slot for another +1.5/day.

Credit slots are assigned in stable town-key order to eligible supported
buildings, so snapshots, town displays and actual income agree. Dormant,
lost or unsupported consumers release slots on the next economy recomputation.
The manpower pool is empire-wide, so equivalent factory assignments require
no additional persisted state or per-factory order.

Factories only receive the bonus while active and not FOOD-dormant. Credit
beneficiaries retain their normal supported-town and fed-town requirements;
Settlement-tier towns do not receive town-industry credit. Extraction sites
must be owned, garrisoned, correctly developed, active, not dormant and backed
by the owning House's required Manifest. Capture does not bypass that gate.
Loss, abandonment, construction completion, removal and slot shortfalls must
invalidate existing caches. Accrued income and manpower are settled at the
old rate before changes; an acquisition cannot boost the preceding hours.

## Technology and discovery

Deposits become identifiable when their land is explored, even before the
House has the means to develop them. Normal fog rules still apply. Existing
Titanium/Crystal/Umbrite reveal rules stay intact.

| Manifest | Branch / tier | Prerequisite | Base commission | Unlocks |
|---|---|---|---|---|
| Neural Resin Processing Warrant | Manpower / 3 | Ancillary Control Core | 10 Coin, 2h | Resin Extractor |
| Reserve Custody Cadre (`organized-supply`) | Manpower / 1 | Existing Depot unlock | 10 Coin, 8h | Ancillary Depot and Implant Foundry |
| Frontier Export Charter | Economy / 3 | Trade Circuit Charter | 10 Coin, 2h | Catalyst Refinery, Cultivation Estate |
| Industrial Tooling Module (`trade`) | Economy / 1 | Existing Manufactory unlock | 10 Coin, 1h | Manufactory and Reclamation Works |

Existing global commission-price modifiers apply. Resin and export processing
use their own warrants/charters. Implant Foundry shares the existing Depot
commission; Reclamation Works shares the existing Manufactory module, including
its active-AFC installation requirement for construction. There are no separate
Implant Metallurgy or Precursor Reclamation warrants. Houses retain technical knowledge
between campaigns. On an owned undeveloped deposit, the disabled build action
names and links the missing Manifest. It becomes a real build action when
commissioned. Each installation is restricted to its matching deposit.

## Map budget

The standard world is 640×320 (204,800 tiles), targeting **1,000 resource tiles
of each type**, or 5,000 total. At 320×160 the target is 250 each; at 160×80 it
is 63 each after rounding. These are resource-tile counts, not cluster counts.

Deposits form cardinally connected groups of **1–3 tiles**. A one-tile gap
between deposits of the same resource prevents even diagonal contact from
merging them into larger veins. Different resources may be adjacent. There
are roughly 500–650 deposits per resource, depending on coastlines and habitat.

| Resource | Preferred habitat | Secondary habitat |
|---|---|---|
| Neural resin | Forested grassland groves | Other grassland |
| Conductive minerals | Tundra and rocky grassland near hills/mountains | Other grassland |
| Catalytic deposits | Sand and coastal sand | Exposed tundra |
| Luxury biota | Tropical or wet grassland | Temperate grassland |
| Precursor salvage | Hills and mountain foothills | Any land biome |

Placement exhausts preferred habitat before secondary habitat. Geographic
32×32-sector round-robin placement spreads opportunities across the map.
Budgets scale by map area; maps without enough eligible habitat may underfill,
and generation reports the shortfall rather than overwriting occupied land.

Existing resources, towns, docks, relics, Shards, watchtowers, Waystations and
structures are preserved. The 5×5 area around an existing AFC and the clear
3×3 footprints of fifty qualified future landings remain protected. Both
synchronous and asynchronous generators call the same placement function.

The old light-grass single-tree scatter and its resin conversion are removed.
Resin is a budgeted grove resource, shown as a small stand of the existing
broadleaf trees. Resource plots replace overlapping decorative canopy in both
renderers; normal forest terrain mechanics are unchanged.

A real-pipeline check of seed 1037 on both continents and islands placed exactly
1,000 tiles of each resource, with every same-resource connected component
containing at most three tiles.

## Presentation in both renderers

A deposit remains readable beneath the developed installation. Every type has
its own silhouette and material colour, with matching SVG and instanced 3D art:

| Resource | Raw site | Developed installation |
|---|---|---|
| Neural resin / amber | Existing broadleaf tree model with amber bark seams | Tapped trees, trunk collars, pipes, collection vessel and pump |
| Conductive minerals / oxidised teal and silver | Fractured dark ridge with embedded branching metal veins, exposed plates and scree | Precision assembly workshop, press gantry and ore hopper |
| Catalysts / oxidised copper | Irregular fractured slate with thin catalyst strata | Banded distillation columns, transfer pipes, access ladder and ore bins |
| Luxury biota / wine and sage | Folded, waxy rosettes and upright scent bracts | Glazed cultivation house over planted rows |
| Salvage / weathered blue-grey | Collapsed armoured power train, exposed turbine, severed ribs and cable looms | Reclamation yard with crane and recovered machinery |

The live 3D resource dispatcher accepts all five deposit kinds; the existing
structure dispatcher handles all five installations. Shared construction
phases, scene origin placement, instancing, disposal and shadows remain in
use. Models use the existing town primitive kit, aged brass/iron/glass palette,
marble foundation, working fittings and shader-driven machinery. The 2D
resource and built-resource paths load SVGs exported from the same model
source with `node scripts/generate-network-icons.mjs`. Neither
renderer requires a new image-generation service or external asset license.

Tile details explain purpose, development building and one-slot supply.
The economy panel shows Industrial supply: occupied/total slots, free slots
and the supplied output. Both live updates and reconnects carry authoritative
counters. Manpower breakdown includes the actual resource-network regeneration delta.
Coin sources distinguish frontier export concessions and precursor reclamation.
Town income and empire credit totals use the same bonus calculation. A new
Storybook gallery shows all raw and developed models alongside their 2D art.

## Implementation stages and acceptance

1. Shared catalog: types, constants, balance formulas, structure placement,
   costs, slot requirements, schemas and Manifest unlocks.
2. Season generation: terrain-derived resin plus deterministic fixed-deposit budget, protected
   content and shared sync/async integration.
3. Economy: cached developed-site counts, real batch and Coin effects,
   current-rate settlement, loss/dormancy invalidation and display parity.
4. Client: build click dispatch, optimistic construction, Manifest links,
   descriptions, icons, live 2D/3D art and Storybook review.
5. AI: use the existing bounded economic build selector, requiring a matching
   beneficiary with an unfilled resource slot, without an arbitrary site cap.
6. Validation: shared rules/schema/placement tests; real-runtime payout,
   construction, missing-tech and partial-window loss tests; resource-site
   eligibility and generation tests; client action and visual checks; full
   local CI and README/lore/changelog updates.

No new player-history cache, resource stockpile, database column or snapshot
log is introduced. The existing tile `resource` and `economicStructure` fields
carry durable state. Counts are derived into existing invalidated economy
caches; worker planners receive existing tile/structure state.

## Rollout

This is a feature branch targeting `develop`. Clustered resource geography
applies to newly generated seasons. Recovery preserves existing deposit and
ownership state; it no longer adds the old scattered resin trees. A deployment
does not reset existing campaigns or redistribute their developed sites.
The new resources are excluded from Resource Monopoly's existing resource list.

A normal factory produces 12 Ancillaries per four-hour batch. Resin doubles
that to 24; conductive supply alone gives 18; both give 30. At base rates,
the 120-manpower extractor repays its manpower cost in 40 hours of supplied
production, while the 150-manpower foundry takes 100 hours. These payback
figures exclude technology, construction, FOOD and opportunity costs. Resin is
budgeted like the other four resources; bonuses remain bounded
by developed sites, factory count and upkeep. The foundry cost and the effect
of the larger resource budgets require playtesting before treating the values as final.

The figures above are starting balance, not evidence from a long-running
multiplayer playtest. After staging, compare developed-site counts, income
share, batch size and time to first useful installation for small islands
versus large empires before changing the constants.

### Three cosmetic deposit variants

Each frontier resource has three authored raw-site models. World-tile coordinates
choose the variant consistently in the true-3D renderer and the matching exported
2D sprites; camera-relative coordinates never choose a variant. Standardised
extraction buildings retain their installation models. These cosmetic variants do
not change deposits, supply slots, biome eligibility or map counts. The existing
native broadleaf mesh remains the source for every resin grove. Storybook's
`Map/Resources/Resource Networks / Three Variants` compares all three of a resource;
Deposit Review also has a variant selector. Lore reviewed; no canon change.

Reclamation Works use a four-legged bridge crane lifting an armour section from a clamped precursor wreck, with a roller sorting bed and adjoining recovery workshop. The 2D overlay and building icon are exported from the same production model. This is a cosmetic readability update; supply and yields are unchanged. Lore reviewed; no canon change.

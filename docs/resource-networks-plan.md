# Frontier resource networks

Status: implementation and validation in progress on `agent/resource-networks`
Owner: Border Empires game design / this task
Last reviewed: 2026-10-25

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

| Deposit | Installation | Build manpower / seconds | Ongoing occupancy | Benefit per effective developed site |
|---|---|---:|---|---|
| Neural resin | Resin Extractor | 120 / 120 | 1 FOOD slot | +4 Ancillaries per factory per 4-hour batch |
| Conductive minerals | Implant Foundry | 150 / 150 | 1 FOOD slot | +2 Ancillaries per factory per batch |
| Catalytic deposit | Catalyst Refinery | 150 / 150 | 1 FOOD slot | +0.5 Coin/day per active supported Trade Nexus |
| Luxury biota | Cultivation Estate | 100 / 100 | 1 FOOD slot | +0.5 Coin/day per active supported Trade Nexus |
| Precursor salvage | Reclamation Works | 180 / 180 | 1 FOOD slot | +0.5 Coin/day per active supported Manufactory |

Build times above are base times; existing build-speed effects apply. Build
Coin costs are zero, matching the existing physical-construction economy.
These are additive bonuses, leaving current buildings' base output and other
network upgrades intact. They never grant an immediate batch or refill.

For each resource independently, sites 1–3 count fully, sites 4–6 count half,
and sites 7 onward add no bonus. Effective count is therefore capped at 4.5.
Extra sites still provide redundancy and deny opponents access. The cap is
empire-wide, not per town or building, and applies before multiplication by
beneficiary count. It prevents unlimited deposit-by-factory growth, while
additional factories and Manufactories remain useful.

Examples:

- Two resin sites and one mineral site give each factory +10 Ancillaries per
  batch. Four factories receive +40 per complete four-hour window.
- Six resin and six mineral sites give +27 per factory per batch. The base
  standalone factory provides +12, so the fully supplied standalone factory
  provides 39 before existing Neural Works and other effects.
- Two catalyst sites and one luxury site give +1.5 Coin/day per Trade Nexus.
- Two salvage sites and four Manufactories add +4 Coin/day in total.
- Maximum extra credit is +4.5 Coin/day per Trade Nexus and +2.25/day per
  Manufactory, before the existing applicable town-output effects.

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
| Implant Metallurgy Warrant | Manpower / 3 | Ancillary Control Core | 10 Coin, 2h | Implant Foundry |
| Frontier Export Charter | Economy / 3 | Trade Circuit Charter | 10 Coin, 2h | Catalyst Refinery, Cultivation Estate |
| Precursor Reclamation Warrant | Economy / 3 | Prospector Crew | 10 Coin, 2h | Reclamation Works |

Existing global commission-price modifiers apply. These are charter/warrant
Manifests, so they do not occupy additional AFC module slots. They authorise
local processing or commercial arrangements; Houses retain technical knowledge
between campaigns. On an owned undeveloped deposit, the disabled build action
names and links the missing Manifest. It becomes a real build action when
commissioned. Each installation is restricted to its matching deposit.

## Map budget

The standard world is 640×320 (204,800 tiles):

| Deposit | Sites per standard map |
|---|---:|
| Neural resin | 180 |
| Conductive minerals | 180 |
| Catalytic deposit | 150 |
| Luxury biota | 150 |
| Precursor salvage | 120 |
| **Total** | **780** |

Each site is one developable tile. Counts scale with total map area, rounded
per type: at 320×160 the targets are 45/45/38/38/30 (196 total). At 160×80 they
are 11/11/9/9/8 (48 total). Custom maps with insufficient eligible land place
as many as they can without overwriting existing content.

Placement is seeded and deterministic, distributed round-robin across 32×32
geographic sectors. It uses unoccupied LAND and preserves existing slot
resources, towns, docks, relics, Shards, watchtowers, Waystations and structures.
The 5×5 area around an existing landing AFC is protected. Both synchronous
and asynchronous season generators use the same placement function. This
provides regional spread, not a guarantee that every small island has every
resource. Expansion or trade in territory remains useful.

## Presentation in both renderers

A deposit remains readable beneath the developed installation. Every type has
its own silhouette and material colour, with matching SVG and instanced 3D art:

| Resource | Raw site | Developed installation |
|---|---|---|
| Neural resin / amber | Sap-bearing trees | Trees connected to a brass collection vat |
| Conductive minerals / turquoise | Dark rock with bright seams | Implant workshop with induction coil and service mast |
| Catalysts / pale gold | Ochre ore outcrop | Twin separation columns with pale ore fittings |
| Luxury biota / rose | Flowering native shrubs | Glazed cultivation house over planted rows |
| Salvage / weathered blue-grey | Broken machine pylons and a buried ring | Reclamation yard with crane and recovered machinery |

The live 3D resource dispatcher accepts all five deposit kinds; the existing
structure dispatcher handles all five installations. Shared construction
phases, scene origin placement, instancing, disposal and shadows remain in
use. The 2D resource and built-resource paths load dedicated SVGs. Neither
renderer requires a new image-generation service or external asset license.

Tile details explain purpose, development building and diminishing returns.
Manpower breakdown includes the actual resource-network regeneration delta.
Coin sources distinguish frontier export concessions and precursor reclamation.
Town income and empire credit totals use the same bonus calculation. A new
Storybook gallery shows all raw and developed models alongside their 2D art.

## Implementation stages and acceptance

1. Shared catalog: types, constants, balance formulas, structure placement,
   costs, slot requirements, schemas and Manifest unlocks.
2. Season generation: exact deterministic area-scaled budget, protected
   content and shared sync/async integration.
3. Economy: cached developed-site counts, real batch and Coin effects,
   current-rate settlement, loss/dormancy invalidation and display parity.
4. Client: build click dispatch, optimistic construction, Manifest links,
   descriptions, icons, live 2D/3D art and Storybook review.
5. AI: use the existing bounded economic build selector, requiring a matching
   beneficiary and stopping extraction development at six per resource.
6. Validation: shared rules/schema/placement tests; real-runtime payout,
   construction, missing-tech and partial-window loss tests; resource-site
   eligibility and generation tests; client action and visual checks; full
   local CI and README/lore/changelog updates.

No new player-history cache, resource stockpile, database column or snapshot
log is introduced. The existing tile `resource` and `economicStructure` fields
carry durable state. Counts are derived into existing invalidated economy
caches; worker planners receive existing tile/structure state.

## Rollout

This is a feature branch targeting `develop`. Existing campaigns do not gain
or lose deposits on restart. Generation takes effect for a newly generated
season after the change is deployed. A season reset is a separate operational
action, never an incidental part of installing this feature. Existing worlds
remain playable with zero network deposits and retain their prior economy.
The new resources are excluded from Resource Monopoly's existing resource list.

The figures above are starting balance, not evidence from a long-running
multiplayer playtest. After staging, compare developed-site counts, income
share, batch size and time to first useful installation for small islands
versus large empires before changing the constants.

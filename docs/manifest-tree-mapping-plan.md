# Manifest tree — final name/classification/lore/unlock mapping

Status: naming, classification, lore, and unlock pass for the Manifest rework
(see PR #2085, branch `agent/manifest-tech-data-cleanup`). Preserve the
existing branch shape and prerequisites in `tech-tree.json` unless explicitly
noted below — this document does not change tree structure, only what each
node is called, how it's classified, and what it delivers.

This supersedes the Economy/Manpower/War/Aether Manifest names and card-copy
direction used earlier in the Phase 5/6 planning notes for this PR. It does
not change Phases 1–4, which are already implemented and merged into this
branch (Coin rename, synthesizer upkeep, structure renames, Seed Granary
deletion).

## Core rules

- Coin is paid offworld through the House factor. It never pays local
  workers, grants local permission, or represents generic research.
- Every Manifest must name what arrives from space, using one of these four
  categories:
  1. **AFC MODULE** — durable imported machinery. It lands physically and
     enables a reusable construction/casting capability.
  2. **CREW / OFFICE / CONSIGNMENT** — imported personnel, instruments, or
     biological cargo. They remain on this planet.
  3. **CHARTER / WARRANT** — access to an Imperial offworld market,
     recognition system, or unique supply chain. Do not use these for
     things the player already owns locally.
  4. **DOSSIER** — reserves an offworld Project Core for a unique
     monumental project.
- Crystal fuels Aether casts. Coin buys the offworld capability that makes
  those casts possible.
- Do not say Coin pays locals, "reclaims local infrastructure," or unlocks
  abstract knowledge.
- Aether hardware modules should visually dock as smaller cartridges around
  the Aether Resonance Core, rather than each becoming a separate giant AFC
  overlay.

## Current tech → Manifest mapping

| Current tech | Replacement Manifest |
|---|---|
| Agrarian Works | Hyperfeed Seedstock Consignment |
| Merchant Charters | Trade Clearance Grant |
| Deep Shaft Mining | Prospector Crew |
| Hydraulic Works | Hydroworks Engineering Crew |
| Kiln Craft | Incubation Corps |
| Artisan Workshops | Umbrite Synthesis Module |
| Double-Entry Ledgers | Trade Circuit Charter |
| Minting Works | Imperial Tender Warrant |
| Alchemical Forges | Titanium Synthesis Module |
| Steam-Driven Extraction | Tuned Separation Process |
| Bureaucratic Reform | Provincial Stewardship Corps |
| Aether-Infused Synthesis | Catalyst Fabricator Module |
| Grand Bazaars | Imperial Exchange Dossier |
| Supply Directorate | Reserve Custody Cadre |
| Census Bureau | Census Office |
| The Remade Concordat | Ancillary Control Core |
| Conveyor Networks | Reserve Lattice Module |
| Rail & Wire Networks | Neural Assembly Core |
| Demographic Registry | Population Registry Dossier |
| Grand Levy Doctrine | Titanium Levy Dossier |
| Titanium-Clad Masonry | Titanium Forge Module |
| Reinforced Plating | Bastion Master-Die Module |
| Steel Foundries | Thunderplate Induction Module |
| Rigging Works | Rigging Works Module |
| Siege Engineering | Siege Lens Foundry Module |
| Standing Legion | Dread Tower Cadre |
| Muster Discipline | Hive Mind Module I |
| Muster Command | Hive Mind Module II |
| Worldbreaker Doctrine | Sovereign Siege Engine Dossier |
| Aegis Doctrine | Aegis Dome Dossier |
| Aetheric Resonance | Aether Resonance Core |
| Survey Sweep | Echo-Reader Crew |
| Cipher Craft | Counterphase Core Module |
| Covert Logistics | Transposition Array Module |
| Harbor Engineering | Aetherward Coil Module |
| Terrain Shaping | Geoform Engine Module |
| Beacon Network | Augury Office |
| Celestial Navigation | Tideway Lattice Module |
| Sky Vessel Engineering | Stratospheric Dockyard Module |
| Resonance Detection | Resonance Grid Module |
| Astral Doctrine | Astral Dock Dossier |

### New node — split from Aether-Infused Synthesis

| New Manifest | Unlock |
|---|---|
| Matterwright Retort Module | Aether Retort, including Umbrite as a selectable output |

### Split of old Harbor Engineering effects

- **Harbor Exchange** moves to **Trade Circuit Charter**.
- **Aether Wall** stays on **Aetherward Coil Module**.

## Economy

- **Hyperfeed Seedstock Consignment** — imported adaptive crop stock; unlocks Hydrogardens.
- **Prospector Crew** — imported specialists; unlocks Mines.
- **Hydroworks Engineering Crew** — imported water engineers; unlocks Hydroworks.
- **Tuned Separation Process** — offworld industrial process adapted to the planet's ore; unlocks Ore Refinery, which improves nearby Mine output.
- **Titanium Synthesis Module** — AFC module; unlocks Titanium Works.
- **Umbrite Synthesis Module** — AFC module; unlocks Umbrite Works.
- **Trade Clearance Grant** — offworld trade recognition; unlocks Mintworks.
- **Trade Circuit Charter** — offworld trade/freight settlement arrangement; unlocks Trade Nexus and Harbor Exchange.
- **Imperial Tender Warrant** — makes this planet's Coin accepted by Imperial factors; unlocks Clearing House.
- **Provincial Provisioning Charter / Stewardship Corps** — final preferred name TBD, but it must be an offworld administrative capability that unlocks Provincial Provisioning Office and its food-demand effect.
- **Catalyst Fabricator Module** — AFC module; unlocks Advanced Umbrite Works, Advanced Titanium Works, and Advanced Aether Condensers. It manufactures sealed catalyst hearts; advanced converters produce 20% more and retain their higher Coin refining cost.
- **Imperial Exchange Dossier** — unique project dossier.

## Manpower

- **Reserve Custody Cadre** — imported custody specialists; unlocks Ancillary Depot (+150 Manpower cap).
- **Incubation Corps** — imported biological/medical contingent; unlocks Incubation Engine.
- **Census Office** — imported census administrators and systems; unlocks Census Hall.
- **Ancillary Control Core** — AFC module; unlocks Ancillary Factory (+0.05 Manpower/min).
- **Reserve Lattice Module** — AFC module; unlocks Reserve Lattice (+150 cap and +35% terrain-adjusted base capacity; former Assembly Works stats).
- **Neural Assembly Core** — AFC module; unlocks Neural Works (+0.1 Manpower/min per Ancillary Factory in its connected town network).
- **Population Registry Dossier** — Population Bureau project.
- **Titanium Levy Dossier** — Titanium Levy project.

## War

- **Titanium Forge Module** — AFC module; unlocks Fort and Titanium Weapons Factory.
- **Bastion Master-Die Module** — AFC module; unlocks Titanium Bastion. It is the massive forming die that makes interlocking Bastion shells from Forge-produced plate.
- **Thunderplate Induction Module** — AFC module; unlocks Thunder Bastion. It contains the induction coils/discharge rails required for live Thunderplate armour.
- **Rigging Works Module** — AFC module; unlocks Umbrite Rig, Siege Outpost, and Umbrite Weapons Factory.
- **Siege Lens Foundry Module** — AFC module; unlocks Siege Tower.
- **Dread Tower Cadre** — imported permanent operating crew; unlocks Dread Tower.
- **Hive Mind Module I / II** — AFC modules, each delivers another offworld half-mind and unlocks one additional regional Muster commander.
- **Sovereign Siege Engine Dossier** — unique project.
- **Aegis Dome Dossier** — unique project.

## Aether

- **Aether Resonance Core** — AFC module; unlocks Aether Tower, Aether Condenser, and Aether Purge.
- **Echo-Reader Crew** — imported specialists using the local Crystal lattice as a sounding board; unlocks Survey Sweep. Sweep must reveal hidden towns, Titanium, Gems, and Umbrite.
- **Augury Office** — imported Unblinking Dial, locally cut lenses, and Dial Augurs; unlocks Reveal Empire and Reveal Stats.
- **Counterphase Core Module** — AFC module; unlocks Aether EMP.
- **Aetherward Coil Module** — AFC module; unlocks Aether Wall.
- **Transposition Array Module** — AFC module; unlocks Aether Siphon.
  - **Required implementation change:** Siphon transfers all target-field output to the caster for one hour. Current code deletes 100% of target output instead.
- **Tideway Lattice Module** — AFC module; unlocks Aether Bridge.
- **Geoform Engine Module** — AFC module; unlocks raising/removing mountains.
- **Stratospheric Dockyard Module** — AFC module; unlocks Sky Dock.
- **Resonance Grid Module** — AFC module; unlocks Resonance Grid, which denies enemy aerial bombardment in its radius.
- **Matterwright Retort Module** — AFC module; unlocks Aether Retort. Retort output options must include Umbrite.
- **Astral Dock Dossier** — unique project.

### Important Aether copy rule

Never describe Aether abilities as "research," local civic spending, or
someone selling a spell. Coin commissions a specific offworld payload; the
Core/module arrives, docks with the House's AFC/Tower system, and Crystal
powers its active use.

Keep the in-game building names: Aether Tower, Sky Dock, Trade Nexus,
Harbor Exchange, Aether Condenser, Ancillary Factory, Neural Works,
Hydrogarden, Hydroworks, and so on.

## Fabrication Yard replaces the starting Settlement (Phase 6 design decision)

Not yet implemented — Fabrication Yards don't exist in the codebase at all
yet (this is the original 11-phase plan's Phase 6). Recorded here so the
decision survives to when Phase 6 actually starts.

- A House's very first tile is the Fabrication Yard (AFC) itself, not a
  SETTLEMENT-tier town. This is starting-placement only — every other town a
  player settles later still uses the normal SETTLEMENT→TOWN→CITY→
  GREAT_CITY→METROPOLIS tier progression; only the House's opening tile
  changes.
- Rationale: thematically, the House arrives and deploys offworld industrial
  capability rather than spawning with an abstract native settlement.
  Mechanically, replacing the Settlement outright (rather than placing the
  Yard *alongside* it, per the original Phase 6 §4 text) would leave the
  player with zero starting Coin/Manpower until they manually settle a first
  real town — an unwanted early-game dead spot.
- Fix: the Fabrication Yard itself grants the same baseline economic output
  a SETTLEMENT-tier town currently provides, before terrain scaling:
  - Manpower cap: 150 (`TOWN_MANPOWER_BY_TIER.SETTLEMENT.cap`)
  - Manpower regen: 150/720 per minute (`TOWN_MANPOWER_BY_TIER.SETTLEMENT.regenPerMinute`)
  - Coin income: 2/288 per minute (`SETTLEMENT_BASE_GOLD_PER_MIN`,
    `server-game-constants.ts`)
- Open questions for whoever picks up Phase 6 implementation: whether the
  Yard's baseline output should still scale with the tile's terrain profile
  (the way a real SETTLEMENT-tier town's cap/regen/gold do via
  `terrainAdjustedTownManpower`/`townTerrainModifiers`), and whether the Yard
  counts as a "town" for `manpowerRegenWeightForSettlementIndex` purposes
  (the per-town regen-weight taper) and for dock/network adjacency checks.
  Not decided yet.

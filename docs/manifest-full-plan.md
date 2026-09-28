# Border Empires — latest full Manifest plan

Status: active proposal, in progress on `agent/manifest-tech-data-cleanup` (PR #2085)

Pasted verbatim from the user on 2026-09-26 (branch `agent/manifest-tech-data-cleanup`,
PR #2085). This is the authoritative source for the Manifest/Coin/AFC/Module
rework going forward, superseding ad-hoc notes in
`docs/manifest-tree-mapping-plan.md` wherever the two disagree — except the
one resolved contradiction below.

## Progress report (updated 2026-09-28)

Status against §10 (implementation order):

| # | Step | Status |
|---|---|---|
| 1 | Preserve tech IDs, rename-only | Done |
| 2 | Gold → Coin (display text; internal field names unchanged) | Done |
| 3 | Manifest metadata (`manifestCategory` per tech) | Done for category; delivery type / visual asset still open |
| 4 | AFC module state, assignment, capture/dormancy, delivery events | AFC tile, spawn, reach, economy, capture/reassignment, auto-docking of AFC-Module techs and §4 capture rule (regression-tested) done; delivery events not started |
| 5 | Rename/re-map buildings, remove Seed Granary | Done |
| 6 | Target tech-to-Manifest mapping | Done |
| 7 | Split Matterwright Retort from Catalyst Fabricator | Done |
| 8 | Harbor Exchange → Trade Circuit Charter | Done |
| 9 | Aether ability corrections (§7) | **Done** — see `docs/manifest-aether-fixes-plan.md` and `docs/manifest-retort-recast-plan.md`. Item 8 (Siphon) is a decided skip; item 9 (Retort) is now implemented end-to-end |
| 10 | Delivery animation / overlay / asset set | AFC + 13 of 22 AFC-Module overlays are now **rendered in both map renderers** (true-3D: full per-socket module ring; 2D: a distinct AFC glyph only, no per-module detail — see below). The other 9 modules are being built on a separate branch/PR. Delivery *animation* (the orbital-streak/impact sequence in §9) not started |
| 11 | Coin balance | Deferred until playable |

PR #2085 carries steps 1-9 plus module docking and a first slice of step 10's
asset library; `develop` was merged into it twice on 2026-09-27 (conflicts
resolved each time; second merge also picked up a new repo-wide `check:docs`
gate, satisfied by adding `Status:` lines to the four Manifest planning docs).

### §7 item 9 implemented (2026-09-28)

Retort Transmutation (`RETORT_RECAST`) now works end-to-end — see
`docs/manifest-retort-recast-plan.md` for the design. It had a full client
UI but was missing from three separate command-registration lists (the
durable-command schema plus two gateway allowlists), so it was silently
dropped before reaching a server that, until now, had no handler for it at
all. Added the handler (mirrors `handleCreateMountainCommand`'s pattern:
owned-tile + observatory-range + cooldown gated, rejects a same-class
recast), registered the command type everywhere required, added Umbrite as
a fourth recast target (the ability's own description already promised
it), and fixed the client's stale "Requires Aether-Infused Synthesis"
reason string. This closes out §7 entirely (item 8 is a decided skip).

### §10 step 10: AFC/module 3D overlay assets merged from PR #2119 (2026-09-28)

Merged `agent/fabrication-complex-3d` (PR #2119) into this branch: the AFC's
own dockable-module-socket overlay (`client-map-3d-fabrication-complex.ts`)
plus 12 of the 22 AFC-Module-category techs' module overlays, each with a
regression suite and Storybook stories.

**Now wired into both map renderers** (2026-09-28, see
`docs/manifest-afc-overlay-wiring-plan.md` for the design): an AFC tile
renders its full reactor model in the true-3D renderer, with a docked
module cartridge in its socket ring for each of the 12 covered families a
player has commissioned (up to the asset's fixed 8-socket cap; anything
beyond that, or any of the still-uncovered 10 families, docks invisibly —
not a bug, a known limitation until the socket cap or the remaining art
is addressed). The 2D canvas renderer shows a simpler, distinct AFC glyph
per this repo's renderer-parity rule (no per-module detail — stated
explicitly, not silently missing). New `client-map-3d-afc-module-family.ts`
is the single place a future branch adding the remaining 10 families needs
to touch; `client-map-3d.ts`/`client-runtime-loop.ts` never need to change
again for a new module family.

Covered (13 of 22 AFC-Module techs, by tech id — module name):
`masonry` (Titanium Forge), `leatherworking` (Rigging Works),
`crystal-lattices` (Aether Resonance Core), `workshops` (Umbrite
Synthesis), `siegecraft` (Siege Lens Foundry), `logistics` (Transposition
Array), `harborcraft` (Aetherward Coil), `terrain-engineering` (Geoform
Engine), `navigation` (Tideway Lattice), `aeronautics` (Stratospheric
Dockyard), `radar` (Resonance Grid), `matterwright-retort` (Matterwright
Retort), `alchemy` (Titanium Synthesis, wired 2026-09-28 after merging
`develop` -- the asset landed there directly from the separate
remaining-modules branch/PR; picking it up was a one-line registry
addition, exactly as this file's own header comment promised).

**Still missing a 3D overlay (9 of 22) — in progress on a separate branch/PR,
not this one:**
- `advanced-synthetication` — Catalyst Fabricator Module
- `remade-concordat` — Ancillary Control Core
- `conveyor-networks` — Reserve Lattice Module
- `global-trade-networks` — Neural Assembly Core
- `fortified-walls` — Bastion Master-Die Module
- `steelworking` — Thunderplate Induction Module
- `muster-discipline` — Hive Mind Module I
- `muster-command` — Hive Mind Module II
- `cryptography` — Counterphase Core Module

Per user direction (2026-09-28): another agent/PR is building the rest of
these, to be merged the same way PR #2119 and (per-module, as each lands
on `develop`) `alchemy` were. Do not duplicate that work here -- when
`develop` picks up another family's asset, wiring it in is a one-line
registry addition in `client-map-3d-afc-module-family.ts` plus bumping
the covered/missing lists here and the registry's own test count.

Verified (2026-09-28): full client suite green at 3300/3300 (494/494 files),
`tsc --noEmit` clean, `check:file-lines` clean. Wiring the AFC overlay
group's `update(nowMs)` onto `client-map-3d.ts`'s shared per-frame update
line initially broke `client-map-3d-reach-overlay-throttle-regression.test.ts`
(a source-text-slicing test with a fixed-size character window) by shifting
`renderReachOverlay3DPylons(nowMs)` past the window boundary; fixed by
moving that one call onto the `renderReachOverlay3DPylons(nowMs)` line
instead, after it, leaving the window's earlier offsets unchanged.

### New: AFC tile overview UI (added to backlog 2026-09-28)

Not yet covered anywhere else in this plan: the AFC needs its own tile
overview panel (the equivalent of a town's tile-menu economy/stat view)
showing its docked Module slots in a readable UI — which Manifest modules
are docked, presumably grouped by the Economy/Manpower/War/Aether
attachment families §4 describes, rather than dumping a bare list. Today
`afc-module-commissioning.ts` tracks `Tile["afc"].modules` (an array of
docked tech ids) but nothing client-side surfaces it — tapping an AFC tile
shows only the generic "Automated Fabrication Complex" title
(`client-tile-menu-title.ts`), no module list. Scope: a dedicated
tile-overview component (mirroring how `client-tile-overview-modifiers.ts`
/ the town stat grid present a settled town's state) that reads
`tile.afc.modules`, resolves each tech id to its Manifest display name via
the existing tech catalog, and groups/labels them by category. This is
presentation-only (no new server state) and does not depend on the 3D
delivery-animation work in §9/§10 above -- it can ship before or
independently of any module having a docked 3D overlay.

**Implemented (2026-09-28)**: see `docs/manifest-afc-tile-overview-plan.md`
for the design and its "Execution notes" for what shipped. The
Economy/Manpower/War/Aether grouping the paragraph above calls "presumably"
needed turned out to already exist as `TechInfo.branch` per module tech
(verified against every one of the 22 AFC-Module techs matching §6's own
table) -- no new mapping table required, just a lookup against the
client's existing `state.techCatalog`. Tapping an AFC now lists every
commissioned module grouped under those 4 headings, with a "Dormant"
banner when the AFC is inactive, reusing the existing
`TileOverviewLine` group/nested/dormant rendering primitives rather than
a new stat-grid component (no new stylesheet needed either). New
`client-afc-module-overview/client-afc-module-overview.ts` +
`client-tile-menu-view-afc.test.ts` (9 tests total); full
`client-tile-menu-view`/`client-tile-overview-modifiers` suites verified
green (129/129); `tsc`/`check:file-lines`/`check-docs`/changelog gate all
clean.

A post-merge review pass (2026-09-27) cross-checked the branch's diff
against this plan and `docs/manifest-aether-fixes-plan.md`'s own claims,
rather than trusting either at face value. Findings, all fixed on this
branch:
- Two test fixtures still granted the pre-Phase-9a `surveying` tech where
  the ability-gating fix now requires `beacon-towers` (reveal_empire /
  reveal_empire_stats), so they exercised the wrong rejection path:
  `apps/simulation/src/runtime/runtime.reveal-empire-stats-perf.test.ts`
  (a perf-suite fixture, not part of the default `pnpm test` run — this is
  why the original Phase 9a work missed it) and
  `apps/simulation/src/runtime/runtime-truce-sync.test.ts` (its truce-block
  assertion still passed, but vacuously — for the wrong reason).
- Four player-facing requirement-hint strings were missed by the Phase 9a
  sweep and still named the old tech instead of its Manifest name: Survey
  Sweep ("requires Surveying" → "requires Echo-Reader Crew",
  `runtime-ability-command-handlers.ts`), Siphon ("requires Logistics" →
  "requires Transposition Array Module", both
  `runtime-siphon-command-handlers.ts` and the client's
  `client-crystal-targeting.ts`), and Create/Remove Mountain ("requires
  Terrain Engineering" → "requires Geoform Engine Module",
  `runtime-map-command-handlers.ts`). All were copy-only — the actual
  gating logic already read the unified `ABILITY_DEFS` correctly in every
  case checked.
- Everything else reviewed (ability-gating unification across every
  server/client call site, the Aether EMP handler's radius/duration/
  cascade-via-`isStructurePowered` logic and wire plumbing, `tech-tree.json`
  `manifestCategory` values against §3/§6's tables, and
  `afc-module-commissioning.ts`'s idempotency/tie-break/no-cap behavior)
  checked out correct against this plan and §4's capture rule.
- Confirmed §7 items 8 (Siphon redesign) and 9 (Retort/`RETORT_RECAST`
  handler + Umbrite target) remain genuinely untouched, matching
  `docs/manifest-aether-fixes-plan.md`'s own "Remaining" list — no gap that
  doc had missed.

---

## Resolved contradictions / corrections

- **Settlement vs AFC at spawn**: §4 below says the AFC sits *beside* the
  starting Settlement, not replacing it. This session had already
  implemented and merged AFC-replaces-Settlement (the House's opening/
  respawn tile is an AFC instead of a SETTLEMENT-tier town, inheriting its
  flat Manpower/Coin baseline — see `docs/manifest-tree-mapping-plan.md`).
  **Decided: keep AFC-replaces-Settlement as shipped.** §4's "does not
  replace the Settlement" line is stale relative to that earlier decision
  and does not apply. Everything else in this document stands.
- **§7 item 1** ("Make Crystal costs real and server-authoritative for
  every Aether cast") is **incorrect** — Crystal costs are already real and
  server-authoritative. Skip this item when working through §7.

---

## 1. The core fiction

A House does not forget how to build things between planets.

Each seasonal invasion begins with a deliberately limited landing package: a
Settlement, an AFC, basic House knowledge, and standard equipment. The
House conquers towns and turns their output into Coin.

Coin is paid offworld through the House factor. It buys additional assets
from the wider Empire:

- machines fabricated offworld and dropped to the AFC;
- specialist crews and instruments transported to the planet;
- Imperial market access and project supply chains.

Coin is a recognised claim on the conquered world's output: food, freight,
ore, manufacturing, tolls, and future exports. The factor accepts it
because the House now controls that output. It is not wages paid to
locals and it is not generic research.

The purchased asset remains deployed on that planet. On the next seasonal
world, the House still knows what it is doing, but needs to commission
another copy of the relevant machine, crew, or service.

## 2. Resource model

| Resource | Meaning | Main use |
|---|---|---|
| Manpower | Captured/remade bodies under House control | Expansion, armies, building |
| Coin | Offworld purchasing credit backed by planetary output | Commission Manifests, rush construction, active converter operation |
| Crystal | Aether fuel | Cast Aether abilities |
| Titanium / Umbrite | Strategic materials | Buildings, military, upgrades |

Terrain should affect actual local surplus, not abstract "authorisation":

- fertile land supports food and population;
- coasts create freight, ports, and trade;
- mountains and deposits support extraction;
- arid terrain supports salvage, concessions, or specialised extraction;
- terrain drives local Coin and Manpower potential because it changes what
  the House can export or exploit.

Do not remove the active Coin drain from synthesizers in Refine mode. It is
their operating cost. Sell Off mode produces Coin and has no such drain.

## 3. Manifest categories

| Category | What Coin buys | Physical behaviour |
|---|---|---|
| AFC Module | Durable imported machine capability | Drops to an AFC; visible module/attachment |
| Crew / Office / Consignment | Imported staff, instrument, genetic stock, or specialist service | Arrives by drop/transport; no giant AFC attachment |
| Charter / Warrant | Offworld market, recognition, or factor service | No local "permission" fiction |
| Dossier | Access to an offworld unique-project supply chain | Enables a Great Project, not an instant exclusive claim |

A module is not merely "something technical." It is a substantial offworld
machine that lets the House fabricate, operate, or deploy a whole category
of capability.

## 4. AFC and physical-delivery rules

Every player starts with an Automated Fabrication Complex beside the
initial Settlement. It does not replace the Settlement.

> See "Resolved contradictions" above — this session keeps AFC-replaces-
> Settlement as already shipped; this line does not apply.

Additional AFCs may be established on owned land near a Settlement; they
exist to spread risk, not to impose an arbitrary loadout cap.

Module commission selects an AFC destination. There is no artificial
module-capacity system.

If an AFC is captured, its modules become dormant or inaccessible to the
original owner; they remain visible and strategically valuable. Do not
erase a whole branch or cancel existing buildings.

Reassignment after recapture should not charge Coin again.

Economy, Manpower, and War modules are distinct AFC attachments.

Aether modules visually dock as smaller cartridges around the Aether
Resonance Core, avoiding nine separate giant factory overlays.

## 5. Great Projects

Dossiers do not let a player lock everyone else out merely by buying plans.

Commissioning a Dossier is free where appropriate; Imperial Exchange
Dossier is definitely free.

The player builds required project components in sequence in one city.

When construction is complete, the player makes the final atomic Coin
payment to activate the unique Project Core.

The first player to activate the Core receives the unique project.

Rivals can destroy or dismantle unfinished works; partial Manpower recovery
is allowed.

Coin buys delivery/activation of the rare Project Core, not a monopoly on a
document.

## 6. Complete target Manifest tree

### Economy

| Current tech | Replacement Manifest | Type | Unlock / purpose |
|---|---|---|---|
| Agrarian Works | Hyperfeed Seedstock Consignment | Consignment | Hydrogardens |
| Merchant Charters | Trade Clearance Grant | Grant | Mintworks |
| Deep Shaft Mining | Prospector Crew | Crew | Mines |
| Hydraulic Works | Hydroworks Engineering Crew | Crew | Hydroworks |
| Artisan Workshops | Umbrite Synthesis Module | AFC Module | Umbrite Works |
| Double-Entry Ledgers | Trade Circuit Charter | Charter | Trade Nexus and Harbor Exchange |
| Minting Works | Imperial Tender Warrant | Warrant | Clearing House; this planet's Coin becomes accepted Imperial tender |
| Alchemical Forges | Titanium Synthesis Module | AFC Module | Titanium Works |
| Steam-Driven Extraction | Tuned Separation Process | Offworld industrial process | Ore Refinery; richer Mine output |
| Bureaucratic Reform | Provincial Stewardship Corps | Crew | Provincial Provisioning Office; territory-scale food allocation |
| Aether-Infused Synthesis | Catalyst Fabricator Module | AFC Module | Advanced Umbrite Works, Advanced Titanium Works, Advanced Aether Condensers |
| Grand Bazaars | Imperial Exchange Dossier | Dossier | Imperial Exchange project |

The Catalyst Fabricator makes sealed catalyst hearts. Advanced converters
synthesize 20% more than the basic versions and retain their higher Coin
cost in Refine mode.

### Manpower

| Current tech | Replacement Manifest | Type | Unlock / purpose |
|---|---|---|---|
| Supply Directorate | Reserve Custody Cadre | Crew | Ancillary Depot; +150 Manpower cap |
| Kiln Craft | Incubation Corps | Crew | Incubation Engine; population burst and growth |
| Census Bureau | Census Office | Office | Census Hall; population/city upgrade benefits |
| The Remade Concordat | Ancillary Control Core | AFC Module | Ancillary Factory; +0.05 Manpower/min |
| Conveyor Networks | Reserve Lattice Module | AFC Module | Reserve Lattice; +150 cap and +35% terrain-adjusted base capacity |
| Rail & Wire Networks | Neural Assembly Core | AFC Module | Neural Works; +0.1 Manpower/min per Ancillary Factory in its connected network |
| Demographic Registry | Population Registry Dossier | Dossier | Population Bureau project |
| Grand Levy Doctrine | Titanium Levy Dossier | Dossier | Titanium Levy project |

The Ancillary Factory and Neural Works are conversion/regeneration
buildings. The Ancillary Depot is storage. The Reserve Lattice inherits the
old Assembly Works capacity statistics.

### War

| Current tech | Replacement Manifest | Type | Unlock / purpose |
|---|---|---|---|
| Titanium-Clad Masonry | Titanium Forge Module | AFC Module | Fort, Titanium Weapons Factory |
| Reinforced Plating | Bastion Master-Die Module | AFC Module | Titanium Bastion |
| Steel Foundries | Thunderplate Induction Module | AFC Module | Thunder Bastion |
| Rigging Works | Rigging Works Module | AFC Module | Umbrite Rig, Siege Outpost, Umbrite Weapons Factory |
| Siege Engineering | Siege Lens Foundry Module | AFC Module | Siege Tower |
| Standing Legion | Dread Tower Cadre | Crew | Dread Tower |
| Muster Discipline | Hive Mind Module I | AFC Module | One additional regional Muster commander |
| Muster Command | Hive Mind Module II | AFC Module | A second additional regional Muster commander |
| Worldbreaker Doctrine | Sovereign Siege Engine Dossier | Dossier | Sovereign Siege Engine project |
| Aegis Doctrine | Aegis Dome Dossier | Dossier | Aegis Dome project |

War-module logic:

- Titanium Forge makes ordinary structural plate and Fort components.
- Bastion Master-Die forms plate into the interlocking Titanium Bastion
  shell.
- Thunderplate Induction Module makes the live conductive armour lattice
  needed for a Thunder Bastion.
- A Muster is a regional commander brain that handles combat in its area;
  Hive Minds are imported half-minds, not generic officers.

### Aether

| Current tech | Replacement Manifest | Type | Unlock / purpose |
|---|---|---|---|
| Aetheric Resonance | Aether Resonance Core | AFC Module | Aether Tower, Aether Condenser, Aether Purge |
| Survey Sweep | Echo-Reader Crew | Crew | Survey Sweep |
| Cipher Craft | Counterphase Core Module | AFC Module | Aether EMP |
| Covert Logistics | Transposition Array Module | AFC Module | Aether Siphon |
| Harbor Engineering | Aetherward Coil Module | AFC Module | Aether Wall |
| Terrain Shaping | Geoform Engine Module | AFC Module | Raise/remove mountains |
| Beacon Network | Augury Office | Office | Reveal Empire and Reveal Stats |
| Celestial Navigation | Tideway Lattice Module | AFC Module | Aether Bridge |
| Sky Vessel Engineering | Stratospheric Dockyard Module | AFC Module | Sky Dock |
| Resonance Detection | Resonance Grid Module | AFC Module | Resonance Grid |
| New split node | Matterwright Retort Module | AFC Module | Aether Retort; must include Umbrite output |
| Astral Doctrine | Astral Dock Dossier | Dossier | Astral Dock project |

Aether copy rules:

- The House knows Aether theory already.
- Coin purchases the specific imported Core, Array, Coil, Engine, Crew, or
  Office.
- The imported capability couples to the local Tower network.
- Crystal is spent when the Tower invokes that capability.
- Do not call this research, local civic permission, or a vague "field
  study."

Important Aether flavour:

- Echo-Reader Crew: uses the local Crystal lattice as a sounding board,
  reading returning vibrations to reveal hidden towns, Titanium, Gems, and
  Umbrite.
- Augury Office: arrives with the Unblinking Dial, locally cut lenses, and
  Dial Augurs. It reveals territory and detailed enemy information.
- Aetherward Coil Module: supplies the stable boundary pattern that lets
  Towers raise a temporary two-way movement-blocking wall.
- Transposition Array Module: phases a target field's material output into
  House stores.
- Geoform Engine Module: combines deep-field drivers and fault-reading
  cores to move mountain-scale stone.
- Resonance Grid Module: produces defensive nodes that deny enemy aerial
  bombardment within range.

## 7. Required Aether implementation fixes

1. ~~Make Crystal costs real and server-authoritative for every Aether
   cast.~~ **Incorrect — already true, skip.**
2. Unify ability gating: UI, shared constants, and server handlers must
   read the same Manifest requirement.
3. Aether Purge belongs to Aether Resonance Core.
4. Survey Sweep must reveal Umbrite as well as Titanium, Gems, and towns.
5. Augury Office must gate both Reveal Empire and Reveal Stats.
6. Implement the missing server-side Aether EMP behaviour.
7. Aether Wall must block movement in both directions; fix contradictory
   UI copy.
8. Replace current Siphon behaviour:
   - current: target output is reduced/deleted;
   - target: all eligible output in the target field transfers to the
     caster for one hour, while the target loses that output.
9. Retort must permit Umbrite as an output.
10. Move Harbor Exchange out of the old Harbor Engineering/Aether node and
    into Trade Circuit Charter.

## 8. Building-name pass

Use these player-facing names consistently:

| Old/internal name | Target display name |
|---|---|
| Observatory | Aether Tower |
| Airport | Sky Dock |
| Caravanary | Trade Nexus |
| Customs House | Harbor Exchange |
| Farmstead | Hydrogarden |
| Waterworks | Hydroworks |
| Garrison Hall | Ancillary Depot |
| Logistics Guild | Ancillary Factory |
| Assembly Works | Reserve Lattice |
| Rail Depot | Neural Works |
| Foundry | Ore Refinery |
| Governor's Office / Ministry Hall | Provincial Provisioning Office |
| Crystal Synthesizer | Aether Condenser |
| Advanced Crystal Synthesizer | Advanced Aether Condenser |

Delete Seed Granary entirely: types, tech data, structure registry, slot
logic, overlays, UI, tests, upgrade handling, and migrations.

## 9. 3D delivery and overlay plan

### AFC

The AFC is an offworld industrial seed:

- octagonal impact cradle;
- stabiliser legs;
- command drum;
- central Aether socket;
- brass pipes, cargo cranes, heat vents, service drones;
- module sockets visibly fill as deliveries arrive.

### Delivery animation

For every AFC module:

1. orbital streak enters the atmosphere;
2. deceleration flare and contrail;
3. impact cradle/landing legs deploy;
4. dust, steam, and stabiliser effect;
5. cargo unfolds or crane locks it into the AFC;
6. module-specific lights, pipes, coils, or machinery animate online.

No gameplay should wait ten seconds for an animation. The commission
completes immediately; the animation is presentation only.

### Major module visuals

| Module family | Visual direction |
|---|---|
| Titanium Forge | furnace drum, rolling dies, white-hot plate |
| Bastion Master-Die | gigantic articulated stamping die |
| Thunderplate Induction | copper coils, capacitors, lightning arcs |
| Rigging Works | tension frames, black cable spools, Umbrite braces |
| Siege Lens Foundry | lens press, containment cradle, glowing siege lens |
| Hive Mind | sealed black-brass sarcophagus, neural filaments |
| Ancillary Control | neural vats, restraint frames, command cabling |
| Reserve Lattice | stacked preservation racks, identity-light grid |
| Neural Assembly | branching command relays and thought-cables |
| Catalyst Fabricator | precise catalyst-heart printer/forge |
| Aether Resonance Core | crystalline chamber, rotating brass rings, dark-violet field |
| Counterphase | inverse-wave coils and damping vanes |
| Aetherward Coil | paired ward coils and boundary glyph-light |
| Transposition Array | receiver dish, phase rings, matter-stream effect |
| Tideway Lattice | paired span coils projecting a bridge-field |
| Geoform Engine | seismic pylons, pressure pistons, fault-map projector |
| Stratospheric Dockyard | lift frame, docking mast, balloon/skyship rig |
| Resonance Grid | receiver crown, antennae, defensive wave dome |
| Matterwright Retort | sealed retort vessel, Crystal matrices, material transmutation glow |

Aether cartridges should progressively transform the Aether Resonance Core
rather than create a forest of separate overlays.

## 10. Implementation order

1. Preserve existing tech IDs where possible; change player-facing name,
   description, category, and effects rather than breaking saves.
2. Rename Gold to Coin in all player-facing UI; keep internal field names
   temporarily if needed.
3. Add Manifest metadata: category, delivery type, module target, visual
   asset, and user copy.
4. Implement AFC module state, assignment, capture/dormancy, and delivery
   events.
5. Rename/re-map buildings and remove Seed Granary.
6. Apply the target tech-to-Manifest mapping.
7. Split Matterwright Retort from Catalyst Fabricator.
8. Move Harbor Exchange to Trade Circuit Charter.
9. Implement the Aether ability corrections and tests.
10. Build delivery animation/overlay support, then create the asset set.
11. Balance Coin costs only after the new structure is playable; do not
    use generic recurring Coin upkeep as the balancing mechanism.

The current Lucid version of this plan is at:
https://lucid.app/lucidchart/3a44e370-9559-47c6-a6f3-4dd744755bb9/edit
("Border Empires — Target Manifest Tree").

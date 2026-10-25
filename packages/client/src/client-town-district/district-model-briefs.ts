import { populationStructureDescription } from "../client-population-structure-info/client-population-structure-info.js";
import type { DistrictBuildingKind } from "./district-catalog.js";

// Art briefs checked against the active structure registry, the game-domain
// modifier catalog, runtime build completion/population rules and named
// Project component descriptions. Rates remain in gameplay source, not here.
export type DistrictModelBrief = { readonly role: string; readonly landmark: string };
const brief = (role: string, landmark: string): DistrictModelBrief => ({ role, landmark });
export const DISTRICT_MODEL_BRIEFS: Readonly<Record<DistrictBuildingKind, DistrictModelBrief>> = {
  MANUFACTORY: brief("Equips local industry backing Coin credit; multiple copies improve the supported town's economy.", "Production hall, roof lanterns and external magnetic drive."),
  INCUBATION_ENGINE: brief(populationStructureDescription("INCUBATION_ENGINE"), "Biological incubation chambers and a shared life-support distributor."),
  CENSUS_HALL: brief(populationStructureDescription("CENSUS_HALL"), "Population registry tower between two administrative wings."),
  CLEARING_HOUSE: brief("Amplifies Manufactory income in its town and directly connected towns.", "Circular financial rotunda and colonnade."),
  TRADE_NEXUS: brief("Enables the road network's connected-town income bonus.", "Freight-transfer portal between paired exchange warehouses."),
  ANCILLARY_DEPOT: brief("Holds ancillary reserves and increases manpower capacity; amplified by Reserve Lattice.", "Sealed custody drum with radial reserve compartments."),
  NEURAL_WORKS: brief("Amplifies Ancillary Factory manpower regeneration across its connected network and accelerates nearby outpost muster.", "Mustering command bridge, dispatch lanes and network antennas."),
  ANCILLARY_FACTORY: brief("Remakes local people into controlled ancillary bodies; regenerates manpower and supports Forced Ancillarification.", "Distinct processing cells and overhead precision manipulators."),
  RESERVE_LATTICE: brief("Amplifies the capacity supplied by Ancillary Depots in its connected-town network.", "Open reserve-coordination lattice and linked control nodes."),
  TITANIUM_WORKS: brief("Refine mode supplies a Titanium slot; Sell Off mode exchanges a Titanium slot for Coin.", "Low refining line with three roof bays and rolling equipment."),
  HIGH_YIELD_TITANIUM_WORKS: brief("Upgraded Titanium converter with a higher Sell Off return and refining upkeep.", "Refining line beneath a substantial elevated processing gantry."),
  UMBRITE_WORKS: brief("Refine mode supplies an Umbrite slot; Sell Off mode exchanges an Umbrite slot for Coin.", "Tall sealed tapered retort and shielded feed manifold."),
  HIGH_YIELD_UMBRITE_WORKS: brief("Upgraded Umbrite converter with a higher Sell Off return and refining upkeep.", "Retort flanked by tall paired recovery towers."),
  AETHER_CONDENSER: brief("Refine mode supplies a Crystal slot; Sell Off mode exchanges a Crystal slot for Coin.", "Three unequal aether-processing vessels with contained luminous channels."),
  HIGH_YIELD_AETHER_CONDENSER: brief("Upgraded Crystal converter with a higher Sell Off return and refining upkeep.", "Three vessels under an elevated condenser bridge."),
  TITANIUM_WEAPONS_FACTORY: brief("Forges Titanium armour plating; emphasizes empire-wide defense with an attack benefit.", "Open rectangular forging press, armour dies and plate output."),
  UMBRITE_WEAPONS_FACTORY: brief("Outfits Umbrite-equipped raiders; emphasizes empire-wide attack with a defense benefit.", "Forked containment crucible and charged blade racks."),
  HYDROWORKS: brief("Irrigation infrastructure that improves nearby Hydrogardens' FOOD slot supply.", "Open water basin, pumping manifold and distribution channels."),
  ORE_REFINERY: brief("Improves nearby active Mines' resource-slot output.", "Twin separation towers, intake chute and raw-ore feed."),
  MINISTRY_HALL: brief("Reduces nearby towns' FOOD-slot demand through provincial provisioning.", "Administrative wings around a provisioning and distribution court."),
  RESONANCE_GRID: brief("Blocks hostile aerial bombardment and reveals its origin; requires Ambaric power.", "Broad counterphase tuning frame and horizontal resonator."),
  SKY_DOCK: brief("Launches aerial bombardment that strips hostile ownership in an area; requires Ambaric power.", "Armed aircraft berth, launch rails and visible ordnance servicing."),
  AMBARIC_TRANSFORMER: brief("Supplies power to advanced structures and monuments; other Transformers extend the chain.", "Paired fin banks, high-voltage insulators and a connected busbar."),
  RELAY_BEACON: brief("A cheap offensive staging point that extends vision without a Siege Battery's attack bonus.", "Field relay mast, observation head and ground-level staging equipment."),
  OBSERVATORY: brief("Aether Tower: local vision, protection of owned nearby territory and access to Crystal abilities.", "Aether focus in an open instrument cradle and protective field fittings."),
  IMPERIAL_EXCHANGE_PART_1: brief("Golden Ledger: account-record component commissioned for the Imperial Exchange.", "Large brass-bound ledger on a terraced account archive."),
  IMPERIAL_EXCHANGE_PART_2: brief("Counting Engine: tallying drum commissioned to reconcile the Imperial Exchange's treasuries.", "Stepped computing drums with luminous readouts."),
  IMPERIAL_EXCHANGE_PART_3: brief("Sovereign Seal: authority stamp commissioned for the Imperial Exchange's levy.", "Large upright seal in a supported stamping frame."),
  SOVEREIGN_SIEGE_ENGINE_PART_1: brief("The Long Barrel: the finished Siege Engine's firing tube.", "Long horizontal barrel, breech and trunnion supports."),
  SOVEREIGN_SIEGE_ENGINE_PART_2: brief("Fracture Core: crystalline heart powering Worldbreaker shots.", "Exposed contained crystal between four inward-facing claws."),
  SOVEREIGN_SIEGE_ENGINE_PART_3: brief("Sky-Marking Array: the Siege Engine's targeting instrument.", "Three inclined sighting tubes on a linked fan base."),
  AEGIS_DOME_PART_1: brief("Shield Lattice: a hexagonal grid-panel fragment of the future protective dome.", "Raised hexagonal shield-panel cells."),
  AEGIS_DOME_PART_2: brief("Ward Anchor: grounding spike that anchors the dome's protective field.", "Buttressed grounding obelisk with a contained field channel."),
  AEGIS_DOME_PART_3: brief("Aegis Crown: crest that caps the completed dome and triggers its lock.", "Low crown of inward-curving shield petals."),
  ASTRAL_DOCK_PART_1: brief("Launch Cradle: curved berth holding the satellite before launch.", "Curved open satellite cradle and a central keel bed."),
  ASTRAL_DOCK_PART_2: brief("Orbital Array: mast-mounted dish tracking the launched satellite.", "Raised tracking dish with a clear feed arm."),
  ASTRAL_DOCK_PART_3: brief("Aether Sail: crystal-threaded sail panel for the satellite's flight.", "Tall crystal sail membranes and a narrow mast."),
  CENSUS_DIRECTORATE_PART_1: brief("Census Engine: rotary citizen index commissioned for the Directorate.", "Rotary index drum and a registry terminal wing."),
  CENSUS_DIRECTORATE_PART_2: brief("Registry Vault: strongbox for the empire's population records.", "Low armoured record vault and oversized circular door."),
  CENSUS_DIRECTORATE_PART_3: brief("Levy Charter: founding authorization for the Directorate's manpower benefit.", "Ceremonial charter lectern under a pointed canopy."),
  TITANIUM_LEVY_PART_1: brief("Muster Klaxon: horn that sounds the Levy's call to arms.", "Three flared acoustic horns on a common control mast."),
  TITANIUM_LEVY_PART_2: brief("Titanium Standard: battle standard for the finished monument's muster.", "Broad armoured standard on a braced ceremonial pole."),
  TITANIUM_LEVY_PART_3: brief("Levy Writ: conscription authority for the monument's one-time army.", "Authorization tablet and stamping actuator."),
  WEAPONS_WORKSHOP: brief("Retired compatibility type; replaced by the Titanium and Umbrite Weapons Factories.", "Older compact workshop retained for previously saved structures."),
  QUARTERMASTERS_OFFICE: brief("Retired compatibility type; previously reduced nearby war-structure manpower build costs.", "Older logistics office retained for previously saved structures.")
};

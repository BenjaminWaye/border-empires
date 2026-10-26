import { TITANIUM_LEVY_MANPOWER_CONVERSION_RATIO, TITANIUM_LEVY_REGEN_FREEZE_MS, AEGIS_LOCK_DURATION_MS, IMPERIAL_EXCHANGE_LEVY_COOLDOWN_MS, SOVEREIGN_SIEGE_ENGINE_STRIKE_COOLDOWN_MS } from "@border-empires/game-domain";
import { FORT_TIER_LADDER } from "@border-empires/shared";
import { DISTRICT_MODEL_BRIEFS, type DistrictModelBrief } from "../client-town-district/district-model-briefs.js";
import { isDistrictBuilding, type DistrictBuildingKind } from "../client-town-district/district-catalog.js";
import type { StructureInfoKey } from "../client-map-display.js";

const brief = (role: string, landmark: string): DistrictModelBrief => ({ role, landmark });
// The remaining live-map models outside the district kit. Names are never
// duplicated here; the shared structure-name table supplies all visible labels.
const OTHER: Readonly<Record<Exclude<StructureInfoKey, DistrictBuildingKind>, DistrictModelBrief>> = {
  RELAY_BEACON: brief("Relays the House AI's orbital command signal, extending settlement reach and frontier vision. Supplied frontier can advance beyond that reach.", "Skyward segmented receiver dish, central focal feed and three outward-facing local transmitter panels."),
  OBSERVATORY: brief("Aether Tower: local vision, protection of owned nearby territory and access to Crystal abilities.", "Swept stone-and-metal containment piers, enclosed energy column, moving field rings and a transmission crown."),
  PALISADE: brief(`Light perimeter fortification providing ${FORT_TIER_LADDER.PALISADE.defenseMult}x defense.`, "Timber perimeter walls and corner posts, with terrain visible inside."),
  FORT: brief(`Stone perimeter fortification providing ${FORT_TIER_LADDER.FORT.defenseMult}x defense. An active fort prevents immediate counter-capture of its origin after a failed attack.`, "Four stone walls and corner towers; adjacent owned forts share openings."),
  TITANIUM_BASTION: brief(`Titanium-armoured Fort upgrade providing ${FORT_TIER_LADDER.TITANIUM_BASTION.defenseMult}x defense.`, "Pale metal wall sections and reinforced corner towers."),
  THUNDER_BASTION: brief(`Thunderplate-armoured Bastion upgrade providing ${FORT_TIER_LADDER.THUNDER_BASTION.defenseMult}x defense, with improved resistance to siege pressure.`, "Dark armoured perimeter and heavy corner towers."),
  SIEGE_BATTERY: brief("Offensive staging structure that strengthens attacks launched from its own tile.", "Low armoured siege machine with a forward cannon and a targeting head."),
  SIEGE_TOWER: brief("Upgraded Siege Battery for stronger attacks from its tile.", "Tall braced siege engine carrying a large aiming lens and lance assembly."),
  DREAD_TOWER: brief("Final siege-ladder upgrade for assaults against heavily fortified targets.", "Braced reactor pylon, a large violet core and four precessing brass rings."),
  HYDROGARDEN: brief("Hydroponic cultivation installation that adds FOOD slots on grain-resource tiles; it does not improve fish tiles.", "Glass growing dome, visible crops and hydroponic service equipment."),
  MINE: brief("Excavation installation that adds a slot of the tile's Titanium or Crystal resource.", "Mechanised extraction gantry, recessed drilling mouth, separation plant and material tray matching the actual mineral."),
  UMBRITE_RIG: brief("Umbrite extraction installation that adds an Umbrite slot on its resource tile.", "Original Umbrite drilling machinery and containment equipment, seated on a matching marble platform."),
  HARBOR_EXCHANGE: brief("Quayside freight and trade installation that adds Coin income for connected owned docks.", "Quayside customs hall, bonded freight, watch drum, loading gantry and mooring bollards."),
  IMPERIAL_EXCHANGE: brief(`Unique completed Great Project that can levy a chosen rival's Coin every ${IMPERIAL_EXCHANGE_LEVY_COOLDOWN_MS / 3_600_000} hours; requires Ambaric power.`, "Financial rotunda with a ribbed gold roof, ledger-vault wings, counting court and sovereign seal."),
  SOVEREIGN_SIEGE_ENGINE: brief(`Unique completed Great Project that fires Worldbreaker strikes every ${SOVEREIGN_SIEGE_ENGINE_STRIKE_COOLDOWN_MS / 60_000} minutes, destroying a target structure and reducing its town's population; requires Ambaric power.`, "Massive elevated cannon with an open accelerator bore, armoured containment collars, monumental trunnions, recoil pistons and an armoured coaxial breech containing the Fracture Core."),
  AEGIS_DOME: brief(`Unique completed Great Project that protects a core area and can trigger a ${AEGIS_LOCK_DURATION_MS / 60_000}-minute Aegis Lock; requires Ambaric power.`, "Transparent shield dome with meridional lattice ribs, six grounding anchors and a raised crown."),
  ASTRAL_DOCK: brief("Unique completed Great Project that launches a satellite for temporary full-map vision; requires Ambaric power.", "Four curved launch-cradle arms surrounding a satellite with crystalline sail panels and a tracking dish."),
  CENSUS_DIRECTORATE: brief("Unique completed Great Project that increases empire-wide manpower regeneration for owned Manpower-branch buildings.", "Seven stacked citizen-index drums above a continuous crescent archive, with twin reading columns and a recessed civic entrance."),
  TITANIUM_LEVY: brief(`Activate to spend ${TITANIUM_LEVY_MANPOWER_CONVERSION_RATIO * 100}% of stored manpower on an immediate army at this monument, then freeze empire-wide manpower regeneration for ${TITANIUM_LEVY_REGEN_FREEZE_MS / 3_600_000} hours; requires Ambaric power.`, "Armoured assembly hall opening onto a deployment court through a muster gate, with a Titanium Standard, three klaxons and a levy-writ terminal.")
};

export const structureModelBriefFor = (kind: StructureInfoKey): DistrictModelBrief =>
  isDistrictBuilding(kind) ? DISTRICT_MODEL_BRIEFS[kind] : OTHER[kind];

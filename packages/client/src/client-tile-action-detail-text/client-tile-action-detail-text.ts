// Extracted from client-tile-menu-view.ts (file-line-cap task) — the giant
// action-id -> detail-copy if-chain has no state/dependency overlap with the
// rest of that file's tile-menu-view building, so it lives on its own here.
// Re-exported from client-tile-menu-view.ts so existing importers of
// buildDetailTextForAction don't need to change their import path.
import {
  CENSUS_HALL_POPULATION_BONUS_PER_CONNECTED_INCUBATION_ENGINE,
  CENSUS_HALL_TOWN_TIER_UPGRADE_GOLD_COST_MULT,
  FORT_TIER_LADDER,
  OBSERVATORY_PROTECTION_RADIUS,
  OBSERVATORY_VISION_BONUS,
  OUTPOST_REACH_RADIUS,
  SIEGE_TIER_LADDER,
  TILE_SLOT_BOOST_STRUCTURES,
  HYDROWORKS_HYDROGARDEN_FOOD_SLOT_BONUS
} from "@border-empires/shared";
import { manufactoryGoldProductionMultiplier, MANUFACTORY_GOLD_PRODUCTION_BONUS, MANUFACTORY_GOLD_PRODUCTION_BONUS_CLEARING_HOUSE } from "@border-empires/game-domain";
import { converterStructureDetailText } from "../client-converter-menu.js";
import { observatoryToggleDetailText } from "../client-observatory-toggle/client-observatory-toggle.js";
import { economicStructureName } from "../client-map-display.js";
import type { Tile } from "../client-types.js";

const structureNameForTile = (tile: Tile): string | undefined => {
  if (tile.fort) return tile.fort.variant === "THUNDER_BASTION" ? "Thunder Bastion" : tile.fort.variant === "TITANIUM_BASTION" ? "Titanium Bastion" : "Fort";
  if (tile.observatory) return "Aether Tower";
  if (tile.siegeBattery) return tile.siegeBattery.variant === "DREAD_TOWER" ? "Dread Tower" : tile.siegeBattery.variant === "SIEGE_TOWER" ? "Siege Tower" : "Siege Battery";
  if (tile.economicStructure) return economicStructureName(tile.economicStructure.type);
  return undefined;
};

export const buildDetailTextForAction = (actionId: string, tile: Tile, supportedTown?: Tile): string | undefined => {
  const supportedTownLabel = supportedTown?.town?.name ? supportedTown.town.name : supportedTown ? `town at (${supportedTown.x}, ${supportedTown.y})` : "supported town";
  if (actionId === "settle_land") return "Station troops here so the tile can be defended and built on, and its town or resource starts producing.";
  if (actionId === "settle_many") return "Select frontier tiles on the map, then confirm their total garrison cost.";
  if (actionId === "build_fortification") {
    // Only show upgrade text when a fort already exists on the tile.
    // Without this guard, a tile.fort === undefined falls through the
    // ?? "FORT" default and shows "Upgrade this Fort" for fresh builds.
    if (tile.fort) {
      const currentVariant = tile.fort.variant ?? "FORT";
      if (currentVariant === "FORT") return `Upgrade this Fort into an Titanium Bastion. Titanium Bastions defend at ${FORT_TIER_LADDER.TITANIUM_BASTION.defenseMult}x.`;
      if (currentVariant === "TITANIUM_BASTION") return `Upgrade this Titanium Bastion into a Thunder Bastion. Thunder Bastions defend at ${FORT_TIER_LADDER.THUNDER_BASTION.defenseMult}x.`;
      // THUNDER_BASTION shouldn't expose this action at all; fall through for safety.
    }
    return tile.fort?.variant === "PALISADE"
      ? `Upgrade this Palisade into a full fortification. Forts defend at ${FORT_TIER_LADDER.FORT.defenseMult}x and stop failed attacks from costing the origin tile.`
      : `Fortify this tile. Forts defend at ${FORT_TIER_LADDER.FORT.defenseMult}x and stop failed attacks from costing the origin tile.`;
  }
  if (actionId === "build_palisade") return "Build a lighter fortification on this border or dock tile. Weaker than a full fort, but coin-only.";
  if (actionId === "build_observatory")
    return `Extends local vision by ${OBSERVATORY_VISION_BONUS} and protects your own tiles within ${OBSERVATORY_PROTECTION_RADIUS} tiles from hostile Aether abilities (Purge, EMP, Siphon, terrain shaping, Aether Bridge landings) — it never covers unclaimed land or other players' tiles. Protection pauses while this tower is on cooldown or unpowered; a Siphon cast during that gap ends as soon as the tower is back online.`;
  if (actionId === "build_siege_camp") {
    // Only show upgrade text when a siege battery already exists.
    if (tile.siegeBattery) {
      const currentVariant = tile.siegeBattery.variant ?? "SIEGE_BATTERY";
      if (currentVariant === "SIEGE_BATTERY") return `Upgrade this Siege Battery into a Siege Tower. Siege Towers attack at ${SIEGE_TIER_LADDER.SIEGE_TOWER.attackMult}x.`;
      if (currentVariant === "SIEGE_TOWER") return `Upgrade this Siege Tower into a Dread Tower. Dread Towers attack at ${SIEGE_TIER_LADDER.DREAD_TOWER.attackMult}x.`;
      // DREAD_TOWER shouldn't expose this action; fall through for safety.
    }
    return tile.economicStructure?.type === "RELAY_BEACON"
      ? `Upgrade this Relay Beacon into a full Siege Battery. Siege Batteries attack at ${SIEGE_TIER_LADDER.SIEGE_BATTERY.attackMult}x.`
      : `Adds an offensive staging point, granting attack reach to tiles within ${OUTPOST_REACH_RADIUS} tiles of it. Siege Batteries attack at ${SIEGE_TIER_LADDER.SIEGE_BATTERY.attackMult}x.`;
  }
  if (actionId === "build_relay_beacon") return "Build a Relay Beacon on this border or dock tile. First 5 Relay Beacons build instantly (50 manpower each, no FOOD slot cost); 6th onward requires 1 FOOD upkeep. Grants a smaller attack bonus than a full Siege Battery.";
  if (actionId === "build_hydrogarden") return tile.resource === "FARM" ? `Adds +${TILE_SLOT_BOOST_STRUCTURES.HYDROGARDEN} FOOD slots on grain resource tiles.` : "Hydrogardens do not boost fish output.";
  if (actionId === "build_umbrite_rig") return "Adds +1 UMBRITE slot on this tile.";
  if (actionId === "build_titanium_weapons_factory") return "Military-industrial structure. Grants +1.5% attack / +3% defense per copy, empire-wide. No per-town limit, but cost rises with each one you own.";
  if (actionId === "build_umbrite_weapons_factory") return "Military-industrial structure. Grants +3% attack / +1.5% defense per copy, empire-wide. No per-town limit, but cost rises with each one you own.";
  if (actionId === "build_mine") return `Adds +1 ${tile.resource === "TITANIUM" ? "TITANIUM" : "CRYSTAL"} slot on this tile.`;
  if (actionId === "build_manufactory") {
    // manufactory-stacking task: this describes what THIS one Manufactory will add
    // (stacks additively with any other Manufactory already supporting the
    // town), not the town's total post-build multiplier.
    const perManufactoryPercent = Math.round((manufactoryGoldProductionMultiplier(1, Boolean(supportedTown?.town?.clearingHouseActive)) - 1) * 100);
    return `Build on this support tile for ${supportedTownLabel}. Grants +1 coin/day, +${perManufactoryPercent}% town coin production, and +10 instant coin on completion (stacks with other Manufactories).`;
  }
  if (actionId === "build_incubation_engine") {
    // Incubation Engine (Incubation Engine) grants an instant one-time population
    // burst on completion PLUS a flat ongoing growth-rate multiplier — see
    // incubationEngineGrowthMultiplier in packages/game-domain for the current
    // formula and its history (commit 7a51b06b removed the ongoing bonus;
    // reintroduced at a lower rate 2026-08-26).
    return `Build on this support tile for ${supportedTownLabel}. Grants an instant +10,000 population burst on completion, plus +10% ongoing population growth.`;
  }
  if (actionId === "build_bank") {
    return `Build on this support tile for ${supportedTownLabel}. Grants +50% city income and +1 flat income.`;
  }
  if (actionId === "build_sky_dock") return "Build a Sky Dock on empty garrisoned land. Bombard enemy tiles within 30 tiles for crystal.";
  if (actionId === "build_ambaric_transformer") return "Late-game power node. Sky and monument structures in its radius stay online.";
  if (actionId === "build_trade_nexus") {
    return `Build on this support tile for ${supportedTownLabel}. Enables the road network itself — towns only share their connected-town income bonus with each other if at least one has a Trade Nexus built.`;
  }
  if (actionId === "build_hydroworks") {
    return `Build on this support tile for ${supportedTownLabel}. Every Hydrogarden within 10 tiles gains +${HYDROWORKS_HYDROGARDEN_FOOD_SLOT_BONUS} FOOD slots.`;
  }
  if (actionId === "build_census_hall") {
    return `Build on this support tile for ${supportedTownLabel}. Grants +${CENSUS_HALL_POPULATION_BONUS_PER_CONNECTED_INCUBATION_ENGINE.toLocaleString()} population per connected Incubation Engine and cuts this town's tier-upgrade coin cost by ${Math.round((1 - CENSUS_HALL_TOWN_TIER_UPGRADE_GOLD_COST_MULT) * 100)}%.`;
  }
  if (actionId === "build_clearing_house") {
    return `Build on this support tile for ${supportedTownLabel}. Raises the coin bonus of every connected Manufactory from +${Math.round(MANUFACTORY_GOLD_PRODUCTION_BONUS * 100)}% to +${Math.round(MANUFACTORY_GOLD_PRODUCTION_BONUS_CLEARING_HOUSE * 100)}% per copy.`;
  }
  // §Cap removal: build as many of these as affordable; each occupies 1 slot and can be flipped between Refine/Sell off later.
  if (actionId === "build_umbrite_works") return "Occupies 1 Umbrite slot on this support tile. Refine (default): 30 coin/day upkeep for 18 umbrite/day. Can be flipped to Sell off later: 8 coin/day from the slot instead.";
  if (actionId === "build_titanium_works") return "Occupies 1 Titanium slot on this support tile. Refine (default): 30 coin/day upkeep for 18 titanium/day. Can be flipped to Sell off later: 8 coin/day from the slot instead.";
  if (actionId === "build_aether_condenser") return "Occupies 1 Crystal slot on this support tile. Refine (default): 40 coin/day upkeep for 12 crystal/day. Can be flipped to Sell off later: 10 coin/day from the slot instead.";
  if (actionId === "upgrade_umbrite_works" || actionId === "upgrade_titanium_works" || actionId === "upgrade_aether_condenser" || actionId === "enable_converter_structure" || actionId === "disable_converter_structure" || actionId === "set_converter_structure_mode")
    return converterStructureDetailText(actionId, tile);
  if (actionId === "enable_observatory" || actionId === "disable_observatory" || actionId === "cancel_siphon") return observatoryToggleDetailText(actionId);
  if (actionId === "abandon_territory")
    return "Give this tile up. The land goes neutral; anything built on it (fort, Aether Tower, economic structure) stays standing and is picked up by whoever claims the tile next. Siege Batteries and Relay Beacons are razed, and any mustered manpower is returned to your pool.";
  if (actionId === "build_ore_refinery") return "Industrial hub. Doubles active mine production within 5 tiles; boosted production raises titanium and crystal caps.";
  if (actionId === "build_ancillary_depot") return "Manpower hub. Adds +150 manpower cap to this town, plus +300 more if a Reserve Lattice is in this town's connected network.";
  if (actionId === "build_harbor_exchange") return "Build on a garrisoned dock tile. Adds +5 coin / day per connected owned dock.";
  if (actionId === "build_lockworks_port") return "Upgrade a Harbor Exchange into a Lockworks Port with stronger dock-route income and storage.";
  if (actionId === "build_neural_works") return "Build on a town support tile. Mustering hub: boosts outpost muster speed within 50 tiles, and adds +0.1 manpower/min empire-wide for every connected Ancillary Factory.";
  if (actionId === "build_exchange_house") return "Build on a great commercial city's support tile. It scales coin and growth with the local support network.";
  if (actionId === "build_imperial_exchange_part_1") return "Build the Golden Ledger, one of the Imperial Exchange's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_imperial_exchange_part_2") return "Build the Counting Engine, one of the Imperial Exchange's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_imperial_exchange_part_3") return "Build the Sovereign Seal, one of the Imperial Exchange's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_sovereign_siege_engine_part_1") return "Build The Long Barrel, one of the Sovereign Siege Engine's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_sovereign_siege_engine_part_2") return "Build the Fracture Core, one of the Sovereign Siege Engine's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_sovereign_siege_engine_part_3") return "Build the Sky-Marking Array, one of the Sovereign Siege Engine's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_aegis_dome_part_1") return "Build the Shield Lattice, one of the Aegis Dome's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_aegis_dome_part_2") return "Build the Ward Anchor, one of the Aegis Dome's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_aegis_dome_part_3") return "Build the Aegis Crown, one of the Aegis Dome's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_astral_dock_part_1") return "Build the Launch Cradle, one of the Astral Dock's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_astral_dock_part_2") return "Build the Orbital Array, one of the Astral Dock's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_astral_dock_part_3") return "Build the Aether Sail, one of the Astral Dock's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_census_directorate_part_1") return "Build the Census Engine, one of the Census Directorate's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_census_directorate_part_2") return "Build the Registry Vault, one of the Census Directorate's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_census_directorate_part_3") return "Build the Levy Charter, one of the Census Directorate's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_titanium_levy_part_1") return "Build the Muster Klaxon, one of The Titanium Levy's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_titanium_levy_part_2") return "Build the Titanium Standard, one of The Titanium Levy's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_titanium_levy_part_3") return "Build the Levy Writ, one of The Titanium Levy's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_imperial_exchange") return "Place the final Imperial Exchange after finishing three parts.";
  if (actionId === "build_sovereign_siege_engine") return "Place the final Sovereign Siege Engine after finishing three parts.";
  if (actionId === "build_aegis_dome") return "Place the final Aegis Dome after finishing three parts.";
  if (actionId === "build_astral_dock") return "Place the final Astral Dock after finishing three parts.";
  if (actionId === "build_census_directorate") return "Place the final Census Directorate after finishing three parts.";
  if (actionId === "build_titanium_levy") return "Place the final Titanium Levy after finishing three parts.";
  if (actionId === "imperial_exchange_levy") return "Choose one rival and seize 100% of their coin. Free, 24h cooldown.";
  if (actionId === "sovereign_siege_engine_strike") return "Arm the Sovereign Siege Engine and choose an enemy land tile to shatter into mountain.";
  if (actionId === "sky_dock_bombard") return "Arm the Sky Dock and choose an enemy land tile within 30 tiles to bombard.";
  if (actionId === "retort_recast_food") return "Recast this exposed resource tile into a food vein.";
  if (actionId === "retort_recast_titanium") return "Recast this exposed resource tile into a titanium vein.";
  if (actionId === "retort_recast_crystal") return "Recast this exposed resource tile into a crystal vein.";
  if (actionId === "retort_recast_umbrite") return "Recast this exposed resource tile into an umbrite vein.";
  if (actionId === "aether_emp") return "Fire an Aether EMP to disable that empire's nearby Ambaric Transformers, and everything they power, for 15 minutes.";
  if (actionId === "city_overclock") return "Overclock this city for 15 minutes to boost local growth, income, and manpower output.";
  if (actionId === "astral_dock_launch") return "Launch one satellite for 24 hours of full-map vision. You must wait for the current satellite to come down before launching another.";
  if (actionId === "aegis_lock") return "Seal the Aegis Dome region so hostile attacks cannot change ownership and hostile abilities fail for a short time.";
  if (actionId === "build_ministry_hall") return "Administrative center. Reduces the FOOD slot demand of any town within 10 tiles by its tier's step (Town/City/Great City/Metropolis each need progressively more FOOD slots — a nearby Ministry Hall waives that extra demand).";
  if (actionId === "build_resonance_grid") return "Resonance grid. Blocks enemy sky bombardment within 30 tiles and reveals the attack origin.";
  if (actionId === "remove_structure") {
    const structureName = structureNameForTile(tile);
    if (!structureName) return undefined;
    if (tile.economicStructure) {
      return `Remove this ${structureName}. Its income, upkeep, and structure effects stay disabled until removal finishes.`;
    }
    if (tile.fort) return `Remove this ${structureNameForTile(tile)}. Its defense bonus is disabled until removal finishes.`;
    if (tile.observatory) return "Remove this Aether Tower. Its vision and protection effects are disabled until removal finishes.";
    if (tile.siegeBattery) return `Remove this ${structureNameForTile(tile)}. Its attack bonus is disabled until removal finishes.`;
  }
  return undefined;
};

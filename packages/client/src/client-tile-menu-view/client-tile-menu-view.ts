import {
  CENSUS_HALL_POPULATION_BONUS_PER_CONNECTED_GRANARY,
  CENSUS_HALL_TOWN_TIER_UPGRADE_GOLD_COST_MULT,
  FORT_BUILD_MS,
  FORT_TIER_LADDER,
  MUSTER_ATTACK_COST,
  OBSERVATORY_VISION_BONUS,
  OBSERVATORY_BUILD_MS,
  rushBuyPriceGold,
  SIEGE_OUTPOST_BUILD_MS,
  SIEGE_TIER_LADDER,
  nextFortTierForUpgrade,
  structureBuildDurationMs,
  structureBuildManpowerCost,
  structureSlotRequirements,
  TILE_SLOT_BOOST_STRUCTURES,
  WATERWORKS_FARMSTEAD_FOOD_SLOT_BONUS,
  type SlotResource,
  type SlotStructureType
} from "@border-empires/shared";
import { mintworksGoldProductionMultiplier, MINTWORKS_GOLD_PRODUCTION_BONUS, MINTWORKS_GOLD_PRODUCTION_BONUS_CLEARING_HOUSE } from "@border-empires/game-domain";
import { converterStructureDetailText, converterModeLockLine, converterModeStatusLine, isConverterStructureType } from "../client-converter-menu.js";
import { weaponsFactoryOwnBonusLine } from "../client-weapons-factory-overview/client-weapons-factory-overview.js";
import { economicStructureBuildMs, economicStructureName, resourceLabel, strategicResourceKeyForTile, tileProductionHtml } from "../client-map-display.js";
import { naturalWonderOverviewLine, tileOverviewModifiersForTile } from "../client-tile-overview-modifiers/client-tile-overview-modifiers.js";
import { displayTownPopulationTierLabel } from "../client-town-growth/client-town-growth.js";
import { tileMenuOverviewIntroLines, tileMenuSubtitleText } from "../client-tile-menu-copy/client-tile-menu-copy.js";
import { captureRecoveryRemainingMsForTile, isFrontierNaturallyDecaying, tileMenuHeaderStatusForTile } from "../client-tile-menu-status/client-tile-menu-status.js";
import { tileOverviewUpkeepLines } from "../client-tile-upkeep-view.js";
import type { TileAreaEffectModifier } from "../client-structure-effects/client-structure-effects.js";
import type { OptimisticStructureKind, Tile, TileActionDef, TileCombatBreakdown, TileMenuProgressView, TileMenuTab, TileMenuView, TileOverviewLine } from "../client-types.js";

const structureNameForTile = (tile: Tile): string | undefined => {
  if (tile.fort) return tile.fort.variant === "THUNDER_BASTION" ? "Thunder Bastion" : tile.fort.variant === "TITANIUM_BASTION" ? "Titanium Bastion" : "Fort";
  if (tile.observatory) return "Observatory";
  if (tile.siegeOutpost) return tile.siegeOutpost.variant === "DREAD_TOWER" ? "Dread Tower" : tile.siegeOutpost.variant === "SIEGE_TOWER" ? "Siege Tower" : "Siege Outpost";
  if (tile.economicStructure) return economicStructureName(tile.economicStructure.type);
  return undefined;
};

// §14.2: dormant/unpowered structure indicator. slotStructureTypeForField
// mirrors Runtime.isStructureDormant's own field->slot-type mapping
// (apps/simulation/src/runtime/runtime.ts) so the client and server can
// never disagree on which structure a dormancy key refers to.
type DormancyField = "fort" | "observatory" | "siegeOutpost" | "economicStructure";

const slotStructureTypeForField = (tile: Tile, field: DormancyField): SlotStructureType | undefined => {
  if (field === "fort" && tile.fort) return (tile.fort.variant ?? "FORT") as SlotStructureType;
  if (field === "observatory" && tile.observatory) return "OBSERVATORY";
  if (field === "siegeOutpost" && tile.siegeOutpost) return (tile.siegeOutpost.variant ?? "SIEGE_OUTPOST") as SlotStructureType;
  if (field === "economicStructure" && tile.economicStructure) return tile.economicStructure.type as SlotStructureType;
  return undefined;
};

const SLOT_RESOURCE_TILE_HINT: Record<SlotResource, string> = {
  FOOD: "a Farm or Fish tile",
  TITANIUM: "a Titanium tile",
  CRYSTAL: "a Crystal tile",
  UMBRITE: "an Umbrite tile"
};

const dormantStructureLineHtml = (
  tile: Tile,
  field: DormancyField,
  dormantResources: SlotResource[] | undefined
): string | undefined => {
  if (!dormantResources || dormantResources.length === 0) return undefined;
  const slotType = slotStructureTypeForField(tile, field);
  if (!slotType) return undefined;
  const needed = structureSlotRequirements(slotType).filter((req) => dormantResources.includes(req.resource));
  if (needed.length === 0) return undefined;
  const parts = needed.map(
    (req) => `${req.count} ${req.resource === "FOOD" ? "Food" : req.resource === "TITANIUM" ? "Titanium" : req.resource === "CRYSTAL" ? "Crystal" : "Umbrite"} slot${req.count === 1 ? "" : "s"} (settle or capture ${SLOT_RESOURCE_TILE_HINT[req.resource]})`
  );
  return `<span class="tile-overview-dormant">⚠ Dormant — no free resource slot. Needs ${parts.join(" and ")}.</span>`;
};

export const buildDetailTextForAction = (actionId: string, tile: Tile, supportedTown?: Tile): string | undefined => {
  const supportedTownLabel = supportedTown?.town?.name ? supportedTown.town.name : supportedTown ? `town at (${supportedTown.x}, ${supportedTown.y})` : "supported town";
  if (actionId === "settle_land") return "Makes this tile defended and activates production.";
  if (actionId === "settle_connected_frontier") return "Queues a settlement on every connected frontier tile you own.";
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
    return tile.economicStructure?.type === "WOODEN_FORT"
      ? `Upgrade this Palisade into a full fortification. Forts defend at ${FORT_TIER_LADDER.FORT.defenseMult}x and stop failed attacks from costing the origin tile.`
      : `Fortify this tile. Forts defend at ${FORT_TIER_LADDER.FORT.defenseMult}x and stop failed attacks from costing the origin tile.`;
  }
  if (actionId === "build_wooden_fort") return "Build a lighter fortification on this border or dock tile. Weaker than a full fort, but gold-only.";
  if (actionId === "build_observatory") return `Extends local vision by ${OBSERVATORY_VISION_BONUS} and blocks hostile crystal actions nearby.`;
  if (actionId === "build_siege_camp") {
    // Only show upgrade text when a siege outpost already exists.
    if (tile.siegeOutpost) {
      const currentVariant = tile.siegeOutpost.variant ?? "SIEGE_OUTPOST";
      if (currentVariant === "SIEGE_OUTPOST") return `Upgrade this Siege Outpost into a Siege Tower. Siege Towers attack at ${SIEGE_TIER_LADDER.SIEGE_TOWER.attackMult}x.`;
      if (currentVariant === "SIEGE_TOWER") return `Upgrade this Siege Tower into a Dread Tower. Dread Towers attack at ${SIEGE_TIER_LADDER.DREAD_TOWER.attackMult}x.`;
      // DREAD_TOWER shouldn't expose this action; fall through for safety.
    }
    return tile.economicStructure?.type === "RELAY_BEACON"
      ? `Upgrade this Relay Beacon into a full siege outpost. Siege Outposts attack at ${SIEGE_TIER_LADDER.SIEGE_OUTPOST.attackMult}x.`
      : `Adds an offensive staging point on this border or dock tile. Siege Outposts attack at ${SIEGE_TIER_LADDER.SIEGE_OUTPOST.attackMult}x.`;
  }
  if (actionId === "build_relay_beacon") return "Build a Relay Beacon on this border or dock tile. First 5 Relay Beacons are free (no FOOD slot cost); 6th onward requires 1 FOOD upkeep. Grants a smaller attack bonus than a full siege outpost.";
  if (actionId === "build_farmstead") return tile.resource === "FARM" ? `Improves food production on this tile by 50% and adds +${TILE_SLOT_BOOST_STRUCTURES.FARMSTEAD} FOOD slot.` : "Farmsteads do not boost fish output.";
  if (actionId === "build_umbrite_rig") return "Improves umbrite production on this tile by 50% and adds +15 umbrite cap.";
  if (actionId === "build_titanium_weapons_factory") return "Military-industrial structure. Grants +1.5% attack / +3% defense per copy, empire-wide. No per-town limit, but cost rises with each one you own.";
  if (actionId === "build_umbrite_weapons_factory") return "Military-industrial structure. Grants +3% attack / +1.5% defense per copy, empire-wide. No per-town limit, but cost rises with each one you own.";
  if (actionId === "build_mine") return `Improves ${tile.resource === "TITANIUM" ? "titanium" : "crystal"} production on this tile by 50% and adds +${tile.resource === "TITANIUM" ? "15 titanium" : "9 crystal"} cap.`;
  if (actionId === "build_mintworks") {
    // mintworks-stacking task: this describes what THIS one Mintworks will add
    // (stacks additively with any other Mintworks already supporting the
    // town), not the town's total post-build multiplier.
    const perMintworksPercent = Math.round((mintworksGoldProductionMultiplier(1, Boolean(supportedTown?.town?.clearingHouseActive)) - 1) * 100);
    return `Build on this support tile for ${supportedTownLabel}. Grants +${perMintworksPercent}% town gold production (stacks with other Mintworks) and +${Math.round((supportedTown?.town?.goldPerMinute ?? 0) * 360).toLocaleString()} gold cap.`;
  }
  if (actionId === "build_granary") {
    // Incubation Engine (Granary) grants an instant one-time population
    // burst on completion, not an ongoing growth bonus — see
    // granaryGrowthMultiplier in packages/game-domain (commit 7a51b06b,
    // "Incubation Engine double-dip" fix).
    return `Build on this support tile for ${supportedTownLabel}. Grants an instant +10,000 population burst on completion.`;
  }
  if (actionId === "build_bank") {
    return `Build on this support tile for ${supportedTownLabel}. Grants +50% city income and +1 flat income.`;
  }
  if (actionId === "build_airport") return "Build a Sky Dock on empty settled land. Bombard enemy tiles within 30 tiles for crystal.";
  if (actionId === "build_aether_tower") return "Late-game power node. Sky and monument structures in its radius stay online.";
  if (actionId === "build_caravanary") {
    return `Build on this support tile for ${supportedTownLabel}. Enables the road network itself — towns only share their connected-town income bonus with each other if at least one has a Trade Nexus built.`;
  }
  if (actionId === "build_waterworks") {
    return `Build on this support tile for ${supportedTownLabel}. Boosts food production on every Farmstead within 10 tiles by +100% and adds +${WATERWORKS_FARMSTEAD_FOOD_SLOT_BONUS} FOOD slots to each one boosted.`;
  }
  if (actionId === "build_census_hall") {
    return `Build on this support tile for ${supportedTownLabel}. Grants +${CENSUS_HALL_POPULATION_BONUS_PER_CONNECTED_GRANARY.toLocaleString()} population per connected Incubation Engine and cuts this town's tier-upgrade gold cost by ${Math.round((1 - CENSUS_HALL_TOWN_TIER_UPGRADE_GOLD_COST_MULT) * 100)}%.`;
  }
  if (actionId === "build_clearing_house") {
    return `Build on this support tile for ${supportedTownLabel}. Raises the gold bonus of every connected Mintworks from +${Math.round(MINTWORKS_GOLD_PRODUCTION_BONUS * 100)}% to +${Math.round(MINTWORKS_GOLD_PRODUCTION_BONUS_CLEARING_HOUSE * 100)}% per copy.`;
  }
  // §Cap removal: build as many of these as affordable; each occupies 1 slot and can be flipped between Refine/Sell off later.
  if (actionId === "build_umbrite_synthesizer") return "Occupies 1 Umbrite slot on this support tile. Refine (default): 30 gold/day upkeep for 18 umbrite/day. Can be flipped to Sell off later: 8 gold/day from the slot instead.";
  if (actionId === "build_titanium_works") return "Occupies 1 Titanium slot on this support tile. Refine (default): 30 gold/day upkeep for 18 titanium/day. Can be flipped to Sell off later: 8 gold/day from the slot instead.";
  if (actionId === "build_crystal_synthesizer") return "Occupies 1 Crystal slot on this support tile. Refine (default): 40 gold/day upkeep for 12 crystal/day. Can be flipped to Sell off later: 10 gold/day from the slot instead.";
  if (actionId === "upgrade_umbrite_synthesizer" || actionId === "upgrade_titanium_works" || actionId === "upgrade_crystal_synthesizer" || actionId === "enable_converter_structure" || actionId === "disable_converter_structure" || actionId === "set_converter_structure_mode")
    return converterStructureDetailText(actionId, tile);
  if (actionId === "build_foundry") return "Industrial hub. Doubles active mine production within 5 tiles; boosted production raises titanium and crystal caps.";
  if (actionId === "build_garrison_hall") return "Manpower hub. Adds +150 manpower cap to this town, plus +300 more if an Assembly Works is in this town's connected network.";
  if (actionId === "build_customs_house") return "Build on a settled dock tile. Adds +5 gold / day per connected owned dock.";
  if (actionId === "build_lockworks_port") return "Upgrade a Harbor Exchange into a Lockworks Port with stronger dock-route income and storage.";
  if (actionId === "build_rail_depot") return "Build on a town support tile. Mustering hub: boosts outpost muster speed within 50 tiles, and adds +0.1 manpower/min empire-wide for every connected Logistics Guild.";
  if (actionId === "build_exchange_house") return "Build on a great commercial city's support tile. It scales gold and growth with the local support network.";
  if (actionId === "build_imperial_exchange_part_1") return "Build the Golden Ledger, one of the Imperial Exchange's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_imperial_exchange_part_2") return "Build the Counting Engine, one of the Imperial Exchange's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_imperial_exchange_part_3") return "Build the Sovereign Seal, one of the Imperial Exchange's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_world_engine_part_1") return "Build The Long Barrel, one of the Worldbreaker Cannon's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_world_engine_part_2") return "Build the Fracture Core, one of the Worldbreaker Cannon's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_world_engine_part_3") return "Build the Sky-Marking Array, one of the Worldbreaker Cannon's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_aegis_dome_part_1") return "Build the Shield Lattice, one of the Aegis Dome's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_aegis_dome_part_2") return "Build the Ward Anchor, one of the Aegis Dome's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_aegis_dome_part_3") return "Build the Aegis Crown, one of the Aegis Dome's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_astral_dock_part_1") return "Build the Launch Cradle, one of the Astral Dock's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_astral_dock_part_2") return "Build the Orbital Array, one of the Astral Dock's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_astral_dock_part_3") return "Build the Aether Sail, one of the Astral Dock's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_population_bureau_part_1") return "Build the Census Engine, one of the Population Bureau's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_population_bureau_part_2") return "Build the Registry Vault, one of the Population Bureau's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_population_bureau_part_3") return "Build the Levy Charter, one of the Population Bureau's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_titanium_levy_part_1") return "Build the Muster Klaxon, one of The Titanium Levy's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_titanium_levy_part_2") return "Build the Titanium Standard, one of The Titanium Levy's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_titanium_levy_part_3") return "Build the Levy Writ, one of The Titanium Levy's 3 unique components, in a Great City or Monumental City.";
  if (actionId === "build_imperial_exchange") return "Place the final Imperial Exchange after finishing three parts.";
  if (actionId === "build_world_engine") return "Place the final Worldbreaker Cannon after finishing three parts.";
  if (actionId === "build_aegis_dome") return "Place the final Aegis Dome after finishing three parts.";
  if (actionId === "build_astral_dock") return "Place the final Astral Dock after finishing three parts.";
  if (actionId === "build_population_bureau") return "Place the final Population Bureau after finishing three parts.";
  if (actionId === "build_titanium_levy") return "Place the final Titanium Levy after finishing three parts.";
  if (actionId === "imperial_exchange_levy") return "Choose one rival and seize 100% of their gold. Free, 24h cooldown.";
  if (actionId === "world_engine_strike") return "Arm the Worldbreaker Cannon and choose an enemy land tile to shatter into mountain.";
  if (actionId === "airport_bombard") return "Arm the Sky Dock and choose an enemy land tile within 30 tiles to bombard.";
  if (actionId === "retort_recast_food") return "Recast this exposed resource tile into a food vein.";
  if (actionId === "retort_recast_titanium") return "Recast this exposed resource tile into a titanium vein.";
  if (actionId === "retort_recast_crystal") return "Recast this exposed resource tile into a crystal vein.";
  if (actionId === "aether_emp") return "Fire an Aether EMP to disable one hostile powered structure for 20 minutes.";
  if (actionId === "city_overclock") return "Overclock this city for 15 minutes to boost local growth, income, and manpower output.";
  if (actionId === "astral_dock_launch") return "Launch one satellite for 24 hours of full-map vision. You must wait for the current satellite to come down before launching another.";
  if (actionId === "aegis_lock") return "Seal the Aegis Dome region so hostile attacks cannot change ownership and hostile abilities fail for a short time.";
  if (actionId === "build_governors_office") return "Administrative center. Reduces the FOOD slot demand of any town within 10 tiles by its tier's step (Town/City/Great City/Metropolis each need progressively more FOOD slots — a nearby Ministry Hall waives that extra demand).";
  if (actionId === "build_radar_system") return "Resonance grid. Blocks enemy sky bombardment within 30 tiles and reveals the attack origin.";
  if (actionId === "remove_structure") {
    const structureName = structureNameForTile(tile);
    if (!structureName) return undefined;
    if (tile.economicStructure) {
      return `Remove this ${structureName}. Its income, upkeep, and structure effects stay disabled until removal finishes.`;
    }
    if (tile.fort) return `Remove this ${structureNameForTile(tile)}. Its defense bonus is disabled until removal finishes.`;
    if (tile.observatory) return "Remove this Observatory. Its vision and protection effects are disabled until removal finishes.";
    if (tile.siegeOutpost) return `Remove this ${structureNameForTile(tile)}. Its attack bonus is disabled until removal finishes.`;
  }
  return undefined;
};

export const tileProductionRequirementLabel = (tile: Tile, prettyToken: (value: string) => string): string | undefined => {
  if (tile.town) return "gold";
  const strategicKey = strategicResourceKeyForTile(tile);
  if (strategicKey) return prettyToken(strategicKey).toLowerCase();
  const gpm = tile.yieldRate?.goldPerMinute ?? 0;
  if (gpm > 0.01) return "gold";
  return undefined;
};

// §6.3 rush-buy: "⏩🪙N" preview label for finishing this in-progress action
// right now. Client-side estimate only — the server (rushBuyPriceGold, same
// formula) computes and enforces the real charge at command time.
const rushBuyLabel = (remainingMs: number, totalMs: number, manpowerCost: number): string =>
  `⏩ 🪙${rushBuyPriceGold(remainingMs, totalMs, manpowerCost)}`;

export const constructionProgressForTile = (
  tile: Tile,
  formatCountdownClock: (ms: number) => string
): TileMenuProgressView | undefined => {
  const nowMs = Date.now();
  if (tile.fort?.status === "under_construction" && typeof tile.fort.completesAt === "number") {
    const remaining = Math.max(0, tile.fort.completesAt - nowMs);
    return {
      title: "Fortification under construction",
      detail: "This tile will gain fortified defense when construction completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, FORT_BUILD_MS))),
      note: "Construction is underway on this tile.",
      cancelLabel: "Cancel construction",
      rushBuyLabel: rushBuyLabel(remaining, FORT_BUILD_MS, FORT_TIER_LADDER[tile.fort.variant ?? "FORT"].manpower),
      rushBuyActionId: "rush_buy"
    };
  }
  if (tile.fort?.status === "removing" && typeof tile.fort.completesAt === "number") {
    const remaining = Math.max(0, tile.fort.completesAt - nowMs);
    return {
      title: "Removing Fort",
      detail: "This fortification is being dismantled and will disappear when removal completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, structureBuildDurationMs("FORT")))),
      note: "Defense from this fort is disabled while removal is underway.",
      cancelLabel: "Cancel removal"
    };
  }
  if (tile.observatory?.status === "under_construction" && typeof tile.observatory.completesAt === "number") {
    const remaining = Math.max(0, tile.observatory.completesAt - nowMs);
    return {
      title: "Observatory under construction",
      detail: "This tile will extend vision and observatory protection when construction completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, OBSERVATORY_BUILD_MS))),
      note: "Construction is underway on this tile.",
      cancelLabel: "Cancel construction",
      rushBuyLabel: rushBuyLabel(remaining, OBSERVATORY_BUILD_MS, structureBuildManpowerCost("OBSERVATORY")),
      rushBuyActionId: "rush_buy"
    };
  }
  if (tile.observatory?.status === "removing" && typeof tile.observatory.completesAt === "number") {
    const remaining = Math.max(0, tile.observatory.completesAt - nowMs);
    return {
      title: "Removing Observatory",
      detail: "This observatory is being dismantled and will disappear when removal completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, structureBuildDurationMs("OBSERVATORY")))),
      note: "Vision, observatory protection, and crystal-casting effects are disabled while removal is underway.",
      cancelLabel: "Cancel removal"
    };
  }
  if (tile.siegeOutpost?.status === "under_construction" && typeof tile.siegeOutpost.completesAt === "number") {
    const remaining = Math.max(0, tile.siegeOutpost.completesAt - nowMs);
    return {
      title: "Siege camp under construction",
      detail: "This tile will gain an offensive staging structure when construction completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, SIEGE_OUTPOST_BUILD_MS))),
      note: "Construction is underway on this tile.",
      cancelLabel: "Cancel construction",
      rushBuyLabel: rushBuyLabel(remaining, SIEGE_OUTPOST_BUILD_MS, SIEGE_TIER_LADDER[tile.siegeOutpost.variant ?? "SIEGE_OUTPOST"].manpower),
      rushBuyActionId: "rush_buy"
    };
  }
  if (tile.siegeOutpost?.status === "removing" && typeof tile.siegeOutpost.completesAt === "number") {
    const remaining = Math.max(0, tile.siegeOutpost.completesAt - nowMs);
    return {
      title: "Removing Siege Outpost",
      detail: "This outpost is being dismantled and will disappear when removal completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, structureBuildDurationMs("SIEGE_OUTPOST")))),
      note: "Attack bonuses from this outpost are disabled while removal is underway.",
      cancelLabel: "Cancel removal"
    };
  }
  if (tile.economicStructure?.status === "under_construction" && typeof tile.economicStructure.completesAt === "number") {
    const remaining = Math.max(0, tile.economicStructure.completesAt - nowMs);
    const buildMs = economicStructureBuildMs(tile.economicStructure.type);
    return {
      title: `${economicStructureName(tile.economicStructure.type)} under construction`,
      detail: "This tile is still being developed and is not fully online yet.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, buildMs))),
      note: "Construction is underway on this tile.",
      cancelLabel: "Cancel construction",
      rushBuyLabel: rushBuyLabel(remaining, buildMs, structureBuildManpowerCost(tile.economicStructure.type)),
      rushBuyActionId: "rush_buy"
    };
  }
  if (tile.economicStructure?.status === "removing" && typeof tile.economicStructure.completesAt === "number") {
    const remaining = Math.max(0, tile.economicStructure.completesAt - nowMs);
    return {
      title: `Removing ${economicStructureName(tile.economicStructure.type)}`,
      detail: "This building is being dismantled and will disappear when removal completes.",
      remainingLabel: formatCountdownClock(remaining),
      progress: Math.max(0, Math.min(1, 1 - remaining / Math.max(1, economicStructureBuildMs(tile.economicStructure.type)))),
      note: "Income, upkeep, and structure effects are paused while removal is underway.",
      cancelLabel: "Cancel removal"
    };
  }
  return undefined;
};

// queuedSettlementProgressForTile / queuedBuildProgressForTile moved to
// ../client-tile-menu-queue-progress/client-tile-menu-queue-progress.ts
// (this file is already over the 500-line growth cap).

// Owner-economy fields (isFed, supportCurrent/Max, foodUpkeepPerMinute, etc.)
// only ride the snapshot and REQUEST_TILE_DETAIL responses — they are NOT in
// the TILE_DELTA_BATCH town payload. So between a delta arriving and the
// gateway answering the follow-up tile-detail request, an own settled town
// can read back without those fields. Detect that window so the panel can
// show per-row loaders instead of silently rendering 0/m and hiding rows.
export const ownTownEconomyFieldsPartial = (tile: Tile, viewerId: string): boolean =>
  Boolean(
    tile.ownerId === viewerId &&
      tile.ownershipState === "SETTLED" &&
      tile.town &&
      tile.town.populationTier !== "SETTLEMENT" &&
      typeof tile.town.isFed !== "boolean"
  );

const tileTownPartialLoadingRowHtml = (
  tileKey: string,
  label: string,
  loadingSinceMs: number
): string =>
  `<div class="tile-town-loading tile-town-loading-row" role="status" aria-live="polite">` +
    `<span class="tile-town-loading-spinner" aria-hidden="true"></span>` +
    `<span class="tile-town-loading-label"><strong>${label}:</strong> loading <span class="tile-town-loading-timer" data-loading-timer-since="${loadingSinceMs}">0s</span></span>` +
    `<button type="button" class="tile-town-debug-btn" data-tile-debug-download="${tileKey}">Report</button>` +
  `</div>`;

export const menuOverviewForTile = (
  tile: Tile,
  deps: {
    state: { me: string; upkeepLastTick?: { foodCoverage?: number } };
    prettyToken: (value: string) => string;
    terrainLabel: (x: number, y: number, terrain: Tile["terrain"]) => string;
    displayTownGoldPerMinute: (tile: Tile) => number;
    populationPerMinuteLabel: (value: number) => string;
    townNextGrowthEtaLabel: (town: NonNullable<Tile["town"]>, options?: { explainUnfed?: boolean }) => string;
    supportedOwnedTownsForTile: (tile: Tile) => Tile[];
    connectedDockCountForTile: (tile: Tile) => number;
    hostileObservatoryProtectingTile: (tile: Tile) => unknown;
    constructionCountdownLineForTile: (tile: Tile) => string;
    tileHistoryLines: (tile: Tile) => string[];
    isTileOwnedByAlly: (tile: Tile) => boolean;
    areaEffectModifiersForTile: (tile: Tile) => TileAreaEffectModifier[];
    // Returns the ms timestamp at which this tile was first observed missing
    // owner-economy fields. The caller (typically the action-flow wrapper) is
    // responsible for seeding the timestamp on the partial-state transition
    // and clearing it on resolve, so the render itself stays pure.
    townPartialLoadingStartedAt: (tileKey: string) => number;
    // §14.2: dormant/unpowered structure indicator — the resource(s) this
    // tile's given structure field is currently short on, or undefined when
    // it's powered. Only meaningful for the caller's own structures; callers
    // should return undefined for tiles not owned by the viewing player.
    // Optional so existing callers/tests that haven't threaded it through
    // yet just render without a dormancy line.
    dormantResourcesForTile?: (tile: Tile, field: DormancyField) => SlotResource[] | undefined;
  }
): TileOverviewLine[] => {
  const lines: TileOverviewLine[] = [];
  const modifierLines: TileOverviewLine[] = [];
  const hasOwnedLandState = Boolean(tile.ownerId) && tile.terrain === "LAND";
  const pushLine = (html: string): void => {
    lines.push({ html });
  };
  const pushEffectLine = (name: string, mod: string, tone: "positive" | "negative" | "neutral", options?: { nested?: boolean }): void => {
    modifierLines.push({
      kind: "effect",
      ...(options?.nested ? { nested: true } : {}),
      html: `<span class="tile-overview-effect-name">${name}:</span><span class="tile-overview-effect-mod is-${tone}">${mod}</span>`
    });
  };
  // Unified building modifier display (stage 3): "<count> <Building>"
  // heading followed by that building's own stat lines, indented under it —
  // see menuOverviewForTile's townModifierTotals loop below for the only
  // caller. A plain flat list here read as duplicated info when two
  // different buildings fed the same bare stat name (e.g. two unlabeled
  // "Gold production" lines with different percentages); a heading per
  // building traces every number back to its source.
  const pushModifierGroup = (heading: string, modifiers: Array<{ statLabel: string; valueText: string; tone: "positive" | "negative" | "neutral" }>): void => {
    modifierLines.push({ kind: "group", html: heading });
    for (const modifier of modifiers) pushEffectLine(modifier.statLabel, modifier.valueText, modifier.tone, { nested: true });
  };
  const ownerKind =
    !tile.ownerId
      ? "unclaimed"
      : tile.ownerId === deps.state.me
        ? tile.ownershipState === "FRONTIER"
          ? "mine-frontier"
          : "mine-settled"
        : deps.isTileOwnedByAlly(tile)
          ? "ally"
          : "enemy";
  const productionLabel = tileProductionRequirementLabel(tile, deps.prettyToken);
  const resourceLabelText = tile.resource ? deps.prettyToken(strategicResourceKeyForTile(tile) ?? resourceLabel(tile.resource)) : undefined;
  const productionHtml = tileProductionHtml(tile);
  tileMenuOverviewIntroLines({
    terrain: tile.terrain,
    ownerKind,
    productionLabel,
    resourceLabel: resourceLabelText,
    isDockEndpoint: Boolean(tile.dockId),
    hasTown: Boolean(tile.town),
    isDecaying: isFrontierNaturallyDecaying(tile)
  }).forEach(pushLine);
  if (tile.terrain === "SEA" || tile.terrain === "COASTAL_SEA" || tile.terrain === "MOUNTAIN") return lines;
  if (tile.ownershipState === "SETTLED" && tile.town?.populationTier === "SETTLEMENT") {
    pushLine("Settlements provide starter gold and manpower until they grow into towns.");
  }
  if (tile.shardSite) {
    pushLine(
      tile.shardSite.kind === "FALL"
        ? `Shard rain deposit: ${tile.shardSite.amount} shard${tile.shardSite.amount === 1 ? "" : "s"} can be collected here for a short time.`
        : `Shard cache: ${tile.shardSite.amount} shard${tile.shardSite.amount === 1 ? "" : "s"} can be recovered here.`
    );
  } const naturalWonderLine = naturalWonderOverviewLine(tile, ownerKind); if (naturalWonderLine) pushLine(naturalWonderLine);
  const isSettled = tile.ownershipState === "SETTLED";
  const supportedTowns = tile.ownerId === deps.state.me && isSettled ? deps.supportedOwnedTownsForTile(tile) : [];
  const ownTownEconomyPartial = ownTownEconomyFieldsPartial(tile, deps.state.me);
  const ownTownLoadingTileKey = ownTownEconomyPartial ? `${tile.x},${tile.y}` : "";
  const ownTownLoadingSince = ownTownEconomyPartial ? deps.townPartialLoadingStartedAt(ownTownLoadingTileKey) : 0;
  const pushOwnTownLoadingRow = (label: string): void => {
    if (!ownTownLoadingTileKey) return;
    lines.push({
      kind: "loading",
      html: tileTownPartialLoadingRowHtml(ownTownLoadingTileKey, label, ownTownLoadingSince)
    });
  };
  if (tile.town) {
    // Foreign towns under satellite reveal carry only public fields
    // (type/tier/population/maxPopulation/connected*). When the owner-only
    // economy fields are absent we hide private-info lines instead of
    // rendering misleading defaults like "Town is unfed" or "Support 0/0".
    const hasOwnerEconomyData = typeof tile.town.isFed === "boolean";
    const hasFullFoodCoverage = (deps.state.upkeepLastTick?.foodCoverage ?? 1) >= 0.999;
    if (!hasOwnedLandState) {
      pushLine("Neutral town. Claim and settle this tile to start its economy.");
    } else if (!isSettled) {
      pushLine("Settle this tile to activate the town's economy and start gold income.");
    } else if (tile.town.populationTier === "SETTLEMENT") {
      // No prose income line — the unified `Production: X/m` row below shows the same value.
    } else if (
      hasOwnerEconomyData &&
      !tile.town.isFed &&
      !hasFullFoodCoverage &&
      (tile.town.goldPerMinute ?? 0) <= 0.001 &&
      (tile.town.populationGrowthPerMinute ?? 0) <= 0.001
    ) {
      pushLine("Town is unfed. Add more FOOD upkeep coverage or settle nearby fish or grain.");
    }
    if (hasOwnedLandState && isSettled && tile.town.connectedTownCount === 0 && tile.town.populationTier !== "SETTLEMENT") {
      pushLine("Connect this town to other towns to gain bonus gold production.");
    }
    if (hasOwnedLandState && isSettled && hasOwnerEconomyData && tile.town.populationTier !== "SETTLEMENT") {
      const supportCurrent = Number.isFinite(tile.town.supportCurrent) ? tile.town.supportCurrent : 0;
      const supportMax = Number.isFinite(tile.town.supportMax) ? tile.town.supportMax : 0;
      pushLine(`Support ${supportCurrent}/${supportMax}`);
    } else if (ownTownEconomyPartial) {
      pushOwnTownLoadingRow("Support");
    }
    pushLine(`Population ${Math.round(tile.town.population).toLocaleString()} • ${displayTownPopulationTierLabel(tile.town.populationTier)}`);
    if (isSettled && hasOwnerEconomyData) {
      const townForGrowth = hasFullFoodCoverage && tile.town.isFed === false ? { ...tile.town, isFed: true } : tile.town;
      pushLine(`Growth ${deps.populationPerMinuteLabel(tile.town.populationGrowthPerMinute ?? 0)}`);
      pushLine(`Next size: ${deps.townNextGrowthEtaLabel(townForGrowth, { explainUnfed: tile.ownerId === deps.state.me })}.`);
    } else if (ownTownEconomyPartial) {
      pushOwnTownLoadingRow("Growth");
    }
    // Unified building modifier display (stage 3): one "<count> <Building>"
    // heading per support-ring building type, with that building's own
    // stat lines nested under it (e.g. "3 Garrison Halls" → Manpower cap:
    // +450) — see pushModifierGroup above.
    if (isSettled && hasOwnerEconomyData) {
      for (const group of tile.town.townModifierTotals ?? []) {
        pushModifierGroup(group.heading, group.modifiers);
      }
    }
  } else if (tile.townDataPartial) {
    // We received a town payload but it failed the renderable gate
    // (population missing or below the 500 floor). Treat as in-flight and
    // let the player capture a debug log if it stays stuck.
    const tileKey = `${tile.x},${tile.y}`;
    lines.push({
      kind: "loading",
      html:
        `<div class="tile-town-loading" role="status" aria-live="polite">` +
        `<span class="tile-town-loading-spinner" aria-hidden="true"></span>` +
        `<span class="tile-town-loading-label">Loading town details…</span>` +
        `<button type="button" class="tile-town-debug-btn" data-tile-debug-download="${tileKey}">Download debug log</button>` +
        `</div>`
    });
  } else if (tile.resource) {
    if (tile.ownershipState === "SETTLED" && !productionHtml) {
      pushLine(`Resource node can produce ${(resourceLabelText ?? "resources").toLowerCase()} once developed and collected.`);
    }
  }
  if (tile.dockId && tile.ownershipState === "SETTLED") {
    const connectedDockCount = tile.dock?.connectedDockCount ?? deps.connectedDockCountForTile(tile);
    // Mirrors DOCK_INCOME_PER_MIN (game-domain/server-game-constants.ts):
    // 0.5 / GOLD_RESCALE_DIVISOR(288). Only used as a fallback when the
    // server hasn't sent tile.dock.goldPerMinute yet — the raw pre-rescope
    // 0.5 value here previously showed 288x the real dock income.
    const DOCK_BASE_INCOME_PER_MIN = 0.5 / 288;
    const goldPerMinute = tile.dock?.goldPerMinute ?? DOCK_BASE_INCOME_PER_MIN;
    pushLine(`Dock income ${(goldPerMinute * 1440).toFixed(1)} gold/day`);
    pushLine(connectedDockCount === 0
      ? "Not connected to any other docks yet."
      : `Connected to ${connectedDockCount} dock${connectedDockCount === 1 ? "" : "s"}.`);
    if (connectedDockCount === 0) pushLine("Connect this dock to other docks to gain bonus gold production.");
    if (tile.dock?.modifiers?.length) {
      for (const modifier of tile.dock.modifiers) {
        pushLine(`${modifier.label}: +${modifier.percent.toFixed(0)}% (+${(modifier.deltaGoldPerMinute * 1440).toFixed(1)} gold/day)`);
      }
    }
  }
  if (ownTownEconomyPartial) {
    pushOwnTownLoadingRow("Production");
  } else if (productionHtml && hasOwnedLandState && isSettled) {
    pushLine(`Production: ${productionHtml}`);
  }
  if (ownTownEconomyPartial) {
    pushOwnTownLoadingRow("Upkeep");
  } else if (hasOwnedLandState && isSettled) {
    lines.push(...tileOverviewUpkeepLines(tile));
  }
  if (supportedTowns.length === 1) {
    const town = supportedTowns[0];
    if (town) {
      pushLine(town.town?.name ? `Support tile for ${town.town.name}.` : `Support tile for nearby town at (${town.x}, ${town.y}).`);
      // mintworks-stacking task: Mintworks stack additively now, so "already has
      // a Mintworks" must not read as a discouragement to build another — show
      // the current count/bonus instead.
      if (town.town?.mintworksCount) {
        const currentMult = mintworksGoldProductionMultiplier(town.town.mintworksCount, Boolean(town.town.clearingHouseActive));
        pushLine(`Nearby town has ${town.town.mintworksCount} active Mintworks${town.town.mintworksCount === 1 ? "" : "s"} (+${Math.round((currentMult - 1) * 100)}% town gold production).`);
      }
      if (town.town?.hasGranary) pushLine("Nearby town already has a Granary.");
      if (!tile.economicStructure) pushLine("Town buildings like mintworks and granaries must be built on support tiles.");
    }
  } else if (supportedTowns.length > 1) {
    pushLine("This support tile touches multiple towns.");
  }
  if (tile.observatory) {
    if (tile.observatory.status === "active") {
      pushLine("Observatory is active here and blocks hostile crystal actions nearby.");
      const cooldownRemainingMs = (tile.observatory.cooldownUntil ?? 0) - Date.now();
      if (tile.ownerId === deps.state.me && cooldownRemainingMs > 0) {
        const totalSeconds = Math.ceil(cooldownRemainingMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const clock = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
        pushLine(`Crystal casting recharging — ready in ${clock}.`);
      }
    } else if (tile.observatory.status === "under_construction") {
      pushLine("Observatory is under construction on this tile.");
    } else {
      pushLine("Observatory is inactive here and currently provides no vision or protection.");
    }
    if (tile.observatory.status === "active") {
      const dormantLine = dormantStructureLineHtml(tile, "observatory", deps.dormantResourcesForTile?.(tile, "observatory"));
      if (dormantLine) pushLine(dormantLine);
    }
  }
  const captureRecoveryRemainingMs = captureRecoveryRemainingMsForTile(tile);
  const structureRecentlyCaptured = captureRecoveryRemainingMs !== undefined;
  if (tile.fort?.status === "active" && structureRecentlyCaptured) {
    pushLine("Recently captured. Fort defense is offline until the capture shock timer ends.");
  }
  if (tile.fort?.status === "active" && !structureRecentlyCaptured) {
    const garrison = tile.fort.garrison ?? 0;
    const garrisonCap = tile.fort.garrisonCap ?? 0;
    if (garrisonCap > 0) {
      const pct = Math.round((garrison / garrisonCap) * 100);
      const required = Math.max(MUSTER_ATTACK_COST, Math.ceil(garrison));
      pushLine(`Garrison: ${Math.floor(garrison)} / ${Math.floor(garrisonCap)} (${pct}%) — capturing requires ${required} mustered manpower.`);
    }
  }
  if (tile.fort?.status === "active") {
    const dormantLine = dormantStructureLineHtml(tile, "fort", deps.dormantResourcesForTile?.(tile, "fort"));
    if (dormantLine) pushLine(dormantLine);
  }
  if (tile.siegeOutpost?.status === "active") {
    const dormantLine = dormantStructureLineHtml(tile, "siegeOutpost", deps.dormantResourcesForTile?.(tile, "siegeOutpost"));
    if (dormantLine) pushLine(dormantLine);
  }
  if (tile.economicStructure) {
    if (tile.economicStructure.status === "removing") {
      pushLine("Removal is underway. Income, upkeep, and structure effects are currently disabled.");
    }
    if (isConverterStructureType(tile.economicStructure.type)) {
      if (tile.economicStructure.status === "active") {
        pushLine(converterModeStatusLine(tile));
        const lockLine = converterModeLockLine(tile);
        if (lockLine) pushLine(lockLine);
      } else if (structureRecentlyCaptured) {
        pushLine("Recently captured. Structure stays offline during capture shock and contributes no output or upkeep until the timer ends.");
      } else if (tile.economicStructure.disabledUntil && tile.economicStructure.disabledUntil > Date.now()) {
        pushLine("Structure is disabled while recovering from overload and currently contributes no output or upkeep.");
      } else if (tile.economicStructure.inactiveReason === "upkeep") {
        pushLine("Structure shut down after gold upkeep ran out and must be manually re-enabled before it contributes output or upkeep again.");
      } else if (tile.economicStructure.inactiveReason === "manual") {
        pushLine("Structure is manually disabled and currently contributes no output or upkeep until you re-enable it.");
      } else if (tile.economicStructure.status === "inactive") {
        pushLine("Structure is disabled and currently contributes no output or upkeep.");
      }
    } else if (structureRecentlyCaptured) {
      pushLine("Recently captured. Structure stays offline during capture shock and contributes no output or upkeep until the timer ends.");
    } else if (tile.economicStructure.status === "inactive") {
      pushLine("Structure is inactive and currently contributes no output or upkeep.");
    }
    if (tile.economicStructure.status === "active") {
      const dormantLine = dormantStructureLineHtml(tile, "economicStructure", deps.dormantResourcesForTile?.(tile, "economicStructure"));
      if (dormantLine) pushLine(dormantLine);
      const ownBonusLine = weaponsFactoryOwnBonusLine(tile);
      if (ownBonusLine) pushLine(ownBonusLine);
    }
  }
  for (const modifier of tileOverviewModifiersForTile(tile)) {
    pushEffectLine(modifier.reason, modifier.effect, modifier.tone);
  }
  for (const modifier of deps.areaEffectModifiersForTile(tile)) {
    pushEffectLine(modifier.reason, modifier.effect, modifier.tone);
  }
  if (modifierLines.length > 0) {
    lines.push({ html: "Modifiers", kind: "section" });
    lines.push(...modifierLines);
  }
  if (tile.fort?.status === "removing") {
    pushLine("Fort removal is underway. Defensive fortification from this tile is currently disabled.");
  }
  if (tile.observatory?.status === "removing") {
    pushLine("Observatory removal is underway. Vision, protection, and crystal-casting effects are currently disabled.");
  }
  if (tile.siegeOutpost?.status === "removing") {
    pushLine("Siege outpost removal is underway. Attack bonuses from this tile are currently disabled.");
  }
  const construction = deps.constructionCountdownLineForTile(tile);
  if (construction) pushLine(construction);
  for (const historyLine of deps.tileHistoryLines(tile)) pushLine(historyLine);
  return lines;
};

export const tileMenuViewForTile = (
  tile: Tile,
  deps: {
    menuActionsForSingleTile: (tile: Tile) => TileActionDef[];
    splitTileActionsIntoTabs: (actions: TileActionDef[]) => { actions: TileActionDef[]; buildings: TileActionDef[]; crystal: TileActionDef[] };
    settlementProgressForTile: (x: number, y: number) => TileMenuProgressView | undefined;
    captureProgressForTile: (tile: Tile) => TileMenuProgressView | undefined;
    queuedSettlementProgressForTile: (tile: Tile) => TileMenuProgressView | undefined;
    queuedBuildProgressForTile: (tile: Tile) => TileMenuProgressView | undefined;
    queuedExpandProgressForTile: (tile: Tile) => TileMenuProgressView | undefined;
    queuedWaypointProgressForTile: (tile: Tile) => TileMenuProgressView | undefined;
    constructionProgressForTile: (tile: Tile) => TileMenuProgressView | undefined;
    menuOverviewForTile: (tile: Tile) => TileOverviewLine[];
    prettyToken: (value: string) => string;
    playerNameForOwner: (ownerId?: string | null) => string | undefined;
    terrainLabel: (x: number, y: number, terrain: Tile["terrain"]) => string;
    isTileOwnedByAlly: (tile: Tile) => boolean;
    combatBreakdownForTile?: (tile: Tile) => TileCombatBreakdown | undefined;
    state: { me: string };
    /**
     * True when this tile is the target of the player's own in-progress
     * frontier expansion — not owned yet, but about to be. Actions/tabs are
     * then derived from a virtual FRONTIER-owned copy of the tile so a
     * building can be picked and queued (settle + build) ahead of time; it
     * fires once the expansion resolves and ownership actually lands (see
     * autoSettleTargets/autoBuildTargets).
     */
    pendingOwnershipTile?: boolean;
  }
): TileMenuView => {
  const actionSourceTile: Tile = deps.pendingOwnershipTile ? { ...tile, ownerId: deps.state.me, ownershipState: "FRONTIER" } : tile;
  const actions = deps.menuActionsForSingleTile(actionSourceTile);
  const actionTabs = deps.splitTileActionsIntoTabs(actions);
  const combatBreakdown = actionTabs.actions.some((action) => action.id === "launch_attack")
    ? deps.combatBreakdownForTile?.(tile)
    : undefined;
  const settlement = deps.settlementProgressForTile(tile.x, tile.y);
  const capture = deps.captureProgressForTile(tile);
  const queuedSettlement = deps.queuedSettlementProgressForTile(tile);
  const queuedBuild = deps.queuedBuildProgressForTile(tile);
  const queuedExpand = deps.queuedExpandProgressForTile(tile);
  const queuedWaypoint = deps.queuedWaypointProgressForTile(tile);
  const construction = deps.constructionProgressForTile(tile);
  const progress = capture ?? settlement ?? queuedSettlement ?? queuedBuild ?? queuedExpand ?? queuedWaypoint ?? construction;
  const buildBlockedByQueue = Boolean(queuedBuild);
  const visibleBuildings = buildBlockedByQueue ? [] : actionTabs.buildings;
  const tabs: TileMenuTab[] = [];
  const canShowBuildingsTab =
    !buildBlockedByQueue &&
    actionSourceTile.ownerId === deps.state.me &&
    (tile.terrain === "LAND" || Boolean(tile.dockId));
  if (progress) tabs.push("progress");
  if (actionTabs.actions.length > 0) tabs.push("actions");
  if (visibleBuildings.length > 0 || canShowBuildingsTab) tabs.push("buildings");
  if (actionTabs.crystal.length > 0) tabs.push("crystal");
  tabs.push("overview");
  const regionLabel = tile.regionType ? deps.prettyToken(tile.regionType) : undefined;
  const foreignOwnerLabel = tile.ownerId ? (deps.playerNameForOwner(tile.ownerId) ?? tile.ownerId.slice(0, 8)) : undefined;
  const ownerLabel =
    (tile.terrain === "SEA" || tile.terrain === "COASTAL_SEA")
      ? actions.length > 0
        ? "Crossing route"
        : "Open sea"
      : !tile.ownerId
        ? "Unclaimed"
        : tile.ownerId === deps.state.me
          ? tile.ownershipState === "FRONTIER"
            ? "Your frontier"
            : "Your settled land"
          : (foreignOwnerLabel ?? "Unknown empire");
  const ownerLabelIsAlly = Boolean(tile.ownerId) && tile.ownerId !== deps.state.me && tile.terrain !== "SEA" && tile.terrain !== "COASTAL_SEA" && deps.isTileOwnedByAlly(tile);
  const subtitleHtml = ownerLabelIsAlly
    ? [
        `<span class="tile-owner-label is-ally">${ownerLabel}</span>`,
        regionLabel ?? ""
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;
  const titleLabel =
    tile.town
      ? tile.town.name ?? deps.prettyToken(tile.town.populationTier === "SETTLEMENT" ? "SETTLEMENT" : tile.town.type)
      : tile.dockId
        ? "Dock"
        : tile.resource
          ? deps.prettyToken(resourceLabel(tile.resource))
          : deps.terrainLabel(tile.x, tile.y, tile.terrain);
  const headerStatus = tileMenuHeaderStatusForTile(tile);
  return {
    title: `${titleLabel} (${tile.x}, ${tile.y})`,
    subtitle: tileMenuSubtitleText(ownerLabel, regionLabel),
    ...(subtitleHtml ? { subtitleHtml } : {}),
    ...(headerStatus ? { statusText: headerStatus.text, statusTone: headerStatus.tone } : {}),
    tabs,
    ...(tile.ownershipState === "FRONTIER" ? { overviewKicker: "Frontier" } : tile.ownershipState === "SETTLED" ? { overviewKicker: "Settled" } : {}),
    overviewLines: deps.menuOverviewForTile(tile),
    actions: actionTabs.actions,
    buildings: visibleBuildings,
    crystal: actionTabs.crystal,
    ...(progress ? { progress } : {}),
    ...(combatBreakdown ? { combatBreakdown } : {})
  };
};

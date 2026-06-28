import { WORLD_HEIGHT, WORLD_WIDTH, isTownSupportPlacementStructure, structureSortRank, type BuildableStructureType } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { hostileObservatoryProtectingTileAt } from "../client-observatory-cooldown/client-observatory-cooldown.js";
import { ownObservatoryRange } from "../client-observatory-rules/client-observatory-rules.js";
import type { Tile, TileActionDef, TileMenuView } from "../client-types.js";

export const tileActionIsCrystal = (id: TileActionDef["id"]): boolean =>
  id === "reveal_empire" ||
  id === "reveal_empire_stats" ||
  id === "survey_sweep" ||
  id === "aether_lance" ||
  id === "retort_recast_food" ||
  id === "retort_recast_supply" ||
  id === "retort_recast_iron" ||
  id === "retort_recast_crystal" ||
  id === "aether_wall" ||
  id === "aether_bridge" ||
  id === "siphon_tile" ||
  id === "aether_emp" ||
  id === "city_overclock" ||
  id === "astral_dock_launch" ||
  id === "aegis_lock" ||
  id === "create_mountain" ||
  id === "remove_mountain" ||
  id === "airport_bombard";

export const tileActionIsBuilding = (id: TileActionDef["id"]): boolean => id.startsWith("build_");

export const structureTypeForTileAction = (actionId: TileActionDef["id"]): BuildableStructureType | undefined => {
  switch (actionId) {
    case "build_fortification":
      return "FORT";
    case "build_observatory":
      return "OBSERVATORY";
    case "build_siege_camp":
      return "SIEGE_OUTPOST";
    case "build_farmstead":
      return "FARMSTEAD";
    case "build_waterworks":
      return "WATERWORKS";
    case "build_camp":
      return "CAMP";
    case "build_mine":
      return "MINE";
    case "build_market":
      return "MARKET";
    case "build_granary":
      return "GRANARY";
    case "build_census_hall":
      return "CENSUS_HALL";
    case "build_bank":
      return "BANK";
    case "build_clearing_house":
      return "CLEARING_HOUSE";
    case "build_airport":
      return "AIRPORT";
    case "build_aether_tower":
      return "AETHER_TOWER";
    case "build_wooden_fort":
      return "WOODEN_FORT";
    case "build_light_outpost":
      return "LIGHT_OUTPOST";
    case "build_fur_synthesizer":
      return "FUR_SYNTHESIZER";
    case "build_ironworks":
      return "IRONWORKS";
    case "build_crystal_synthesizer":
      return "CRYSTAL_SYNTHESIZER";
    case "build_caravanary":
      return "CARAVANARY";
    case "build_foundry":
      return "FOUNDRY";
    case "build_garrison_hall":
      return "GARRISON_HALL";
    case "build_customs_house":
      return "CUSTOMS_HOUSE";
    case "build_rail_depot":
      return "RAIL_DEPOT";
    case "build_exchange_house":
      return "EXCHANGE_HOUSE";
    case "build_imperial_exchange_part":
      return "IMPERIAL_EXCHANGE_PART";
    case "build_world_engine_part":
      return "WORLD_ENGINE_PART";
    case "build_aegis_dome_part":
      return "AEGIS_DOME_PART";
    case "build_astral_dock_part":
      return "ASTRAL_DOCK_PART";
    case "build_imperial_exchange":
      return "IMPERIAL_EXCHANGE";
    case "build_world_engine":
      return "WORLD_ENGINE";
    case "build_aegis_dome":
      return "AEGIS_DOME";
    case "build_astral_dock":
      return "ASTRAL_DOCK";
    case "build_governors_office":
      return "GOVERNORS_OFFICE";
    case "build_radar_system":
      return "RADAR_SYSTEM";
    default:
      return undefined;
  }
};

export const shouldOptimisticallyBuildOnSelectedTile = (actionId: TileActionDef["id"], tile: Tile): boolean => {
  const structureType = structureTypeForTileAction(actionId);
  if (!structureType) return true;
  return !(tile.town && isTownSupportPlacementStructure(structureType));
};

export const requiredTechForTileAction = (actionId: TileActionDef["id"]): string | undefined => {
  switch (actionId) {
    case "build_foundry":
      return "industrial-extraction";
    case "build_fortification":
      return "masonry";
    case "build_observatory":
      return "cartography";
    case "build_airport":
      return "aeronautics";
    case "build_aether_tower":
      return "plastics";
    case "build_radar_system":
      return "radar";
    case "build_governors_office":
      return "civil-service";
    case "build_garrison_hall":
      return "organized-supply";
    case "build_siege_camp":
    case "build_camp":
      return "leatherworking";
    case "build_farmstead":
      return "agriculture";
    case "build_waterworks":
      return "irrigation";
    case "build_mine":
      return "mining";
    case "build_market":
      return "trade";
    case "build_granary":
      return "pottery";
    case "build_bank":
      return "coinage";
    case "build_caravanary":
      return "ledger-keeping";
    case "build_fur_synthesizer":
      return "workshops";
    case "build_ironworks":
      return "alchemy";
    case "build_crystal_synthesizer":
      return "crystal-lattices";
    case "build_customs_house":
      return "harborcraft";
    case "build_lockworks_port":
      return "port-infrastructure";
    case "build_rail_depot":
      return "global-trade-networks";
    case "build_exchange_house":
      return "imperial-roads";
    case "build_imperial_exchange_part":
    case "build_imperial_exchange":
      return "urban-markets";
    case "build_world_engine_part":
    case "build_world_engine":
      return "world-engine";
    case "build_aegis_dome_part":
    case "build_aegis_dome":
    case "aegis_lock":
      return "aegis-dome";
    case "build_astral_dock_part":
    case "build_astral_dock":
    case "astral_dock_launch":
      return "astral-dock";
    case "reveal_empire":
      return "beacon-towers";
    case "reveal_empire_stats":
      return "surveying";
    case "siphon_tile":
      return "logistics";
    case "survey_sweep":
      return "surveying";
    case "aether_lance":
      return "signal-fires";
    case "aether_emp":
      return "cryptography";
    case "city_overclock":
      return "imperial-roads";
    case "aether_wall":
      return "harborcraft";
    case "aether_bridge":
      return "navigation";
    case "create_mountain":
    case "remove_mountain":
      return "terrain-engineering";
    default:
      return undefined;
  }
};

export const hideTechLockedTileAction = (
  action: TileActionDef,
  state: Pick<ClientState, "techIds" | "localhostDevAetherWall">
): boolean => {
  if (action.id === "aether_wall" && state.localhostDevAetherWall) return false;
  const requiredTech = requiredTechForTileAction(action.id);
  if (requiredTech && !state.techIds.includes(requiredTech)) return true;
  if (!action.disabled || !action.disabledReason) return false;
  return /^Requires\b/i.test(action.disabledReason) || /^Need reveal capability\b/i.test(action.disabledReason);
};

export const splitTileActionsIntoTabs = (
  actions: TileActionDef[],
  state: Pick<ClientState, "techIds" | "localhostDevAetherWall">
): Pick<TileMenuView, "actions" | "buildings" | "crystal"> => {
  const filtered = actions.filter((action) => !hideTechLockedTileAction(action, state));
  const visibleIfShown = (action: TileActionDef): boolean => !action.disabled;
  const actionRows = filtered.filter((action) => !tileActionIsBuilding(action.id) && !tileActionIsCrystal(action.id));
  const buildingRows = filtered
    .filter((action) => tileActionIsBuilding(action.id))
    .sort((a, b) => {
      const aType = structureTypeForTileAction(a.id);
      const bType = structureTypeForTileAction(b.id);
      const rankDiff = (aType ? structureSortRank(aType) : 99) - (bType ? structureSortRank(bType) : 99);
      if (rankDiff !== 0) return rankDiff;
      return 0;
    });
  const crystalRows = filtered.filter((action) => tileActionIsCrystal(action.id));
  return {
    actions: actionRows.some(visibleIfShown) ? actionRows : [],
    buildings: buildingRows.length ? buildingRows : [],
    crystal: crystalRows.length > 0 ? crystalRows : []
  };
};

export const isTileOwnedByAlly = (tile: Tile, state: Pick<ClientState, "allies">): boolean =>
  Boolean(tile.ownerId && state.allies.includes(tile.ownerId));

export const chebyshevDistanceClient = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = Math.min(Math.abs(ax - bx), WORLD_WIDTH - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), WORLD_HEIGHT - Math.abs(ay - by));
  return Math.max(dx, dy);
};

export const hostileObservatoryProtectingTile = (
  state: Pick<ClientState, "tiles" | "me" | "allies">,
  tile: Tile
): Tile | undefined => hostileObservatoryProtectingTileAt(state.tiles.values(), state.me, state.allies, tile, Date.now());

export const ownedActiveObservatoryWithinRange = (
  state: Pick<ClientState, "tiles" | "me" | "techIds" | "techCatalog" | "domainIds" | "domainCatalog">,
  tile: Tile
): boolean => {
  const range = ownObservatoryRange(state);
  for (const candidate of state.tiles.values()) {
    if (candidate.fogged || candidate.ownerId !== state.me || candidate.terrain !== "LAND") continue;
    if (candidate.observatory?.ownerId !== state.me || candidate.observatory.status !== "active") continue;
    if (chebyshevDistanceClient(candidate.x, candidate.y, tile.x, tile.y) <= range) return true;
  }
  return false;
};

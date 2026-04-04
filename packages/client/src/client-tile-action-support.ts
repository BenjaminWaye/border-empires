import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { OBSERVATORY_PROTECTION_RADIUS } from "./client-constants.js";
import type { ClientState } from "./client-state.js";
import type { Tile, TileActionDef, TileMenuView } from "./client-types.js";

export const tileActionIsCrystal = (id: TileActionDef["id"]): boolean =>
  id === "reveal_empire" ||
  id === "aether_bridge" ||
  id === "siphon_tile" ||
  id === "purge_siphon" ||
  id === "create_mountain" ||
  id === "remove_mountain";

export const tileActionIsBuilding = (id: TileActionDef["id"]): boolean => id.startsWith("build_");

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
    case "build_radar_system":
      return "radar";
    case "build_governors_office":
      return "civil-service";
    case "build_garrison_hall":
      return "standing-army";
    case "build_siege_camp":
    case "build_camp":
      return "leatherworking";
    case "build_farmstead":
      return "agriculture";
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
    case "build_ironworks":
    case "build_crystal_synthesizer":
      return "workshops";
    case "build_fuel_plant":
      return "plastics";
    case "build_customs_house":
      return "global-trade-networks";
    case "reveal_empire":
    case "siphon_tile":
      return "cryptography";
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
  state: Pick<ClientState, "techIds">
): boolean => {
  const requiredTech = requiredTechForTileAction(action.id);
  if (requiredTech && !state.techIds.includes(requiredTech)) return true;
  if (!action.disabled || !action.disabledReason) return false;
  return /^Requires\b/i.test(action.disabledReason) || /^Need reveal capability\b/i.test(action.disabledReason);
};

export const splitTileActionsIntoTabs = (
  actions: TileActionDef[],
  state: Pick<ClientState, "techIds">
): Pick<TileMenuView, "actions" | "buildings" | "crystal"> => {
  const filtered = actions.filter((action) => !hideTechLockedTileAction(action, state));
  const visibleIfShown = (action: TileActionDef): boolean => !action.disabled;
  const actionRows = filtered.filter((action) => !tileActionIsBuilding(action.id) && !tileActionIsCrystal(action.id));
  const buildingRows = filtered.filter((action) => tileActionIsBuilding(action.id));
  const crystalRows = filtered.filter((action) => tileActionIsCrystal(action.id));
  return {
    actions: actionRows.some(visibleIfShown) ? actionRows : [],
    buildings: buildingRows.some(visibleIfShown) ? buildingRows : [],
    crystal: crystalRows.some(visibleIfShown) ? crystalRows : []
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
): Tile | undefined => {
  for (const candidate of state.tiles.values()) {
    if (!candidate.observatory || candidate.observatory.status !== "active") continue;
    if (!candidate.ownerId || candidate.ownerId === state.me || state.allies.includes(candidate.ownerId)) continue;
    if (candidate.fogged) continue;
    if (chebyshevDistanceClient(candidate.x, candidate.y, tile.x, tile.y) <= OBSERVATORY_PROTECTION_RADIUS) return candidate;
  }
  return undefined;
};

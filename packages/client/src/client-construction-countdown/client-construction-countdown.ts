import type { Tile } from "../client-types.js";

/** Human-readable "Fortifying... 00:12" style line for whichever structure on this tile is mid-build/removal. */
export const constructionCountdownLineForTile = (
  tile: Tile,
  formatCountdownClock: (ms: number) => string,
  economicStructureName: (structureType: string) => string
): string => {
  if (tile.fort?.status === "under_construction" && typeof tile.fort.completesAt === "number") {
    return `Fortifying... ${formatCountdownClock(tile.fort.completesAt - Date.now())}`;
  }
  if (tile.fort?.status === "removing" && typeof tile.fort.completesAt === "number") {
    return `Removing Fort... ${formatCountdownClock(tile.fort.completesAt - Date.now())}`;
  }
  if (tile.observatory?.status === "under_construction" && typeof tile.observatory.completesAt === "number") {
    return `Building Observatory... ${formatCountdownClock(tile.observatory.completesAt - Date.now())}`;
  }
  if (tile.observatory?.status === "removing" && typeof tile.observatory.completesAt === "number") {
    return `Removing Observatory... ${formatCountdownClock(tile.observatory.completesAt - Date.now())}`;
  }
  if (tile.siegeOutpost?.status === "under_construction" && typeof tile.siegeOutpost.completesAt === "number") {
    return `Building Siege Camp... ${formatCountdownClock(tile.siegeOutpost.completesAt - Date.now())}`;
  }
  if (tile.siegeOutpost?.status === "removing" && typeof tile.siegeOutpost.completesAt === "number") {
    return `Removing Siege Outpost... ${formatCountdownClock(tile.siegeOutpost.completesAt - Date.now())}`;
  }
  if (tile.economicStructure?.status === "under_construction" && typeof tile.economicStructure.completesAt === "number") {
    return `Building ${economicStructureName(tile.economicStructure.type)}... ${formatCountdownClock(tile.economicStructure.completesAt - Date.now())}`;
  }
  if (tile.economicStructure?.status === "removing" && typeof tile.economicStructure.completesAt === "number") {
    return `Removing ${economicStructureName(tile.economicStructure.type)}... ${formatCountdownClock(tile.economicStructure.completesAt - Date.now())}`;
  }
  return "";
};

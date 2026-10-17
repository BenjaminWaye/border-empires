import type { TileMenuHeaderStatus } from "../client-tile-menu-status/client-tile-menu-status.js";
import type { FrontierSupplyChokepoint } from "./client-frontier-supply.js";

const tilesLabel = (count: number): string => `${count} ${count === 1 ? "tile" : "tiles"}`;

/** Tile-menu header line for one of the viewer's own supply chokepoints. */
export const supplyChokepointHeaderStatus = (chokepoint: FrontierSupplyChokepoint): TileMenuHeaderStatus => ({
  text: `Supply chokepoint — ${tilesLabel(chokepoint.dependentTiles)} ${chokepoint.dependentTiles === 1 ? "depends" : "depend"} on it`,
  tone: "warning",
  helpText: `This is the only supply link for the frontier past it. If this tile is lost, those ${tilesLabel(chokepoint.dependentTiles)} are cut off and lost at once. Widen the line or extend your reach to make it safe.`
});

/**
 * Folds the chokepoint warning into the tile's existing header status. It
 * outranks the plain "Beyond your reach" line (it says more about the same
 * risk) and fills an empty header, but leaves every other status -- fogged,
 * cut off, capture hold, recently captured, inside a rival's reach -- alone.
 */
export const withSupplyChokepointStatus = (
  base: TileMenuHeaderStatus | undefined,
  chokepoint: FrontierSupplyChokepoint | undefined
): TileMenuHeaderStatus | undefined => {
  if (!chokepoint) return base;
  if (base && base.text !== "Beyond your reach") return base;
  return supplyChokepointHeaderStatus(chokepoint);
};

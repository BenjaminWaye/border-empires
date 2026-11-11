import { wrapX, wrapY } from "../math/math.js";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../config.js";
import type { LandmarkTile } from "./landmark-footprint.js";

/** Structural boundary shared by domain tiles and client tiles. */
interface AfcFootprintTile extends LandmarkTile {
  terrain: string;
  town?: object | undefined;
  dockId?: string | undefined;
  fort?: object | undefined;
  siegeBattery?: object | undefined;
  observatory?: object | undefined;
  economicStructure?: object | undefined;
  resource?: string | undefined;
}

/** World features and structures that must be clear before landing. */
export function afcLandingTileHasObstruction(tile: Omit<AfcFootprintTile, "terrain"> | undefined): boolean {
  return Boolean(tile && (tile.town || tile.dockId || tile.fort || tile.siegeBattery || tile.observatory || tile.economicStructure || tile.resource));
}

/** Three-by-three landing footprint, clear of other landmark footprints. */
export function isAfcFootprintClear(getTile: (x: number, y: number) => AfcFootprintTile | undefined, x: number, y: number): boolean {
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const tile = getTile(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT));
    if (!tile) continue; // Unknown client tiles are checked authoritatively by the simulation.
    if (tile.afc || tile.naturalWonder) return false;
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 &&
      ((tile.terrain !== "LAND" && tile.terrain !== "MOUNTAIN") || afcLandingTileHasObstruction(tile))) return false;
  }
  return true;
}

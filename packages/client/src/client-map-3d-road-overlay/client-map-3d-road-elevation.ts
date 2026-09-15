import { hillBumpsWithCorridorAt, hillNeighborFlagsAt, hillShapeHeight, type RoadCutDirections } from "../client-map-3d-hill-shape.js";
import { HEIGHTFIELD_HILLS_ELEVATION_BONUS } from "../client-map-3d-heightfield/client-map-3d-heightfield.js";

export const createRoadElevationAt = (
  isHillsTile: (x: number, y: number) => boolean,
  cornerYAt: (x: number, z: number) => number,
  wrapX: (x: number) => number,
  wrapY: (y: number) => number,
  // Same tile this road point resolves to may not be the tile the whole
  // road instance was built for (a ribbon/hub point can land in a
  // neighbouring tile) -- so this is looked up per-point, by whichever
  // tile (ewx, ewz) actually falls in, not baked in once per instance.
  roadDirsAt: (wx: number, wy: number) => RoadCutDirections | undefined
): ((wx: number, wz: number) => number) => {
  return (ewx: number, ewz: number): number => {
    const ix = Math.floor(ewx);
    const iz = Math.floor(ewz);
    const fx = ewx - ix;
    const fz = ewz - iz;
    const a = cornerYAt(wrapX(ix), wrapY(iz));
    const b = cornerYAt(wrapX(ix + 1), wrapY(iz));
    const c = cornerYAt(wrapX(ix), wrapY(iz + 1));
    const d = cornerYAt(wrapX(ix + 1), wrapY(iz + 1));
    const flatY = (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
    const tileX = Math.floor(ewx);
    const tileY = Math.floor(ewz);
    const wrappedTileX = wrapX(tileX);
    const wrappedTileY = wrapY(tileY);
    if (isHillsTile(wrappedTileX, wrappedTileY)) {
      const u = ewx - tileX - 0.5;
      const v = ewz - tileY - 0.5;
      // Matches client-map-3d-hills.ts's own bumps exactly, corridor bumps
      // toward hill-neighbouring edges included, so a road crossing near a
      // hill's edge stays flush with the actual raised terrain there.
      const bumps = hillBumpsWithCorridorAt(wrappedTileX, wrappedTileY, hillNeighborFlagsAt(wrappedTileX, wrappedTileY, isHillsTile, wrapX, wrapY));
      const roadDirs = roadDirsAt(wrappedTileX, wrappedTileY);
      return flatY + HEIGHTFIELD_HILLS_ELEVATION_BONUS * hillShapeHeight(u, v, bumps, wrappedTileX, wrappedTileY, roadDirs);
    }
    return flatY;
  };
};

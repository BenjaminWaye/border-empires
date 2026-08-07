import { domeFalloff } from "../client-map-3d-hills.js";
import { HEIGHTFIELD_HILLS_ELEVATION_BONUS } from "../client-map-3d-heightfield/client-map-3d-heightfield.js";

export const createRoadElevationAt = (
  isHillsTile: (x: number, y: number) => boolean,
  cornerYAt: (x: number, z: number) => number,
  wrapX: (x: number) => number,
  wrapY: (y: number) => number
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
    if (isHillsTile(wrapX(tileX), wrapY(tileY))) {
      const cx = tileX + 0.5;
      const cy = tileY + 0.5;
      const r = Math.hypot(ewx - cx, ewz - cy);
      return flatY + HEIGHTFIELD_HILLS_ELEVATION_BONUS * domeFalloff(r);
    }
    return flatY;
  };
};

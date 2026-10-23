// Which way a 3D dock (pier/quay/harbor) faces: toward the first sea or
// coastal-sea cardinal neighbour, checked south, east, north, west. Extracted
// from client-map-3d.ts's tile loop.
import type { Tile } from "../client-types.js";

const CARDINALS_FOR_DOCK: ReadonlyArray<{ readonly dx: number; readonly dy: number; readonly rot: number }> = [
  { dx: 0, dy: 1, rot: 0 },
  { dx: 1, dy: 0, rot: -Math.PI / 2 },
  { dx: 0, dy: -1, rot: Math.PI },
  { dx: -1, dy: 0, rot: Math.PI / 2 }
];

export const dockRotationAt = (
  wx: number,
  wy: number,
  terrainAt: (x: number, y: number) => Tile["terrain"],
  wrapX: (x: number) => number,
  wrapY: (y: number) => number
): number => {
  for (const c of CARDINALS_FOR_DOCK) {
    const terrain = terrainAt(wrapX(wx + c.dx), wrapY(wy + c.dy));
    if (terrain === "SEA" || terrain === "COASTAL_SEA") return c.rot;
  }
  return 0;
};

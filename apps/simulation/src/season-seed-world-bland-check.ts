import { WORLD_HEIGHT, WORLD_WIDTH, terrainAt, wrapX, wrapY, type TileKey } from "@border-empires/shared";
import { key, type TownDefinition } from "@border-empires/game-domain";

export const worldLooksBland = (seed: number, clusterByTile: Map<TileKey, string>, townsByTile: Map<TileKey, TownDefinition>, docksByTile: Map<TileKey, { dockId: string }>, seeded01: (x: number, y: number, seed: number) => number): boolean => {
  const step = 15;
  let checkedBlocks = 0;
  let blandBlocks = 0;
  for (let y = 0; y < WORLD_HEIGHT; y += step) {
    for (let x = 0; x < WORLD_WIDTH; x += step) {
      let land = 0;
      let nearBarrier = 0;
      let nearHook = 0;
      for (let dy = 0; dy < step; dy += 1) {
        for (let dx = 0; dx < step; dx += 1) {
          const wx = wrapX(x + dx, WORLD_WIDTH);
          const wy = wrapY(y + dy, WORLD_HEIGHT);
          if (terrainAt(wx, wy) !== "LAND") continue;
          land += 1;
          const neighbors: Array<[number, number]> = [
            [wx, wrapY(wy - 1, WORLD_HEIGHT)],
            [wrapX(wx + 1, WORLD_WIDTH), wy],
            [wx, wrapY(wy + 1, WORLD_HEIGHT)],
            [wrapX(wx - 1, WORLD_WIDTH), wy]
          ];
          if (neighbors.some(([nx, ny]) => terrainAt(nx, ny) !== "LAND")) nearBarrier += 1;
          const tk = key(wx, wy);
          if (clusterByTile.has(tk) || townsByTile.has(tk) || docksByTile.has(tk)) nearHook += 1;
        }
      }
      checkedBlocks += 1;
      if (land < step * step * 0.45) continue;
      if (nearBarrier / Math.max(1, land) < 0.08 && nearHook / Math.max(1, land) < 0.02) blandBlocks += 1;
    }
  }
  return blandBlocks > checkedBlocks * 0.22 || seeded01(seed, seed + 1, seed + 2) < 0;
};

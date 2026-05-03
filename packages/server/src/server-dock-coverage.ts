import type { Dock, TileKey, Tile } from "@border-empires/shared";

export type DockCoverageSummary = {
  landComponents: number;
  dockedComponents: number;
  undockedComponents: number;
  dockCount: number;
  largestUndockedComponentTiles: number;
  undockedComponentSamples: Array<{ x: number; y: number; tileCount: number }>;
};

export const summarizeDockCoverage = ({
  worldWidth,
  worldHeight,
  terrainAt,
  wrapX,
  wrapY,
  key,
  docksByTile,
  sampleLimit = 5
}: {
  worldWidth: number;
  worldHeight: number;
  terrainAt: (x: number, y: number) => Tile["terrain"];
  wrapX: (x: number, width: number) => number;
  wrapY: (y: number, height: number) => number;
  key: (x: number, y: number) => TileKey;
  docksByTile: Map<TileKey, Dock>;
  sampleLimit?: number;
}): DockCoverageSummary => {
  const visited = new Uint8Array(worldWidth * worldHeight);
  const worldIndex = (x: number, y: number): number => y * worldWidth + x;
  const undockedComponentSamples: Array<{ x: number; y: number; tileCount: number }> = [];
  let landComponents = 0;
  let dockedComponents = 0;
  let undockedComponents = 0;
  let largestUndockedComponentTiles = 0;

  for (let y = 0; y < worldHeight; y += 1) {
    for (let x = 0; x < worldWidth; x += 1) {
      const startIdx = worldIndex(x, y);
      if (visited[startIdx] || terrainAt(x, y) !== "LAND") continue;
      visited[startIdx] = 1;
      landComponents += 1;
      const queue: Array<{ x: number; y: number }> = [{ x, y }];
      let tileCount = 0;
      let hasDock = false;

      while (queue.length > 0) {
        const current = queue.shift()!;
        tileCount += 1;
        if (docksByTile.has(key(current.x, current.y))) hasDock = true;

        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = wrapX(current.x + dx, worldWidth);
            const ny = wrapY(current.y + dy, worldHeight);
            const neighborIdx = worldIndex(nx, ny);
            if (visited[neighborIdx] || terrainAt(nx, ny) !== "LAND") continue;
            visited[neighborIdx] = 1;
            queue.push({ x: nx, y: ny });
          }
        }
      }

      if (hasDock) {
        dockedComponents += 1;
        continue;
      }

      undockedComponents += 1;
      largestUndockedComponentTiles = Math.max(largestUndockedComponentTiles, tileCount);
      undockedComponentSamples.push({ x, y, tileCount });
    }
  }

  undockedComponentSamples.sort((a, b) => b.tileCount - a.tileCount || a.y - b.y || a.x - b.x);

  return {
    landComponents,
    dockedComponents,
    undockedComponents,
    dockCount: docksByTile.size,
    largestUndockedComponentTiles,
    undockedComponentSamples: undockedComponentSamples.slice(0, sampleLimit)
  };
};

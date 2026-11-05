// Shared two-empire world for the settled edge glow stories (3D EdgeGlow and
// 2D EdgeGlow2D): each empire is a settled core inside a frontier ring, the
// two meet along a shared border, and a few settled tiles are hills.

// A/B = settled, a/b = that owner's frontier, h/k = A/B settled hill.
const MAP = [
  "..................",
  "...aaaa...........",
  "..aAAAAaa.....bb..",
  ".aAAAhAAAab.bbBBb.",
  ".aAAAAAAABBBBBBBb.",
  ".aAhAAAAABBBBkBBb.",
  "..aAAAAABBBBBBBb..",
  "..aAAAhAABBBBBBb..",
  "...aAAAAaBBBBBb...",
  "....aaaa..bBBb....",
  "...........bb.....",
  ".................."
];
const HILLS: Record<string, string> = { h: "a", k: "b" };

export type EdgeGlowWorldTile = { readonly x: number; readonly y: number; readonly ownerId: string; readonly ownershipState: "SETTLED" | "FRONTIER" };

export const EDGE_GLOW_WORLD_WIDTH = MAP[0]?.length ?? 0;
export const EDGE_GLOW_WORLD_HEIGHT = MAP.length;
export const EDGE_GLOW_OWNER_COLORS: Record<string, string> = { a: "#e0a020", b: "#4a8cff" };

/** World tiles with the map's top-left at (originX, originY). */
export const edgeGlowWorld = (originX: number, originY: number) => {
  const cellAt = (wx: number, wy: number): string => MAP[wy - originY]?.[wx - originX] ?? ".";
  const tiles = new Map<string, EdgeGlowWorldTile>();
  for (let y = 0; y < EDGE_GLOW_WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < EDGE_GLOW_WORLD_WIDTH; x += 1) {
      const cell = cellAt(originX + x, originY + y);
      if (cell === ".") continue;
      const ownerId = HILLS[cell] ?? cell.toLowerCase();
      const ownershipState = cell === cell.toLowerCase() && !(cell in HILLS) ? "FRONTIER" : "SETTLED";
      tiles.set(`${originX + x},${originY + y}`, { x: originX + x, y: originY + y, ownerId, ownershipState });
    }
  }
  return {
    tiles,
    isHillsAt: (wx: number, wy: number): boolean => cellAt(wx, wy) in HILLS,
    neighbourDeps: { tiles, keyFor: (x: number, y: number) => `${x},${y}`, wrapX: (x: number) => x, wrapY: (y: number) => y }
  };
};

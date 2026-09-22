// Gives the bot a human-scale "screen" instead of omniscient knowledge of
// its whole empire: a small tile window around a camera position (like what
// fits on a normal player's screen), plus a coarse minimap (like glancing at
// the minimap widget) it can use to decide where to look next via the
// pan_camera tool. All computed client-side from tiles the gateway already
// sends on every connection regardless of camera position -- no new
// protocol/server work needed, this is purely about what we hand the LLM.
import { tileKey, type GameInitState, type GameTile } from "./game-socket.js";

export const VIEWPORT_HALF_SIZE = 10; // ~20x20 tiles, roughly a normal player screen at default zoom
const MINIMAP_CELL_SIZE = 20; // world tiles per minimap cell
const MAX_MINIMAP_CELLS = 200;

export type TileIndex = Map<string, GameTile>;
export type CameraPosition = { x: number; y: number };
export type PlayerStatus = { playerId: string; playerName: string; gold: number; manpower: number };
export type ViewportTile = { x: number; y: number; ownerId?: string; terrain?: string };
export type FrontierTarget = { x: number; y: number; ownerId?: string; terrain?: string };
export type MinimapCell = { cx: number; cy: number; ownerId?: string; tileCount: number };

const NEIGHBOR_OFFSETS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
] as const;

// Built once per turn by the caller and threaded through every builder below
// instead of each one re-scanning the full known-tile array -- for an empire
// with thousands of known tiles this is the difference between one O(n)
// pass and three or four per turn.
export const buildTileIndex = (state: GameInitState): TileIndex =>
  new Map(state.tiles.map((tile) => [tileKey(tile.x, tile.y), tile]));

const asViewportTile = (tile: GameTile): ViewportTile => ({
  x: tile.x,
  y: tile.y,
  ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
  ...(tile.terrain ? { terrain: String(tile.terrain) } : {})
});

// Home tile as a sane default camera on first connect -- a human player
// opens the game centered on their own territory, not the world origin.
export const defaultCamera = (state: GameInitState): CameraPosition => {
  const home = state.tiles.find((tile) => tile.ownerId === state.playerId);
  return home ? { x: home.x, y: home.y } : { x: 0, y: 0 };
};

export const buildViewport = (index: TileIndex, camera: CameraPosition): ViewportTile[] => {
  const viewport: ViewportTile[] = [];
  for (let dx = -VIEWPORT_HALF_SIZE; dx <= VIEWPORT_HALF_SIZE; dx += 1) {
    for (let dy = -VIEWPORT_HALF_SIZE; dy <= VIEWPORT_HALF_SIZE; dy += 1) {
      const tile = index.get(tileKey(camera.x + dx, camera.y + dy));
      if (tile) viewport.push(asViewportTile(tile));
    }
  }
  return viewport;
};

// Only tiles inside the current viewport are valid expand/attack targets --
// the bot must pan_camera to a new area before it can act there, mirroring
// how a human can only click what's actually on their screen.
export const buildViewportFrontier = (index: TileIndex, camera: CameraPosition, playerId: string): FrontierTarget[] => {
  const ownedInView = new Set<string>();
  for (let dx = -VIEWPORT_HALF_SIZE; dx <= VIEWPORT_HALF_SIZE; dx += 1) {
    for (let dy = -VIEWPORT_HALF_SIZE; dy <= VIEWPORT_HALF_SIZE; dy += 1) {
      const key = tileKey(camera.x + dx, camera.y + dy);
      if (index.get(key)?.ownerId === playerId) ownedInView.add(key);
    }
  }

  const frontierByKey = new Map<string, FrontierTarget>();
  for (const ownedKey of ownedInView) {
    const [ox, oy] = ownedKey.split(",").map(Number) as [number, number];
    for (const [dx, dy] of NEIGHBOR_OFFSETS) {
      const x = ox + dx;
      const y = oy + dy;
      // A neighbor of an in-view owned tile can itself sit one step past the
      // viewport's edge (e.g. an owned tile at the boundary) -- exclude it
      // rather than hand the model a "frontier" target it was never actually
      // shown in the viewport list this same turn.
      if (Math.abs(x - camera.x) > VIEWPORT_HALF_SIZE || Math.abs(y - camera.y) > VIEWPORT_HALF_SIZE) continue;
      const key = tileKey(x, y);
      if (frontierByKey.has(key) || ownedInView.has(key)) continue;
      const neighbor = index.get(key);
      if (neighbor?.ownerId === playerId) continue;
      frontierByKey.set(key, {
        x,
        y,
        ...(neighbor?.ownerId ? { ownerId: neighbor.ownerId } : {}),
        ...(neighbor?.terrain ? { terrain: String(neighbor.terrain) } : {})
      });
    }
  }
  return [...frontierByKey.values()];
};

// A coarse "glance at the minimap" view over every tile the bot has ever
// seen (not just what's in the current viewport) -- how it decides where to
// pan_camera next, without paying the token cost of every known tile. Capped
// nearest-to-camera-first: for an empire that has explored more area than
// the cap covers, the cells closest to where the bot is currently looking
// (its own territory, most of the time) are far more decision-relevant than
// an arbitrary truncation would be.
export const buildMinimap = (index: TileIndex, camera: CameraPosition): MinimapCell[] => {
  const counts = new Map<string, { cx: number; cy: number; ownersById: Map<string, number>; tileCount: number }>();
  for (const tile of index.values()) {
    const cx = Math.floor(tile.x / MINIMAP_CELL_SIZE);
    const cy = Math.floor(tile.y / MINIMAP_CELL_SIZE);
    const key = `${cx},${cy}`;
    const cell = counts.get(key) ?? { cx, cy, ownersById: new Map<string, number>(), tileCount: 0 };
    cell.tileCount += 1;
    if (tile.ownerId) cell.ownersById.set(tile.ownerId, (cell.ownersById.get(tile.ownerId) ?? 0) + 1);
    counts.set(key, cell);
  }

  const cameraCellX = Math.floor(camera.x / MINIMAP_CELL_SIZE);
  const cameraCellY = Math.floor(camera.y / MINIMAP_CELL_SIZE);
  const distanceToCamera = (cx: number, cy: number): number => Math.abs(cx - cameraCellX) + Math.abs(cy - cameraCellY);

  return [...counts.values()]
    .sort((left, right) => distanceToCamera(left.cx, left.cy) - distanceToCamera(right.cx, right.cy))
    .slice(0, MAX_MINIMAP_CELLS)
    .map(({ cx, cy, ownersById, tileCount }) => {
      let dominantOwnerId: string | undefined;
      let dominantCount = 0;
      for (const [ownerId, count] of ownersById) {
        if (count > dominantCount) {
          dominantOwnerId = ownerId;
          dominantCount = count;
        }
      }
      return { cx, cy, ...(dominantOwnerId ? { ownerId: dominantOwnerId } : {}), tileCount };
    });
};

// Compresses the full tile array (which can run to thousands of entries for
// a large empire) down to what actually matters for one decision: a capped
// sample of owned tiles and the unclaimed/enemy tiles adjacent to them (the
// only tiles EXPAND/ATTACK/SETTLE can legally target). Mirrors the tile-
// sampling-cap approach already used by the offline AI-labeling pipeline
// (scripts/run-ai-labeling-local.mjs) for the same reason: full state is
// cheap to compute but expensive and unnecessary to hand an LLM every turn.
import type { GameInitState, GameTile } from "./game-socket.js";

const MAX_OWNED_SAMPLE = 24;
const MAX_FRONTIER_SAMPLE = 48;

export type FrontierTileSummary = {
  x: number;
  y: number;
  ownerId?: string;
  terrain?: string;
};

export type StateSummary = {
  playerId: string;
  playerName: string;
  gold: number;
  manpower: number;
  ownedTileCount: number;
  ownedSample: Array<{ x: number; y: number }>;
  frontier: FrontierTileSummary[];
};

const NEIGHBOR_OFFSETS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
] as const;

export const summarizeState = (state: GameInitState): StateSummary => {
  const ownedTiles: GameTile[] = [];
  const tileByKey = new Map<string, GameTile>();
  for (const tile of state.tiles) {
    tileByKey.set(`${tile.x},${tile.y}`, tile);
    if (tile.ownerId === state.playerId) ownedTiles.push(tile);
  }

  const frontierByKey = new Map<string, FrontierTileSummary>();
  for (const owned of ownedTiles) {
    for (const [dx, dy] of NEIGHBOR_OFFSETS) {
      const key = `${owned.x + dx},${owned.y + dy}`;
      if (frontierByKey.has(key)) continue;
      const neighbor = tileByKey.get(key);
      if (neighbor && neighbor.ownerId === state.playerId) continue;
      frontierByKey.set(key, {
        x: owned.x + dx,
        y: owned.y + dy,
        ...(neighbor?.ownerId ? { ownerId: neighbor.ownerId } : {}),
        ...(neighbor?.terrain ? { terrain: String(neighbor.terrain) } : {})
      });
    }
  }

  return {
    playerId: state.playerId,
    playerName: state.playerName,
    gold: state.gold,
    manpower: state.manpower,
    ownedTileCount: ownedTiles.length,
    ownedSample: ownedTiles.slice(0, MAX_OWNED_SAMPLE).map((tile) => ({ x: tile.x, y: tile.y })),
    frontier: [...frontierByKey.values()].slice(0, MAX_FRONTIER_SAMPLE)
  };
};

import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";

const wrap = (value: number, size: number): number => {
  const remainder = value % size;
  return remainder < 0 ? remainder + size : remainder;
};

const wrapX = (x: number): number => wrap(x, WORLD_WIDTH);
const wrapY = (y: number): number => wrap(y, WORLD_HEIGHT);

const ownedTile = (tile: DomainTileState | undefined, playerId: string, settledOnly: boolean): boolean => {
  if (!tile || tile.ownerId !== playerId || tile.terrain !== "LAND") return false;
  return settledOnly ? tile.ownershipState === "SETTLED" : tile.ownershipState === "SETTLED" || tile.ownershipState === "FRONTIER";
};

const exposedEdgesFor = (
  tile: DomainTileState,
  playerId: string,
  tiles: ReadonlyMap<string, DomainTileState>,
  settledOnly: boolean
): number => {
  const neighbors = [
    { x: wrapX(tile.x), y: wrapY(tile.y - 1) },
    { x: wrapX(tile.x + 1), y: wrapY(tile.y) },
    { x: wrapX(tile.x), y: wrapY(tile.y + 1) },
    { x: wrapX(tile.x - 1), y: wrapY(tile.y) }
  ];
  let exposed = 0;
  for (const neighbor of neighbors) {
    const next = tiles.get(`${neighbor.x},${neighbor.y}`);
    if (ownedTile(next, playerId, settledOnly)) continue;
    const terrain = next?.terrain ?? "LAND";
    if (terrain === "SEA" || terrain === "MOUNTAIN") continue;
    exposed += 1;
  }
  return exposed;
};

export const buildPlayerDefensibilityMetrics = (
  playerId: string,
  tiles: ReadonlyMap<string, DomainTileState>
): { T: number; E: number; Ts: number; Es: number } => {
  let T = 0;
  let E = 0;
  let Ts = 0;
  let Es = 0;
  for (const tile of tiles.values()) {
    if (!ownedTile(tile, playerId, false)) continue;
    T += 1;
    E += exposedEdgesFor(tile, playerId, tiles, false);
    if (!ownedTile(tile, playerId, true)) continue;
    Ts += 1;
    Es += exposedEdgesFor(tile, playerId, tiles, true);
  }
  return {
    T: Math.max(1, T),
    E,
    Ts: Math.max(1, Ts),
    Es
  };
};

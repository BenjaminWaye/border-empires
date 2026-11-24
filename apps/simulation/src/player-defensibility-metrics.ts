import { WORLD_HEIGHT, WORLD_WIDTH, isSeaTerrain } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";

const wrap = (value: number, size: number): number => {
  const remainder = value % size;
  return remainder < 0 ? remainder + size : remainder;
};

const wrapX = (x: number): number => wrap(x, WORLD_WIDTH);
const wrapY = (y: number): number => wrap(y, WORLD_HEIGHT);

const ownedLandTile = (tile: DomainTileState | undefined, playerId: string): boolean =>
  !!tile && tile.ownerId === playerId && tile.terrain === "LAND" && (tile.ownershipState === "SETTLED" || tile.ownershipState === "FRONTIER");

// Empire Integrity's shape part reads everything the player owns (owner rule, Playtest Run 4 follow-up; see
// empireIntegrity in packages/shared/src/empire-integrity.ts): a side is open when it faces land the player
// doesn't own -- unclaimed, rival, allied or barbarian. Water and mountains block.
const openSidesFor = (tile: DomainTileState, playerId: string, tiles: ReadonlyMap<string, DomainTileState>): number => {
  const neighbors = [
    { x: wrapX(tile.x), y: wrapY(tile.y - 1) },
    { x: wrapX(tile.x + 1), y: wrapY(tile.y) },
    { x: wrapX(tile.x), y: wrapY(tile.y + 1) },
    { x: wrapX(tile.x - 1), y: wrapY(tile.y) }
  ];
  let open = 0;
  for (const neighbor of neighbors) {
    const next = tiles.get(`${neighbor.x},${neighbor.y}`);
    if (ownedLandTile(next, playerId)) continue;
    const terrain = next?.terrain ?? "LAND";
    if (isSeaTerrain(terrain) || terrain === "MOUNTAIN") continue;
    open += 1;
  }
  return open;
};

export type PlayerDefensibilityMetrics = {
  /** Owned land tiles, garrisoned and frontier: the size the shape is judged against (0 with no land: 100%, no penalty). */
  T: number;
  /** Open sides of all owned land, unweighted (display). */
  E: number;
  /** Garrisoned tiles: the new-empire grace floor counts these. */
  Ts: number;
  /** Open sides Integrity's shape part reads: the same as E (kept as its own field for the wire). */
  Es: number;
};

export const buildPlayerDefensibilityMetrics = (
  playerId: string,
  tiles: ReadonlyMap<string, DomainTileState>,
  ownedTileKeys?: ReadonlySet<string>
): PlayerDefensibilityMetrics => {
  let T = 0;
  let E = 0;
  let Ts = 0;
  let Es = 0;

  const accumulate = (tile: DomainTileState): void => {
    T += 1;
    const open = openSidesFor(tile, playerId, tiles);
    E += open;
    Es += open;
    if (tile.ownershipState === "SETTLED") Ts += 1;
  };
  // Iterate the player's owned tiles only when the caller provides the
  // index — O(owned-tiles) instead of O(all-map-tiles). The summary's
  // territoryTileKeys is maintained incrementally as ownership changes.
  if (ownedTileKeys) {
    for (const tileKey of ownedTileKeys) {
      const tile = tiles.get(tileKey);
      if (!tile || !ownedLandTile(tile, playerId)) continue;
      accumulate(tile);
    }
  } else {
    for (const tile of tiles.values()) {
      if (!ownedLandTile(tile, playerId)) continue;
      accumulate(tile);
    }
  }
  return {
    T,
    E,
    Ts,
    Es
  };
};

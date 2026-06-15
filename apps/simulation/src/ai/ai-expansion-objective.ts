import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

export type ExpansionObjective = { x: number; y: number; kind: "neutral_value" | "enemy" };

const wrapDist = (a: number, b: number, size: number): number => {
  const d = Math.abs(a - b);
  return d < size - d ? d : size - d;
};

const chebyshevWrap = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(wrapDist(ax, bx, WORLD_WIDTH), wrapDist(ay, by, WORLD_HEIGHT));

type TileCoord = { x: number; y: number };

const parseCoord = (key: string): TileCoord => {
  const comma = key.indexOf(",");
  return { x: parseInt(key, 10), y: parseInt(key.slice(comma + 1), 10) };
};

const nearestBeaconToTerritory = (
  beaconKeys: Iterable<string>,
  ownedCoords: readonly TileCoord[],
  kind: ExpansionObjective["kind"]
): { beacon: TileCoord; dist: number; kind: ExpansionObjective["kind"] } | undefined => {
  let best: { beacon: TileCoord; dist: number; kind: ExpansionObjective["kind"] } | undefined;
  for (const key of beaconKeys) {
    const beacon = parseCoord(key);
    let minDist = Infinity;
    for (const owned of ownedCoords) {
      const d = chebyshevWrap(beacon.x, beacon.y, owned.x, owned.y);
      if (d < minDist) minDist = d;
    }
    if (!best || minDist < best.dist) best = { beacon, dist: minDist, kind };
  }
  return best;
};

export type SelectExpansionObjectiveInput = {
  territoryTileKeys: Iterable<string>;
  neutralBeaconTileKeys: ReadonlySet<string>;
  /** Yield-bearing tile keys per enemy player id (from yieldBearingTilesByOwner). */
  enemyYieldKeysByPlayerId: ReadonlyMap<string, ReadonlySet<string>>;
  playerId: string;
};

export const selectExpansionObjective = (
  input: SelectExpansionObjectiveInput
): ExpansionObjective | undefined => {
  if (input.neutralBeaconTileKeys.size === 0 && input.enemyYieldKeysByPlayerId.size === 0) {
    return undefined;
  }

  const ownedCoords: TileCoord[] = [];
  for (const key of input.territoryTileKeys) {
    ownedCoords.push(parseCoord(key));
  }
  if (ownedCoords.length === 0) return undefined;

  const neutralBest = nearestBeaconToTerritory(input.neutralBeaconTileKeys, ownedCoords, "neutral_value");

  // Enemy beacons: collect all enemy yield-bearing keys (excluding self and barbarians).
  const enemyKeys: string[] = [];
  for (const [pid, keys] of input.enemyYieldKeysByPlayerId) {
    if (pid === input.playerId || pid.startsWith("barbarian-")) continue;
    for (const k of keys) enemyKeys.push(k);
  }
  const enemyBest = enemyKeys.length > 0 ? nearestBeaconToTerritory(enemyKeys, ownedCoords, "enemy") : undefined;

  // Prefer neutral beacons — enemy beacons are a fallback when no neutral targets remain.
  const chosen = !neutralBest ? enemyBest
    : !enemyBest ? neutralBest
    : neutralBest.dist <= enemyBest.dist ? neutralBest
    : neutralBest;

  if (!chosen) return undefined;
  return { x: chosen.beacon.x, y: chosen.beacon.y, kind: chosen.kind };
};

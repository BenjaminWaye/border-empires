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

// Max samples for territory tiles and beacon keys. Bounds the O(B×T) loop to
// O(MAX×MAX) regardless of empire or world size. At 300×300 = 90k ops the
// function runs <5ms on shared-cpu; accuracy loss is negligible (evenly-strided).
const MAX_TERRITORY_SAMPLE = 300;
const MAX_BEACON_SAMPLE = 300;

export const selectExpansionObjective = (
  input: SelectExpansionObjectiveInput
): ExpansionObjective | undefined => {
  if (input.neutralBeaconTileKeys.size === 0 && input.enemyYieldKeysByPlayerId.size === 0) {
    return undefined;
  }

  // Collect keys first (cheap string copies), then stride-sample before parsing.
  const allKeys: string[] = [];
  for (const key of input.territoryTileKeys) allKeys.push(key);
  if (allKeys.length === 0) return undefined;

  const step = Math.max(1, Math.ceil(allKeys.length / MAX_TERRITORY_SAMPLE));
  const ownedCoords: TileCoord[] = [];
  for (let i = 0; i < allKeys.length; i += step) {
    ownedCoords.push(parseCoord(allKeys[i]!));
  }

  // Neutral beacons: stride-sample to MAX_BEACON_SAMPLE so large
  // neutral-beacon sets (post-season worlds with 1000s of beacons) don't
  // blow up the O(B×T) loop. Accuracy loss is negligible (evenly-strided).
  const neutralKeys: string[] = [...input.neutralBeaconTileKeys];
  const neutralStep = Math.max(1, Math.ceil(neutralKeys.length / MAX_BEACON_SAMPLE));
  const sampledNeutralKeys: string[] = [];
  for (let i = 0; i < neutralKeys.length; i += neutralStep) sampledNeutralKeys.push(neutralKeys[i]!);
  const neutralBest = sampledNeutralKeys.length > 0
    ? nearestBeaconToTerritory(sampledNeutralKeys, ownedCoords, "neutral_value")
    : undefined;

  // Enemy beacons: collect all enemy yield-bearing keys (excluding self and barbarians),
  // then stride-sample to MAX_BEACON_SAMPLE so large empires don't blow up the B×T loop.
  const allEnemyKeys: string[] = [];
  for (const [pid, keys] of input.enemyYieldKeysByPlayerId) {
    if (pid === input.playerId || pid.startsWith("barbarian-")) continue;
    for (const k of keys) allEnemyKeys.push(k);
  }
  const enemyStep = Math.max(1, Math.ceil(allEnemyKeys.length / MAX_BEACON_SAMPLE));
  const enemyKeys: string[] = [];
  for (let i = 0; i < allEnemyKeys.length; i += enemyStep) enemyKeys.push(allEnemyKeys[i]!);
  const enemyBest = enemyKeys.length > 0 ? nearestBeaconToTerritory(enemyKeys, ownedCoords, "enemy") : undefined;

  // Prefer neutral beacons — enemy beacons are a fallback when no neutral targets remain.
  const chosen = !neutralBest ? enemyBest
    : !enemyBest ? neutralBest
    : neutralBest.dist <= enemyBest.dist ? neutralBest
    : neutralBest;

  if (!chosen) return undefined;
  return { x: chosen.beacon.x, y: chosen.beacon.y, kind: chosen.kind };
};

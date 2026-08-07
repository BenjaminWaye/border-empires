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

// Max samples for territory tiles and beacon keys. Bounds the O(B×T) loop to
// O(MAX×MAX) regardless of empire or world size. At 300×300 = 90k ops the
// function runs <5ms on shared-cpu; accuracy loss is negligible (evenly-strided).
const MAX_TERRITORY_SAMPLE = 300;
const MAX_BEACON_SAMPLE = 300;

/** One sampled enemy yield-bearing tile, tagged with its owner for the cheap self-exclusion below. */
export type SampledEnemyYieldKey = { key: string; ownerId: string };

/**
 * Samples yield-bearing tiles across every non-barbarian player into a single
 * bounded pool, ONCE. 2026-07-29 login-stall investigation: this used to be
 * rebuilt from scratch by selectExpansionObjective for EVERY player in a sync
 * batch, even though exportPlannerPlayerViews/buildRuntimePlannerPlayerViews
 * always calls it once per player against the exact same source map —  a
 * 9-AI-player batch paid this full collect-and-sample 9 times over for
 * identical underlying data. Self-exclusion is deliberately NOT done here —
 * it happens per-player against this already-bounded (<=300) pool in
 * selectExpansionObjective, which is far cheaper than excluding-then-sampling
 * per player against the full unsampled data.
 */
export const sampleEnemyYieldKeysAcrossPlayers = (
  enemyYieldKeysByPlayerId: ReadonlyMap<string, ReadonlySet<string>>
): SampledEnemyYieldKey[] => {
  const all: SampledEnemyYieldKey[] = [];
  for (const [ownerId, keys] of enemyYieldKeysByPlayerId) {
    if (ownerId.startsWith("barbarian-")) continue;
    for (const key of keys) all.push({ key, ownerId });
  }
  const step = Math.max(1, Math.ceil(all.length / MAX_BEACON_SAMPLE));
  const sampled: SampledEnemyYieldKey[] = [];
  for (let i = 0; i < all.length; i += step) sampled.push(all[i]!);
  return sampled;
};

export type SelectExpansionObjectiveInput = {
  // Array, not Iterable/Set: callers already maintain this incrementally as
  // an array (see plannerPlayerTileKeys) — accepting it directly here avoids
  // a full O(owned tiles) copy purely to learn its length for stride-sampling.
  territoryTileKeys: readonly string[];
  neutralBeaconTileKeys: ReadonlySet<string>;
  /** Pre-sampled, shared across every player in the same sync batch — see sampleEnemyYieldKeysAcrossPlayers. */
  sampledEnemyYieldKeys: readonly SampledEnemyYieldKey[];
  playerId: string;
};

export const selectExpansionObjective = (
  input: SelectExpansionObjectiveInput
): ExpansionObjective | undefined => {
  if (input.neutralBeaconTileKeys.size === 0 && input.sampledEnemyYieldKeys.length === 0) {
    return undefined;
  }

  const allKeys = input.territoryTileKeys;
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

  // Enemy beacons: the pool is already bounded (<=MAX_BEACON_SAMPLE) and
  // shared across players — only self-exclusion happens per player, and it's
  // cheap because the pool is already small.
  const enemyKeys = input.sampledEnemyYieldKeys
    .filter((entry) => entry.ownerId !== input.playerId)
    .map((entry) => entry.key);
  const enemyBest = enemyKeys.length > 0 ? nearestBeaconToTerritory(enemyKeys, ownedCoords, "enemy") : undefined;

  // Prefer neutral beacons — enemy beacons are a fallback when no neutral targets remain.
  const chosen = !neutralBest ? enemyBest
    : !enemyBest ? neutralBest
    : neutralBest.dist <= enemyBest.dist ? neutralBest
    : neutralBest;

  if (!chosen) return undefined;
  return { x: chosen.beacon.x, y: chosen.beacon.y, kind: chosen.kind };
};

import type { DomainTileState } from "@border-empires/game-domain";
import { computeAfcBlockerKeys, computeCoastalLandKeys, computeLandRegions, hasWaterNeighbor, isAfcSiteClear, preferDryFootprintCandidates } from "@border-empires/game-domain";
import type { Terrain } from "@border-empires/shared";

import { simulationTileKey } from "../seed-state/seed-state.js";
import { BARBARIAN_SPAWN_AVOID_RADIUS } from "./barbarian-proximity.js";

// computeCoastalLandKeys/computeLandRegions/computeFairSpawnSites live in
// game-domain (server-worldgen-fair-spawn-sites.ts) so apps/worldgen-lab can
// share the exact same algorithm instead of re-approximating it — re-exported
// here so existing callers in this app keep importing them from this module.
export { computeCoastalLandKeys, computeLandRegions, computeFairSpawnSites, type FairSpawnSite } from "@border-empires/game-domain";

type SpawnRequirements = {
  needsTown: boolean;
  needsFood: boolean;
  minSpawnDistance: number;
  minTownDistance: number;
  // Best-effort preference for a site with no barbarian-owned tile nearby.
  // Barbarian tiles are SETTLED, so every pass with minSpawnDistance >=
  // BARBARIAN_SPAWN_AVOID_RADIUS already keeps clear of them; this only adds
  // anything on a pass that drops the distance check entirely. It is set on the
  // first 0-distance pass only: the unflagged 0-distance pass after it and the
  // last-resort loop still accept any site, so a barbarian-heavy map always
  // yields a spawn (the landing wipe clears whatever is in reach).
  avoidBarbarians?: boolean;
};

type SpawnSearchPass = {
  tries: number;
  requirements: SpawnRequirements;
};

export type LegacySpawnPlacementInput = {
  playerId: string;
  tiles: Iterable<DomainTileState>;
  blockedTileKeys?: ReadonlySet<string>;
  rallyAnchor?: { x: number; y: number };
  // Coastal-land membership depends only on tile.terrain, which never
  // changes after worldgen — callers that hit this on a hot path (every new
  // player connecting, via ensurePlayerHasSpawnTerritory) can precompute it
  // once and pass it here instead of paying the O(tiles) scan-and-flood-fill
  // in computeCoastalLandKeys on every call. Falls back to computing it
  // in-line (unchanged behavior) when omitted.
  coastalLandKeys?: ReadonlySet<string>;
  // Spatial "is there a settled/town/food tile within radius of (x,y)"
  // queries, replacing this function's own linear-scan derivation below. The
  // search loop calls these up to ~24,000 times per spawn attempt, and
  // settledCoords in particular tracks every OWNED TILE across every player
  // (not one point per player) — on a mature world that's thousands of
  // coordinates, and a linear scan against it dominates connect/INIT latency
  // under load. Hot-path callers pass a grid-backed index (see
  // SpawnPlacementIndex) instead; falls back to deriving from `tiles` with a
  // plain per-call linear scan (unchanged behavior) when omitted.
  hasNearbySettled?: (x: number, y: number, radius: number) => boolean;
  hasNearbyTown?: (x: number, y: number, radius: number) => boolean;
  hasNearbyFood?: (x: number, y: number, radius: number) => boolean;
  // Live terrain lookup for the AFC dry-footprint rule (no water on any of
  // the spawn tile's 8 neighbours -- see hasWaterNeighbor). Hot-path callers
  // pass their tile map's lookup; falls back to a map built from `tiles`.
  terrainAt?: (x: number, y: number) => Terrain | undefined;
  // Best-effort "is a barbarian-owned tile within radius of (x,y)", consulted
  // only by passes flagged SpawnRequirements.avoidBarbarians and only after
  // every other check passed. Omitted = no barbarian preference.
  hasNearbyBarbarian?: (x: number, y: number, radius: number) => boolean;
};

export const RALLY_SPAWN_RADIUS = 24;

// Keeps a fresh spawn from landing right next to a town it could walk into
// and settle within the first few turns — a player should have to travel to
// reach a town, not auto-settle it the moment they join. Like
// minSpawnDistance, this degrades to 0 in the most desperate fallback passes
// below so a spawn still gets found on a map too small/crowded to keep every
// spawn 5 tiles clear of a town.
const MIN_TOWN_SPAWN_DISTANCE = 5;

// Passes tried (in order) for a rally-linked spawn, before falling back to
// "closest open land to the anchor regardless of quality". A rally spawn
// should land somewhere a player can actually build from — near a town and
// food, same as an ordinary spawn — not just be the nearest empty tile to
// the inviting player. minSpawnDistance is intentionally small/zero here
// (unlike LEGACY_SPAWN_SEARCH_ORDER's 50): the whole point of a rally spawn
// is landing close to the anchor player's own settled tiles.
const RALLY_SPAWN_SEARCH_ORDER: readonly SpawnRequirements[] = [
  { needsTown: true, needsFood: true, minSpawnDistance: 3, minTownDistance: MIN_TOWN_SPAWN_DISTANCE },
  { needsTown: true, needsFood: false, minSpawnDistance: 3, minTownDistance: MIN_TOWN_SPAWN_DISTANCE },
  { needsTown: false, needsFood: true, minSpawnDistance: 3, minTownDistance: MIN_TOWN_SPAWN_DISTANCE },
  { needsTown: false, needsFood: false, minSpawnDistance: 3, minTownDistance: MIN_TOWN_SPAWN_DISTANCE },
  { needsTown: false, needsFood: false, minSpawnDistance: 0, minTownDistance: 0 }
];

const LEGACY_SPAWN_SEARCH_ORDER: readonly SpawnSearchPass[] = [
  { tries: 8_000, requirements: { needsTown: true, needsFood: true, minSpawnDistance: 50, minTownDistance: MIN_TOWN_SPAWN_DISTANCE } },
  { tries: 5_000, requirements: { needsTown: true, needsFood: false, minSpawnDistance: 50, minTownDistance: MIN_TOWN_SPAWN_DISTANCE } },
  { tries: 5_000, requirements: { needsTown: false, needsFood: true, minSpawnDistance: 50, minTownDistance: MIN_TOWN_SPAWN_DISTANCE } },
  { tries: 5_000, requirements: { needsTown: false, needsFood: false, minSpawnDistance: 50, minTownDistance: MIN_TOWN_SPAWN_DISTANCE } },
  { tries: 3_000, requirements: { needsTown: false, needsFood: false, minSpawnDistance: 20, minTownDistance: MIN_TOWN_SPAWN_DISTANCE } },
  { tries: 3_000, requirements: { needsTown: false, needsFood: false, minSpawnDistance: 10, minTownDistance: 0 } },
  { tries: 3_000, requirements: { needsTown: false, needsFood: false, minSpawnDistance: 0, minTownDistance: 0, avoidBarbarians: true } },
  { tries: 3_000, requirements: { needsTown: false, needsFood: false, minSpawnDistance: 0, minTownDistance: 0 } }
];

const manhattanDistance = (ax: number, ay: number, bx: number, by: number): number => Math.abs(ax - bx) + Math.abs(ay - by);
const chebyshevDistance = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const nextSeed = (seed: number): number => (Math.imul(seed, 1664525) + 1013904223) >>> 0;

export const chooseLegacySpawnPlacement = (input: LegacySpawnPlacementInput): { x: number; y: number } | undefined => {
  const tileList = [...input.tiles];
  if (tileList.length === 0) return undefined;

  const blocked = input.blockedTileKeys ?? new Set<string>();
  const coastalLandKeys = input.coastalLandKeys ?? computeCoastalLandKeys(tileList);
  // The spawn tile becomes an AFC, so ideally neither it nor any of its 8
  // neighbours is a town, dock or resource. That is required on every pass
  // (including the fallbacks that relax distance and dry-footprint
  // requirements) whenever any clear site exists. Only when none does (a tiny
  // or fully crowded world) do we fall back to an unowned land tile whose 3x3
  // footprint the AFC then clears (towns/resources on it are crushed, see
  // prepareAfcLandingFootprint) rather than leaving the player unspawned.
  const afcBlockerKeys = computeAfcBlockerKeys(tileList);
  const blocksAfcSite = (x: number, y: number): boolean => afcBlockerKeys.has(simulationTileKey(x, y));
  const candidatesWhere = (requireClearAfcSite: boolean): typeof tileList =>
    tileList.filter((tile) => {
      const tileKey = simulationTileKey(tile.x, tile.y);
      if (tile.terrain !== "LAND" || tile.ownerId || tile.town || tile.dockId || blocked.has(tileKey)) return false;
      if (requireClearAfcSite && !isAfcSiteClear(blocksAfcSite, tile.x, tile.y)) return false;
      if (coastalLandKeys.size > 0 && !coastalLandKeys.has(tileKey)) return false;
      return true;
    });
  const clearSpawnCandidates = candidatesWhere(true);
  // Fallback: the landing crushes unowned towns/resources on its 3x3 footprint, so only tiles
  // whose footprint holds no dock (docks are linked in pairs) and no owned town/resource qualify.
  const fallbackCandidates = (): typeof tileList => {
    const tileByKey = new Map(tileList.map((tile) => [simulationTileKey(tile.x, tile.y), tile] as const));
    const footprintCrushable = (cx: number, cy: number): boolean => {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const neighbour = tileByKey.get(simulationTileKey(cx + dx, cy + dy));
          if (!neighbour) continue;
          if (neighbour.dockId) return false;
          if ((neighbour.town || neighbour.resource) && neighbour.ownerId) return false;
        }
      }
      return true;
    };
    return candidatesWhere(false).filter((tile) => footprintCrushable(tile.x, tile.y));
  };
  const spawnCandidates = clearSpawnCandidates.length > 0 ? clearSpawnCandidates : fallbackCandidates();
  if (spawnCandidates.length === 0) return undefined;

  let landRegionByTileKeyCache: Map<string, number> | undefined;
  const landRegionByTileKey = (): Map<string, number> => {
    if (!landRegionByTileKeyCache) landRegionByTileKeyCache = computeLandRegions(tileList);
    return landRegionByTileKeyCache;
  };
  // A candidate is only "near" a food/town tile if it's within radius AND on
  // the same land region — otherwise a resource across water satisfies the
  // Manhattan-distance check and a spawn gets accepted next to food the
  // player can't actually reach without crossing water.
  const sameLandRegion = (ax: number, ay: number, bx: number, by: number): boolean => {
    const regions = landRegionByTileKey();
    const originRegion = regions.get(simulationTileKey(ax, ay));
    return originRegion === undefined || regions.get(simulationTileKey(bx, by)) === originRegion;
  };
  const hasNearbyTown =
    input.hasNearbyTown ??
    ((): ((x: number, y: number, radius: number) => boolean) => {
      const townCoords = tileList.filter((tile) => tile.town).map((tile) => ({ x: tile.x, y: tile.y }));
      return (x, y, radius) => townCoords.some((town) => manhattanDistance(x, y, town.x, town.y) <= radius && sameLandRegion(x, y, town.x, town.y));
    })();
  const hasNearbyFood =
    input.hasNearbyFood ??
    ((): ((x: number, y: number, radius: number) => boolean) => {
      const foodCoords = tileList.filter((tile) => tile.resource === "FARM" || tile.resource === "FISH").map((tile) => ({ x: tile.x, y: tile.y }));
      return (x, y, radius) => foodCoords.some((food) => manhattanDistance(x, y, food.x, food.y) <= radius && sameLandRegion(x, y, food.x, food.y));
    })();
  const hasNearbySpawn =
    input.hasNearbySettled ??
    ((): ((x: number, y: number, radius: number) => boolean) => {
      const settledCoords = tileList
        .filter((tile) => tile.ownerId && tile.ownershipState && tile.ownershipState !== "BARBARIAN")
        .map((tile) => ({ x: tile.x, y: tile.y }));
      return (x, y, radius) => settledCoords.some((spawn) => chebyshevDistance(x, y, spawn.x, spawn.y) < radius);
    })();

  const terrainAt =
    input.terrainAt ??
    ((): ((x: number, y: number) => Terrain | undefined) => {
      const terrainByKey = new Map(tileList.map((tile) => [simulationTileKey(tile.x, tile.y), tile.terrain] as const));
      return (x, y) => terrainByKey.get(simulationTileKey(x, y));
    })();

  const canSpawnAt = (x: number, y: number, requirements: SpawnRequirements, requireDryFootprint = true): boolean => {
    if (requireDryFootprint && hasWaterNeighbor(terrainAt, x, y)) return false;
    if (requirements.minSpawnDistance > 0 && hasNearbySpawn(x, y, requirements.minSpawnDistance)) return false;
    if (requirements.minTownDistance > 0 && hasNearbyTown(x, y, requirements.minTownDistance - 1)) return false;
    if (requirements.needsTown && !hasNearbyTown(x, y, 10)) return false;
    if (requirements.needsFood && !hasNearbyFood(x, y, 10)) return false;
    // Last on purpose: the scan is the priciest check, so it only runs for a
    // candidate every other rule already accepted.
    if (requirements.avoidBarbarians && input.hasNearbyBarbarian?.(x, y, BARBARIAN_SPAWN_AVOID_RADIUS)) return false;
    return true;
  };

  if (input.rallyAnchor) {
    const nearbyCandidates = preferDryFootprintCandidates(spawnCandidates
      .filter((tile) => chebyshevDistance(tile.x, tile.y, input.rallyAnchor!.x, input.rallyAnchor!.y) <= RALLY_SPAWN_RADIUS)
      .sort((left, right) => {
        const leftDistance = chebyshevDistance(left.x, left.y, input.rallyAnchor!.x, input.rallyAnchor!.y);
        const rightDistance = chebyshevDistance(right.x, right.y, input.rallyAnchor!.x, input.rallyAnchor!.y);
        return (leftDistance - rightDistance) || (left.y - right.y) || (left.x - right.x);
      }), terrainAt);
    for (const requirements of RALLY_SPAWN_SEARCH_ORDER) {
      const qualifyingCandidates = nearbyCandidates.filter((tile) => canSpawnAt(tile.x, tile.y, requirements, false));
      const rallySpawn = qualifyingCandidates[hashString(input.playerId) % Math.max(1, Math.min(qualifyingCandidates.length, 8))];
      if (rallySpawn) return { x: rallySpawn.x, y: rallySpawn.y };
    }
  }

  let seed = hashString(input.playerId);
  for (const pass of LEGACY_SPAWN_SEARCH_ORDER) {
    for (let attempt = 0; attempt < pass.tries; attempt += 1) {
      seed = nextSeed(seed + attempt);
      const candidate = spawnCandidates[seed % spawnCandidates.length];
      if (!candidate) continue;
      if (canSpawnAt(candidate.x, candidate.y, pass.requirements)) return { x: candidate.x, y: candidate.y };
    }
  }
  // Last resort: the loosest pass again without the dry-footprint rule, so a
  // waterlogged map still yields a spawn rather than none.
  const loosestPass = LEGACY_SPAWN_SEARCH_ORDER[LEGACY_SPAWN_SEARCH_ORDER.length - 1]!;
  for (let attempt = 0; attempt < loosestPass.tries; attempt += 1) {
    seed = nextSeed(seed + attempt);
    const candidate = spawnCandidates[seed % spawnCandidates.length];
    if (candidate && canSpawnAt(candidate.x, candidate.y, loosestPass.requirements, false)) return { x: candidate.x, y: candidate.y };
  }

  return undefined;
};

/** The tile an AFC lands on: the landing tile's own resource (if any) is replaced by the AFC. */
export const afcLandingTile = (tile: DomainTileState): DomainTileState => {
  const { resource: _replacedResource, ...rest } = tile;
  return rest;
};

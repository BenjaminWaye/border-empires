// Terrain combat modifiers: hills defend better, and attacking across a river
// is harder. Both read only procedural worldgen terrain (the season seed and
// worldgen version), never live tile state, so the simulation, the gateway's
// attack preview and the client all derive the same answer without any new
// snapshot fields. The gateway never runs worldgen (building a season's
// terrain blocks for ~12s), so its attack preview takes the two facts from
// the client's ATTACK_PREVIEW (terrainCombatFacts computed on the client's
// own seeded worldgen). Only the preview trusts them; the simulation always
// derives its own.
import { HILLS_DEFENSE_MULT, RIVER_CROSSING_ATTACK_MULT, WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { isHillsTileAt } from "../hills-terrain/hills-terrain.js";
import { wrapX, wrapY } from "../math/math.js";
import { riverEdgeKey } from "../worldgen/worldgen-rivers-edge.js";
import { riverEdgeKeysForCurrentSeed } from "../worldgen/worldgen-rivers.js";
import { terrainAt } from "../worldgen/worldgen.js";

type Point = { x: number; y: number };

// Signed step of -1, 0 or 1 between two coordinates on a wrapping axis;
// undefined when they're further apart than one tile.
const unitStep = (from: number, to: number, size: number): number | undefined => {
  const delta = wrapX(to - from, size);
  if (delta === 0) return 0;
  if (delta === 1) return 1;
  if (delta === size - 1) return -1;
  return undefined;
};

/** Edge key of the shared side between two orthogonally adjacent tiles. */
const sharedEdgeKey = (a: Point, dx: number, dy: number): number =>
  dx !== 0
    ? riverEdgeKey(dx > 0 ? a.x + 1 : a.x, a.y, "V")
    : riverEdgeKey(a.x, dy > 0 ? a.y + 1 : a.y, "H");

/**
 * True when an attack from `origin` into the 8-neighbour `target` crosses a
 * river. An orthogonal attack crosses when a river runs along the shared
 * edge. A diagonal attack crosses when a river edge touches the shared
 * corner and neither L-shaped route around it is a dry land way round (a
 * route either crosses a river edge or passes through sea/mountain), so a
 * river can't be dodged by attacking diagonally, while a river that merely
 * touches the corner with dry ground round the other side doesn't count. Non-
 * adjacent pairs (dock crossings, aether bridges) never count as river
 * crossings. Always false before edge rivers (worldgen v9), since the
 * river-edge set is empty there.
 */
export const attackCrossesRiver = (origin: Point, target: Point): boolean => {
  const rivers = riverEdgeKeysForCurrentSeed();
  if (rivers.size === 0) return false;
  const dx = unitStep(origin.x, target.x, WORLD_WIDTH);
  const dy = unitStep(origin.y, target.y, WORLD_HEIGHT);
  if (dx === undefined || dy === undefined || (dx === 0 && dy === 0)) return false;
  if (dx === 0 || dy === 0) return rivers.has(sharedEdgeKey(origin, dx, dy));
  // Diagonal: route A goes horizontal first, route B vertical first. A route
  // whose middle tile isn't land (sea at a river mouth, the mountain at a
  // headwater) offers no dry way round, so it doesn't clear the attack --
  // otherwise every river would have a penalty-free diagonal at each end.
  const viaX = { x: wrapX(origin.x + dx, WORLD_WIDTH), y: origin.y };
  const viaY = { x: origin.x, y: wrapY(origin.y + dy, WORLD_HEIGHT) };
  const routeACrosses = rivers.has(sharedEdgeKey(origin, dx, 0)) || rivers.has(sharedEdgeKey(viaX, 0, dy));
  const routeBCrosses = rivers.has(sharedEdgeKey(origin, 0, dy)) || rivers.has(sharedEdgeKey(viaY, dx, 0));
  if (!routeACrosses && !routeBCrosses) return false;
  return (routeACrosses || !isWorldgenLand(viaX)) && (routeBCrosses || !isWorldgenLand(viaY));
};

// Rivers are generated against worldgen terrain, so the "is there a dry way
// round" check reads the same (never live tile terrain, which aether
// abilities can change and the gateway/client may not know).
const isWorldgenLand = (p: Point): boolean => terrainAt(p.x, p.y) === "LAND";

export type TerrainCombatModifiers = {
  /** Defender stands on hills (HILLS_DEFENSE_MULT); only counts where the tile defends at all. */
  hillsDefenseMult?: number;
  /** Attack crosses a river edge (RIVER_CROSSING_ATTACK_MULT). */
  riverCrossingAttackMult?: number;
};

/** Only the target-side (hills) term -- for estimates with no known origin, e.g. tiles along a march line. */
export const hillsDefenseModifiersAt = (x: number, y: number): TerrainCombatModifiers =>
  terrainCombatModifiersFromFacts({ hillsDefense: isHillsTileAt(wrapX(x, WORLD_WIDTH), wrapY(y, WORLD_HEIGHT)) });

/** Which terrain terms apply to one attack, as plain booleans (what the client sends with ATTACK_PREVIEW). */
export type TerrainCombatFacts = { hillsDefense?: boolean | undefined; riverCrossing?: boolean | undefined };

export const terrainCombatFacts = (origin: Point, target: Point): { hillsDefense: boolean; riverCrossing: boolean } => ({
  hillsDefense: isHillsTileAt(wrapX(target.x, WORLD_WIDTH), wrapY(target.y, WORLD_HEIGHT)),
  riverCrossing: attackCrossesRiver(origin, target)
});

/**
 * Terrain facts -> multipliers ready to spread into FrontierCombatModifiers.
 * Fields are omitted when they don't apply, so the combat breakdown never
 * shows a "x1.0" row for them.
 */
export const terrainCombatModifiersFromFacts = (facts: TerrainCombatFacts): TerrainCombatModifiers => ({
  ...(facts.hillsDefense ? { hillsDefenseMult: HILLS_DEFENSE_MULT } : {}),
  ...(facts.riverCrossing ? { riverCrossingAttackMult: RIVER_CROSSING_ATTACK_MULT } : {})
});

/** The terrain terms for one attack (simulation: authoritative). */
export const terrainCombatModifiers = (origin: Point, target: Point): TerrainCombatModifiers =>
  terrainCombatModifiersFromFacts(terrainCombatFacts(origin, target));

/**
 * Pure scoring/classification helpers for frontier-command-planner.ts,
 * extracted to keep that file under the repo's 500-line file cap.
 */
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { isSeaTerrain, type Terrain, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

import type { SettlementCandidateEvaluation } from "./ai-settlement-priority.js";
import { dockCrossingCandidateTileKeys } from "../dock-network/dock-network.js";
import { forEachFrontierNeighbor } from "../frontier-topology.js";

export type PlannerTile = {
  x: number;
  y: number;
  terrain: Terrain;
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  resource?: string | undefined;
  dockId?: string | undefined;
  town?: unknown;
};

export type PlannerTileLookup = ReadonlyMap<string, PlannerTile>;

export type FrontierClass = "economic" | "scaffold" | "scout" | "waste";

export type FrontierSelection = {
  from: PlannerTile;
  target: PlannerTile;
  score: number;
  frontierClass?: FrontierClass;
};

export const sortTiles = (left: { x: number; y: number }, right: { x: number; y: number }): number =>
  (left.x - right.x) || (left.y - right.y);

/** Bonus per Chebyshev step closer to the expansion objective. */
export const DIRECTION_BIAS_WEIGHT = 40;

const wrapDistSingle = (a: number, b: number, size: number): number => {
  const d = Math.abs(a - b);
  return d < size - d ? d : size - d;
};

export const chebyshevWrap = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(wrapDistSingle(ax, bx, WORLD_WIDTH), wrapDistSingle(ay, by, WORLD_HEIGHT));

export const tileKeyOf = (x: number, y: number): string => `${x},${y}`;

const resourceScore = (resource: string | undefined, needsFood: boolean = false): number => {
  switch (resource) {
    case "FARM":
    case "FISH":
      return needsFood ? 360 : 180;
    case "IRON":
    case "WOOD":
    case "FUR":
      return 120;
    case "GEMS":
      return 90;
    default:
      return 0;
  }
};

/** Cap the number of candidates scored in a single analyze pass. See docs/plans/2026-05-30-cap-narrow-analyze-path.md. */
export const NARROW_ANALYZE_MAX_CANDIDATES = 512;

export const strategicFrontierTargetScore = (tile: PlannerTile, needsFood: boolean = false): number => {
  let score = 0;
  if (tile.town) score += 1_000;
  if (tile.dockId) score += 450;
  score += resourceScore(tile.resource, needsFood);
  if (!tile.resource && !tile.town && !tile.dockId) score -= 40;
  return score;
};

export const ownedNeighborCount = (tilesByKey: PlannerTileLookup, tile: PlannerTile, playerId: string): number => {
  let count = 0;
  forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
    if (tilesByKey.get(`${nx},${ny}`)?.ownerId === playerId) count += 1;
  });
  return count;
};

export const coastlineDiscoveryValue = (tilesByKey: PlannerTileLookup, tile: PlannerTile): number => {
  let score = 0;
  forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
    if (isSeaTerrain(tilesByKey.get(`${nx},${ny}`)?.terrain as Terrain)) score += 18;
  });
  return score;
};

export const candidateKeysForOrigin = (
  from: PlannerTile,
  dockLinksByDockTileKey?: ReadonlyMap<string, readonly string[]>
): string[] => {
  const candidateKeys = new Set<string>();
  forEachFrontierNeighbor(from.x, from.y, (nx, ny) => candidateKeys.add(`${nx},${ny}`));
  if (from.dockId && dockLinksByDockTileKey) {
    for (const tileKey of dockCrossingCandidateTileKeys(tileKeyOf(from.x, from.y), dockLinksByDockTileKey)) {
      candidateKeys.add(tileKey);
    }
  }
  return [...candidateKeys];
};

/**
 * Vision is a Chebyshev square ((2*VISION_RADIUS+1)^2, see runtime-visible-state.ts).
 * A diagonal claim step (dx!=0 && dy!=0 relative to the origin tile) extends the
 * visible square along both axes at once, uncovering an L-shaped strip of new
 * fog on two sides; an orthogonal step only extends fog along one axis. Diagonal
 * claims are therefore strictly more fog-efficient per gold spent when picking
 * between otherwise-equivalent scouting candidates.
 */
export const DIAGONAL_SCOUT_BONUS = 40;

export const isDiagonalStep = (from: PlannerTile, target: PlannerTile): boolean =>
  from.x !== target.x && from.y !== target.y;

export const scoutExpandScore = (
  tilesByKey: PlannerTileLookup,
  from: PlannerTile,
  target: PlannerTile,
  playerId: string,
  currentReachableLandKeys: ReadonlySet<string>,
  dockLinksByDockTileKey?: ReadonlyMap<string, readonly string[]>,
  preferFogEfficientExpansion: boolean = false
): number => {
  const nextStepCandidateKeys = new Set(candidateKeysForOrigin(target, dockLinksByDockTileKey));
  nextStepCandidateKeys.delete(tileKeyOf(from.x, from.y));
  nextStepCandidateKeys.delete(tileKeyOf(target.x, target.y));
  let nextStepNonOwnedCount = 0;
  let novelFrontierCount = 0;
  let novelStrategicCount = 0;
  for (const nextStepKey of nextStepCandidateKeys) {
    const nextStepTile = tilesByKey.get(nextStepKey);
    if (!nextStepTile || nextStepTile.terrain !== "LAND" || nextStepTile.ownerId === playerId) continue;
    nextStepNonOwnedCount += 1;
    if (!currentReachableLandKeys.has(nextStepKey)) {
      novelFrontierCount += 1;
      if (nextStepTile.resource || nextStepTile.dockId || nextStepTile.town) novelStrategicCount += 1;
    }
  }
  return (
    novelStrategicCount * 220 +
    novelFrontierCount * 70 +
    nextStepNonOwnedCount * 15 +
    coastlineDiscoveryValue(tilesByKey, target) -
    ownedNeighborCount(tilesByKey, target, playerId) * 25 +
    (from.ownershipState === "FRONTIER" ? 10 : 0) +
    (preferFogEfficientExpansion && novelFrontierCount > 0 && isDiagonalStep(from, target) ? DIAGONAL_SCOUT_BONUS : 0)
  );
};

export const classifyNeutralOpportunity = (
  target: PlannerTile,
  settlementEvaluation: SettlementCandidateEvaluation,
  scoutScore: number
): FrontierClass => {
  if (target.town || target.dockId || target.resource) return "economic";
  if (settlementEvaluation.supportsImmediatePlan && settlementEvaluation.score >= 45) return "scaffold";
  if (scoutScore >= 30) return "scout";
  return "waste";
};

export const selectionScoreForClass = (
  frontierClass: FrontierClass,
  target: PlannerTile,
  settlementEvaluation: SettlementCandidateEvaluation,
  scoutScore: number,
  needsFood: boolean = false
): number => {
  const strategicScore = strategicFrontierTargetScore(target, needsFood);
  if (frontierClass === "economic") {
    if (needsFood && target.town && !target.resource) {
      return 100 + scoutScore;
    }
    return 260 + strategicScore + settlementEvaluation.score * 0.25;
  }
  if (frontierClass === "scaffold") return 180 + settlementEvaluation.score;
  if (frontierClass === "scout") return 120 + scoutScore;
  return 50 + scoutScore + Math.max(0, settlementEvaluation.score);
};

export const isBetterSelection = (next: FrontierSelection, current: FrontierSelection | undefined): boolean =>
  !current ||
  next.score > current.score ||
  (next.score === current.score &&
    (sortTiles(next.from, current.from) < 0 ||
      (sortTiles(next.from, current.from) === 0 && sortTiles(next.target, current.target) < 0)));

export const createFrontierCommand = (
  selection: FrontierSelection,
  playerId: string,
  clientSeq: number,
  issuedAt: number,
  sessionPrefix: "ai-runtime" | "system-runtime",
  type: "ATTACK" | "EXPAND"
): CommandEnvelope => ({
  commandId: `${sessionPrefix}-${playerId}-${clientSeq}-${issuedAt}`,
  sessionId: `${sessionPrefix}:${playerId}`,
  playerId,
  clientSeq,
  issuedAt,
  type,
  payloadJson: JSON.stringify({
    fromX: selection.from.x,
    fromY: selection.from.y,
    toX: selection.target.x,
    toY: selection.target.y
  })
});

// Types and small pure helpers for the waypoint planner (see
// waypoint-planner.ts for the A* algorithm itself) -- split into its own
// file to stay under the repo's per-file line cap.
import {
  BARBARIAN_RAID_COST,
  FOREST_FRONTIER_CLAIM_MULT,
  FRONTIER_CLAIM_MS
} from "../config.js";
import { requiredMusterForFort } from "../structure-costs/structure-costs.js";
import type { FortVariant } from "../types.js";
import { grassShadeAt, landBiomeAt } from "../worldgen/worldgen.js";

export type WaypointAction = "EXPAND" | "ATTACK";

// Deliberately narrow wire projection of WaypointStep -- see
// docs/waypoint-client-planning-plan.md §1. Carries only what a replayer
// needs (origin/target/action) to dispatch a leg, not the costing fields
// (durationMs/goldCost/manpowerCost/...) the client only needs for its own
// UI. Produced by wireStepsForPlan below and consumed server-side by
// apps/simulation's runtime-waypoint-drain.
export type WaypointWireStep = {
  origin: { x: number; y: number };
  target: { x: number; y: number };
  action: WaypointAction;
};

export type WaypointStep = {
  origin: { x: number; y: number };
  target: { x: number; y: number };
  action: WaypointAction;
  durationMs: number;
  goldCost: number;
  manpowerCost: number;
  manpowerMin: number;
  throughFog: boolean;
  viaDock: boolean;
};

// TARGET_UNEXPLORED is intentionally absent: an unexplored target is never
// pre-emptively blocked (see planWaypoint below) — it's attempted exactly
// like any other coordinate, and can only ever resolve to NO_PATH or, once
// discovered, TARGET_BARRIER/TARGET_OWN/TARGET_ALLIED/TARGET_TRUCED.
export type WaypointBlockReason =
  | "NO_PATH"
  | "TARGET_OWN"
  | "TARGET_BARRIER"
  | "TARGET_ALLIED"
  | "TARGET_TRUCED"
  | "NO_OWNED_TERRITORY";

export type WaypointPlan = {
  target: { x: number; y: number };
  steps: WaypointStep[];
  totalGold: number;
  totalManpower: number;
  totalDurationMs: number;
  expandCount: number;
  attackCount: number;
  reachable: boolean;
  blockReason?: WaypointBlockReason;
  // True when the first ATTACK step launches from a tile already
  // owned at plan time. False when the first attack launches from a
  // tile that an earlier EXPAND step claimed (a new front).
  // Undefined when the plan contains no attacks.
  firstAttackFromExistingFrontier?: boolean;
};

// Structural subset of a tile shared by ClientState's Tile and
// apps/simulation's DomainTileState -- both use these exact field names.
export type WaypointPlannerTile = {
  x: number;
  y: number;
  terrain: string;
  ownerId?: string | undefined;
  ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN" | undefined;
  fogged?: boolean | undefined;
  frontierDecayAt?: number | undefined;
  frontierDecayKind?: string | undefined;
  fort?: { status?: string | undefined; variant?: FortVariant | undefined } | null | undefined;
};

export type WaypointPlannerState = {
  me: string | undefined;
  tiles: ReadonlyMap<string, WaypointPlannerTile>;
  dockPairs: ReadonlyArray<{ ax: number; ay: number; bx: number; by: number }>;
  allies: ReadonlyArray<string>;
  activeTruces: ReadonlyArray<{ otherPlayerId?: string | undefined; endsAt?: number | undefined }>;
};

export type WaypointPlannerDeps = {
  state: WaypointPlannerState;
  keyFor: (x: number, y: number) => string;
  // Test override; defaults to wall-clock combat lock.
  attackDurationMs?: number;
  // Test override; defaults to forest-aware FRONTIER_CLAIM_MS lookup.
  expandDurationMsAt?: (x: number, y: number) => number;
  // Test override; defaults to Date.now for truce expiry checks.
  now?: number;
  // Fixed-borders-via-reach gate for EXPAND-type steps specifically (a
  // NEUTRAL tile the search would otherwise walk through). Omitted =
  // reach-blind (every caller must supply this to get a reach-correct
  // plan; there is no safe default since reach is caller/player-specific).
  // ATTACK-type steps (ENEMY tiles) are deliberately never checked against
  // this -- ATTACK is not reach-gated, matching the fixed-borders-via-reach
  // plan and validateFrontierCommand's own EXPAND-only reach requirement.
  isInReach?: (x: number, y: number) => boolean;
};

// Must match ENCIRCLEMENT_DECAY_MS in apps/simulation/src/encirclement.ts.
const ENCIRCLEMENT_DECAY_MS = 60_000;

/** True iff this owned tile is an encircled (cut-off-from-supply) frontier
 *  tile, which the sim rejects as an ATTACK/EXPAND origin (ORIGIN_CUT_OFF). */
export const isFrontierOriginCutOff = (tile: WaypointPlannerTile, nowMs = Date.now()): boolean => {
  if (tile.ownershipState !== "FRONTIER") return false;
  if (typeof tile.frontierDecayAt !== "number") return false;
  if (tile.frontierDecayKind !== "ENCIRCLEMENT") return false;
  const remaining = tile.frontierDecayAt - nowMs;
  return remaining > 0 && remaining <= ENCIRCLEMENT_DECAY_MS;
};

export const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],           [1, 0],
  [-1, 1],  [0, 1],  [1, 1]
];

// Tiebreaker added to step cost when a step changes direction from its
// parent step. Must be small enough that no sum of turn penalties along
// any feasible path can exceed the smallest real step cost (one expand,
// FRONTIER_CLAIM_MS = 1250ms) — otherwise the planner could prefer a
// longer detour to avoid turns. A path of a few hundred turns still sums
// to well under one extra tile.
export const TURN_PENALTY_MS = 1;
// Sentinel for "no incoming direction" (source tile or dock-pair jump).
// Any first step from such a node is treated as straight (no penalty).
export const NO_DIR = -1;

const isForestAt = (x: number, y: number): boolean =>
  landBiomeAt(x, y) === "GRASS" && grassShadeAt(x, y) === "DARK";

export const defaultExpandDurationMsAt = (x: number, y: number): number =>
  isForestAt(x, y) ? FRONTIER_CLAIM_MS * FOREST_FRONTIER_CLAIM_MULT : FRONTIER_CLAIM_MS;

export type ClassifiedTile =
  | { kind: "OWN" }
  | { kind: "NEUTRAL"; durationMs: number }
  | { kind: "ENEMY"; durationMs: number }
  | { kind: "IMPASSABLE" };

export const classifyTile = (
  tile: WaypointPlannerTile | undefined,
  x: number,
  y: number,
  me: string | undefined,
  attackDurationMs: number,
  alliedPlayerIds: ReadonlySet<string>,
  truceTargetIds: ReadonlySet<string>,
  expandDurationMsAt: (x: number, y: number) => number,
  now: number
): ClassifiedTile => {
  // Unexplored tiles return undefined; we cannot plan through them.
  if (!tile) return { kind: "IMPASSABLE" };
  if (tile.terrain !== "LAND") return { kind: "IMPASSABLE" };
  if (tile.ownerId && me && tile.ownerId === me) {
    // Cut-off frontier tiles cannot serve as action origins or as free
    // corridors — treat them as impassable so the planner routes around them.
    if (isFrontierOriginCutOff(tile, now)) return { kind: "IMPASSABLE" };
    return { kind: "OWN" };
  }
  if (!tile.ownerId) return { kind: "NEUTRAL", durationMs: expandDurationMsAt(x, y) };
  if (alliedPlayerIds.has(tile.ownerId)) return { kind: "IMPASSABLE" };
  if (truceTargetIds.has(tile.ownerId)) return { kind: "IMPASSABLE" };
  return { kind: "ENEMY", durationMs: attackDurationMs };
};

export const requiredMusterForTarget = (tile: WaypointPlannerTile | undefined): number => {
  if (!tile || tile.ownerId === "barbarian-1") return BARBARIAN_RAID_COST;
  return requiredMusterForFort(tile.fort?.status === "active" ? tile.fort.variant : undefined);
};

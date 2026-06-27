import {
  ATTACK_MANPOWER_COST,
  ATTACK_MANPOWER_MIN,
  BARBARIAN_RAID_COST,
  COMBAT_LOCK_MS,
  FOREST_FRONTIER_CLAIM_MULT,
  FRONTIER_CLAIM_COST,
  FRONTIER_CLAIM_MS,
  MUSTER_ATTACK_COST,
  MUSTER_SYSTEM_ENABLED,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  grassShadeAt,
  landBiomeAt,
  wrapX,
  wrapY
} from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { isFrontierOriginCutOff } from "../client-tile-menu-status/client-tile-menu-status.js";

export type WaypointAction = "EXPAND" | "ATTACK";

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

export type WaypointBlockReason =
  | "NO_PATH"
  | "TARGET_OWN"
  | "TARGET_BARRIER"
  | "TARGET_UNEXPLORED"
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

export type WaypointPlannerDeps = {
  state: Pick<ClientState, "me" | "tiles" | "dockPairs" | "allies" | "activeTruces">;
  keyFor: (x: number, y: number) => string;
  // Test override; defaults to wall-clock combat lock.
  attackDurationMs?: number;
  // Test override; defaults to forest-aware FRONTIER_CLAIM_MS lookup.
  expandDurationMsAt?: (x: number, y: number) => number;
  // Test override; defaults to Date.now for truce expiry checks.
  now?: number;
};

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
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
const TURN_PENALTY_MS = 1;
// Sentinel for "no incoming direction" (source tile or dock-pair jump).
// Any first step from such a node is treated as straight (no penalty).
const NO_DIR = -1;

const isForestAt = (x: number, y: number): boolean =>
  landBiomeAt(x, y) === "GRASS" && grassShadeAt(x, y) === "DARK";

const defaultExpandDurationMsAt = (x: number, y: number): number =>
  isForestAt(x, y) ? FRONTIER_CLAIM_MS * FOREST_FRONTIER_CLAIM_MULT : FRONTIER_CLAIM_MS;

const chebyshevToroid = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(Math.min(dx, WORLD_WIDTH - dx), Math.min(dy, WORLD_HEIGHT - dy));
};

const worldIndex = (x: number, y: number): number => y * WORLD_WIDTH + x;
const coordFromIndex = (idx: number): { x: number; y: number } => ({
  x: idx % WORLD_WIDTH,
  y: Math.floor(idx / WORLD_WIDTH)
});

type ClassifiedTile =
  | { kind: "OWN" }
  | { kind: "NEUTRAL"; durationMs: number }
  | { kind: "ENEMY"; durationMs: number }
  | { kind: "IMPASSABLE" };

const classifyTile = (
  tile: Tile | undefined,
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

const requiredMusterForTarget = (tile: Tile | undefined): number => {
  if (!tile || tile.ownerId === "barbarian-1") return BARBARIAN_RAID_COST;
  const fortGarrison = tile.fort?.status === "active" && tile.fort.garrison != null ? tile.fort.garrison : 0;
  return Math.max(MUSTER_ATTACK_COST, Math.ceil(fortGarrison));
};

// Min-heap keyed on f-score, with parallel node-index array. Stale
// entries are detected on pop by comparing against the recorded gScore.
class MinHeap {
  private readonly score: number[] = [];
  private readonly node: number[] = [];

  size(): number {
    return this.score.length;
  }

  push(score: number, node: number): void {
    this.score.push(score);
    this.node.push(node);
    let i = this.score.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.score[parent]! <= this.score[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): { score: number; node: number } | undefined {
    if (this.score.length === 0) return undefined;
    const score = this.score[0]!;
    const node = this.node[0]!;
    const tailScore = this.score.pop()!;
    const tailNode = this.node.pop()!;
    if (this.score.length === 0) return { score, node };
    this.score[0] = tailScore;
    this.node[0] = tailNode;
    const n = this.score.length;
    let i = 0;
    while (true) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let smallest = i;
      if (left < n && this.score[left]! < this.score[smallest]!) smallest = left;
      if (right < n && this.score[right]! < this.score[smallest]!) smallest = right;
      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
    return { score, node };
  }

  private swap(i: number, j: number): void {
    [this.score[i], this.score[j]] = [this.score[j]!, this.score[i]!];
    [this.node[i], this.node[j]] = [this.node[j]!, this.node[i]!];
  }
}

const dockPairLinks = (
  state: Pick<ClientState, "dockPairs">
): Map<number, number[]> => {
  const out = new Map<number, number[]>();
  for (const pair of state.dockPairs) {
    const aIdx = worldIndex(pair.ax, pair.ay);
    const bIdx = worldIndex(pair.bx, pair.by);
    const aList = out.get(aIdx) ?? [];
    aList.push(bIdx);
    out.set(aIdx, aList);
    const bList = out.get(bIdx) ?? [];
    bList.push(aIdx);
    out.set(bIdx, bList);
  }
  return out;
};

const truceTargetIdsOf = (
  state: Pick<ClientState, "me" | "activeTruces">,
  now: number
): Set<string> => {
  const out = new Set<string>();
  const me = state.me;
  if (!me) return out;
  const truces = state.activeTruces ?? [];
  for (const truce of truces) {
    if (truce.endsAt && truce.endsAt < now) continue;
    if (truce.otherPlayerId) out.add(truce.otherPlayerId);
  }
  return out;
};

const alliedPlayerIdsOf = (state: Pick<ClientState, "allies">): Set<string> => new Set(state.allies ?? []);

export const planWaypoint = (
  target: { x: number; y: number },
  deps: WaypointPlannerDeps
): WaypointPlan => {
  const { state, keyFor } = deps;
  const attackDurationMs = deps.attackDurationMs ?? COMBAT_LOCK_MS;
  const expandDurationMsAt = deps.expandDurationMsAt ?? defaultExpandDurationMsAt;
  const now = deps.now ?? Date.now();
  const me = state.me;
  const goalX = wrapX(target.x, WORLD_WIDTH);
  const goalY = wrapY(target.y, WORLD_HEIGHT);
  const goalIdx = worldIndex(goalX, goalY);
  const truceTargetIds = truceTargetIdsOf(state, now);

  const blockedPlan = (reason: WaypointBlockReason): WaypointPlan => ({
    target: { x: goalX, y: goalY },
    steps: [],
    totalGold: 0,
    totalManpower: 0,
    totalDurationMs: 0,
    expandCount: 0,
    attackCount: 0,
    reachable: false,
    blockReason: reason
  });

  if (!me) return blockedPlan("NO_OWNED_TERRITORY");

  const goalTile = state.tiles.get(keyFor(goalX, goalY));
  const alliedPlayerIds = alliedPlayerIdsOf(state);
  if (!goalTile) return blockedPlan("TARGET_UNEXPLORED");
  if (goalTile.terrain !== "LAND") return blockedPlan("TARGET_BARRIER");
  if (goalTile.ownerId === me) return blockedPlan("TARGET_OWN");
  if (goalTile.ownerId && alliedPlayerIds.has(goalTile.ownerId)) return blockedPlan("TARGET_ALLIED");
  if (goalTile.ownerId && truceTargetIds.has(goalTile.ownerId)) return blockedPlan("TARGET_TRUCED");

  // Collect sources: all currently-owned land tiles (gScore 0 each).
  // A source remains valid even if fogged — the server may reject the
  // command later, but the planner gives the player the optimistic
  // best-known plan from their territory.
  const sources: number[] = [];
  const preOwned = new Set<number>();
  for (const tile of state.tiles.values()) {
    if (tile.ownerId !== me) continue;
    if (tile.terrain !== "LAND") continue;
    if (isFrontierOriginCutOff(tile, now)) continue;
    const idx = worldIndex(tile.x, tile.y);
    sources.push(idx);
    preOwned.add(idx);
  }
  if (sources.length === 0) return blockedPlan("NO_OWNED_TERRITORY");

  const dockLinks = dockPairLinks(state);
  // Search states are (tile, incoming-direction) pairs, not bare tiles.
  // Direction is an index into NEIGHBOR_OFFSETS, or NO_DIR for source tiles
  // and dock-pair landings. Splitting on direction lets the turn penalty
  // below stay correct: the cheapest way to *reach* a tile depends on which
  // direction you arrived from (a tile entered heading east can continue
  // east for free, but the same tile entered heading north-east cannot),
  // and a scalar per-tile cost cannot capture that.
  const DIR_CODES = NEIGHBOR_OFFSETS.length + 1; // 8 directions + NO_DIR
  const encodeState = (nodeIdx: number, dir: number): number =>
    nodeIdx * DIR_CODES + (dir === NO_DIR ? 0 : dir + 1);
  const nodeOfState = (stateId: number): number => Math.floor(stateId / DIR_CODES);
  const dirOfState = (stateId: number): number => {
    const code = stateId % DIR_CODES;
    return code === 0 ? NO_DIR : code - 1;
  };

  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const viaDock = new Set<number>();
  const heap = new MinHeap();

  const h = (idx: number): number => {
    const { x, y } = coordFromIndex(idx);
    return chebyshevToroid(x, y, goalX, goalY) * FRONTIER_CLAIM_MS;
  };

  for (const src of sources) {
    const startState = encodeState(src, NO_DIR);
    gScore.set(startState, 0);
    heap.push(h(src), startState);
  }

  const maxExpanded = 200_000;
  let expanded = 0;
  let goalState: number | undefined;

  while (heap.size() > 0 && expanded < maxExpanded) {
    const popped = heap.pop()!;
    const currentState = popped.node;
    const current = nodeOfState(currentState);
    const currentG = gScore.get(currentState) ?? Number.POSITIVE_INFINITY;
    if (popped.score > currentG + h(current)) continue;
    if (current === goalIdx) {
      goalState = currentState;
      break;
    }
    expanded += 1;
    const { x: cx, y: cy } = coordFromIndex(current);

    // 8-way neighbors.
    const parentDir = dirOfState(currentState);
    for (let dirIdx = 0; dirIdx < NEIGHBOR_OFFSETS.length; dirIdx += 1) {
      const [dx, dy] = NEIGHBOR_OFFSETS[dirIdx]!;
      const nx = wrapX(cx + dx, WORLD_WIDTH);
      const ny = wrapY(cy + dy, WORLD_HEIGHT);
      const neighborIdx = worldIndex(nx, ny);
      const neighborTile = state.tiles.get(keyFor(nx, ny));
      const classified = classifyTile(neighborTile, nx, ny, me, attackDurationMs, alliedPlayerIds, truceTargetIds, expandDurationMsAt, now);
      if (classified.kind === "IMPASSABLE") continue;
      const baseCost = classified.kind === "OWN" ? 0 : classified.durationMs;
      const turnPenalty = parentDir === NO_DIR || parentDir === dirIdx ? 0 : TURN_PENALTY_MS;
      const tentative = currentG + baseCost + turnPenalty;
      const neighborState = encodeState(neighborIdx, dirIdx);
      const existing = gScore.get(neighborState) ?? Number.POSITIVE_INFINITY;
      if (tentative >= existing) continue;
      gScore.set(neighborState, tentative);
      cameFrom.set(neighborState, currentState);
      // Clear any dock flag a prior iteration recorded for this state,
      // since the cheaper path we just found is an 8-way step.
      viaDock.delete(neighborState);
      heap.push(tentative + h(neighborIdx), neighborState);
    }

    // Dock-pair jumps from owned dock tiles. The jump itself is free;
    // the destination is reached as an owned tile (so its further
    // neighbors are explored via the 8-way pass on the next iteration).
    if (preOwned.has(current)) {
      const links = dockLinks.get(current);
      if (links) {
        for (const destIdx of links) {
          const { x: dxw, y: dyw } = coordFromIndex(destIdx);
          const destTile = state.tiles.get(keyFor(dxw, dyw));
          const classified = classifyTile(destTile, dxw, dyw, me, attackDurationMs, alliedPlayerIds, truceTargetIds, expandDurationMsAt, now);
          if (classified.kind === "IMPASSABLE") continue;
          const stepCost = classified.kind === "OWN" ? 0 : classified.durationMs;
          const tentative = currentG + stepCost;
          const destState = encodeState(destIdx, NO_DIR);
          const existing = gScore.get(destState) ?? Number.POSITIVE_INFINITY;
          if (tentative >= existing) continue;
          gScore.set(destState, tentative);
          cameFrom.set(destState, currentState);
          viaDock.add(destState);
          heap.push(tentative + h(destIdx), destState);
        }
      }
    }
  }

  if (goalState === undefined) return blockedPlan("NO_PATH");

  // Reconstruct path from goal back to the source it entered through.
  // Track both the tile indices (for steps) and the states that produced
  // them (so the dock flag, which is per-state, lines up with each tile).
  const pathIndices: number[] = [];
  const pathStates: number[] = [];
  let cursor: number | undefined = goalState;
  while (cursor !== undefined) {
    pathIndices.push(nodeOfState(cursor));
    pathStates.push(cursor);
    if (preOwned.has(nodeOfState(cursor))) break;
    cursor = cameFrom.get(cursor);
  }
  pathStates.reverse();
  pathIndices.reverse();
  if (pathIndices.length < 2) return blockedPlan("NO_PATH");

  const steps: WaypointStep[] = [];
  let totalGold = 0;
  let totalManpower = 0;
  let totalDurationMs = 0;
  let expandCount = 0;
  let attackCount = 0;
  let firstAttackFromExistingFrontier: boolean | undefined;

  for (let i = 1; i < pathIndices.length; i += 1) {
    const prevIdx = pathIndices[i - 1]!;
    const nextIdx = pathIndices[i]!;
    const prev = coordFromIndex(prevIdx);
    const next = coordFromIndex(nextIdx);
    const nextTile = state.tiles.get(keyFor(next.x, next.y));
    const classified = classifyTile(nextTile, next.x, next.y, me, attackDurationMs, alliedPlayerIds, truceTargetIds, expandDurationMsAt, now);
    if (classified.kind === "OWN" || classified.kind === "IMPASSABLE") {
      // Should not happen — A* never traverses impassable, and own tiles
      // are sources which terminate reconstruction.
      continue;
    }
    const action: WaypointAction = classified.kind === "ENEMY" ? "ATTACK" : "EXPAND";
    const goldCost = FRONTIER_CLAIM_COST;
    const manpowerCost = action === "ATTACK" ? (MUSTER_SYSTEM_ENABLED ? requiredMusterForTarget(nextTile) : ATTACK_MANPOWER_COST) : 0;
    const manpowerMin = action === "ATTACK" ? (MUSTER_SYSTEM_ENABLED ? requiredMusterForTarget(nextTile) : ATTACK_MANPOWER_MIN) : 0;
    const throughFog = Boolean(nextTile?.fogged);
    const step: WaypointStep = {
      origin: prev,
      target: next,
      action,
      durationMs: classified.durationMs,
      goldCost,
      manpowerCost,
      manpowerMin,
      throughFog,
      viaDock: viaDock.has(pathStates[i]!)
    };
    steps.push(step);
    totalGold += goldCost;
    totalManpower += manpowerCost;
    totalDurationMs += classified.durationMs;
    if (action === "ATTACK") {
      attackCount += 1;
      if (firstAttackFromExistingFrontier === undefined) {
        firstAttackFromExistingFrontier = preOwned.has(prevIdx);
      }
    } else {
      expandCount += 1;
    }
  }

  const plan: WaypointPlan = {
    target: { x: goalX, y: goalY },
    steps,
    totalGold,
    totalManpower,
    totalDurationMs,
    expandCount,
    attackCount,
    reachable: true
  };
  if (firstAttackFromExistingFrontier !== undefined) {
    plan.firstAttackFromExistingFrontier = firstAttackFromExistingFrontier;
  }
  return plan;
};

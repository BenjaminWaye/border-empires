import {
  ATTACK_MANPOWER_COST,
  ATTACK_MANPOWER_MIN,
  COMBAT_LOCK_MS,
  FOREST_FRONTIER_CLAIM_MULT,
  FRONTIER_CLAIM_COST,
  FRONTIER_CLAIM_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  grassShadeAt,
  landBiomeAt,
  wrapX,
  wrapY
} from "@border-empires/shared";
import type { ClientState } from "./client-state.js";
import type { Tile } from "./client-types.js";

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
  state: Pick<ClientState, "me" | "tiles" | "dockPairs" | "activeTruces">;
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
  truceTargetIds: ReadonlySet<string>,
  expandDurationMsAt: (x: number, y: number) => number
): ClassifiedTile => {
  // Unexplored tiles return undefined; we cannot plan through them.
  if (!tile) return { kind: "IMPASSABLE" };
  if (tile.terrain !== "LAND") return { kind: "IMPASSABLE" };
  if (tile.ownerId && me && tile.ownerId === me) return { kind: "OWN" };
  if (!tile.ownerId) return { kind: "NEUTRAL", durationMs: expandDurationMsAt(x, y) };
  if (truceTargetIds.has(tile.ownerId)) return { kind: "IMPASSABLE" };
  return { kind: "ENEMY", durationMs: attackDurationMs };
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
  if (!goalTile) return blockedPlan("TARGET_UNEXPLORED");
  if (goalTile.terrain !== "LAND") return blockedPlan("TARGET_BARRIER");
  if (goalTile.ownerId === me) return blockedPlan("TARGET_OWN");
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
    const idx = worldIndex(tile.x, tile.y);
    sources.push(idx);
    preOwned.add(idx);
  }
  if (sources.length === 0) return blockedPlan("NO_OWNED_TERRITORY");

  const dockLinks = dockPairLinks(state);
  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const viaDock = new Set<number>();
  const heap = new MinHeap();

  const h = (idx: number): number => {
    const { x, y } = coordFromIndex(idx);
    return chebyshevToroid(x, y, goalX, goalY) * FRONTIER_CLAIM_MS;
  };

  for (const src of sources) {
    gScore.set(src, 0);
    heap.push(h(src), src);
  }

  const maxExpanded = 200_000;
  let expanded = 0;
  let solved = false;

  while (heap.size() > 0 && expanded < maxExpanded) {
    const popped = heap.pop()!;
    const current = popped.node;
    const currentG = gScore.get(current) ?? Number.POSITIVE_INFINITY;
    if (popped.score > currentG + h(current)) continue;
    if (current === goalIdx) {
      solved = true;
      break;
    }
    expanded += 1;
    const { x: cx, y: cy } = coordFromIndex(current);

    // 8-way neighbors.
    for (const [dx, dy] of NEIGHBOR_OFFSETS) {
      const nx = wrapX(cx + dx, WORLD_WIDTH);
      const ny = wrapY(cy + dy, WORLD_HEIGHT);
      const neighborIdx = worldIndex(nx, ny);
      const neighborTile = state.tiles.get(keyFor(nx, ny));
      const classified = classifyTile(neighborTile, nx, ny, me, attackDurationMs, truceTargetIds, expandDurationMsAt);
      if (classified.kind === "IMPASSABLE") continue;
      const stepCost = classified.kind === "OWN" ? 0 : classified.durationMs;
      const tentative = currentG + stepCost;
      const existing = gScore.get(neighborIdx) ?? Number.POSITIVE_INFINITY;
      if (tentative >= existing) continue;
      gScore.set(neighborIdx, tentative);
      cameFrom.set(neighborIdx, current);
      viaDock.delete(neighborIdx);
      heap.push(tentative + h(neighborIdx), neighborIdx);
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
          const classified = classifyTile(destTile, dxw, dyw, me, attackDurationMs, truceTargetIds, expandDurationMsAt);
          if (classified.kind === "IMPASSABLE") continue;
          const stepCost = classified.kind === "OWN" ? 0 : classified.durationMs;
          const tentative = currentG + stepCost;
          const existing = gScore.get(destIdx) ?? Number.POSITIVE_INFINITY;
          if (tentative >= existing) continue;
          gScore.set(destIdx, tentative);
          cameFrom.set(destIdx, current);
          viaDock.add(destIdx);
          heap.push(tentative + h(destIdx), destIdx);
        }
      }
    }
  }

  if (!solved) return blockedPlan("NO_PATH");

  // Reconstruct path from goal back to the source it entered through.
  const pathIndices: number[] = [];
  let cursor: number | undefined = goalIdx;
  while (cursor !== undefined) {
    pathIndices.push(cursor);
    if (preOwned.has(cursor)) break;
    cursor = cameFrom.get(cursor);
  }
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
    const classified = classifyTile(nextTile, next.x, next.y, me, attackDurationMs, truceTargetIds, expandDurationMsAt);
    if (classified.kind === "OWN" || classified.kind === "IMPASSABLE") {
      // Should not happen — A* never traverses impassable, and own tiles
      // are sources which terminate reconstruction.
      continue;
    }
    const action: WaypointAction = classified.kind === "ENEMY" ? "ATTACK" : "EXPAND";
    const goldCost = FRONTIER_CLAIM_COST;
    const manpowerCost = action === "ATTACK" ? ATTACK_MANPOWER_COST : 0;
    const manpowerMin = action === "ATTACK" ? ATTACK_MANPOWER_MIN : 0;
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
      viaDock: viaDock.has(nextIdx)
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

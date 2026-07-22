import { AUTO_FILL_MAX_REGION_SIZE, AUTO_FILL_NATURAL_BARRIER_MAX_REGION_SIZE, WORLD_WIDTH, WORLD_HEIGHT, wrapX, wrapY } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { simulationTileKey } from "./seed-state/seed-state.js";

const DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

// How long (ms) a scan that failed because it exceeded AUTO_FILL_MAX_REGION_SIZE
// suppresses re-scanning the same origin tile. Auto-fill runs on every SETTLED
// transition (a broad chokepoint), so a lone player expanding into open unowned
// land re-pays the full O(AUTO_FILL_MAX_REGION_SIZE) BFS against the same open
// continent on every single settle — the "broad chokepoint pays an unbounded
// per-event cost" shape flagged in docs/agents/state-and-persistence-discipline.md,
// and the cause of the sim-event-loop spike after auto-fill went always-on (#1031).
//
// CRITICAL: only size-cap failures are cached, never leak failures. A scan
// always runs against the neighbours of a *just-settled wall tile*, and a new
// wall is exactly what can complete a small enclosure — so caching a leak
// failure could skip the very scan that would seal a small pocket, delaying an
// auto-fill and letting interior FRONTIER tiles decay. A size-cap failure is
// safe to cache because a region too large to fill (> AUTO_FILL_MAX_REGION_SIZE)
// cannot drop under the cap from a single settle; shrinking it enough takes far
// longer than this cooldown, over which it is re-scanned anyway.
//
// The caller-owned cooldown map is keyed by tile key, so it is naturally bounded
// by world tile count like tileYieldCollectedAtByTile in runtime.ts, and is a
// pure perf cache (not game state — never snapshotted).
export const AUTO_FILL_SCAN_COOLDOWN_MS = 3000;

export const findEnclosedRegion = (
  originKey: string,
  tiles: ReadonlyMap<string, DomainTileState>,
  enclosingOwnerId: string,
  // Optional out-param: set to true when the scan bailed specifically because the
  // region exceeded AUTO_FILL_MAX_REGION_SIZE (as opposed to leaking to an enemy
  // tile or being an ineligible origin). Used to gate the scan cooldown above.
  outcome?: { hitSizeCap: boolean }
): Set<string> | null => {
  const origin = tiles.get(originKey);
  // The interior we flood is our own FRONTIER or unowned LAND. A SETTLED tile is
  // a wall (not a region member); natural barriers and enemy tiles are leaks.
  if (!origin || origin.terrain !== "LAND") return null;
  if (origin.ownerId && !(origin.ownerId === enclosingOwnerId && origin.ownershipState === "FRONTIER")) return null;

  const region = new Set<string>();
  // FIFO queue backed by an array + head index — avoids the O(n) cost of
  // Array.prototype.shift() on every dequeue (BFS visits up to ~500 tiles).
  const queue: Array<[number, number]> = [[origin.x, origin.y]];
  let head = 0;
  region.add(originKey);
  // Whether any part of the seal is a natural barrier (sea/mountain) rather than
  // the player's own settled territory. Natural-barrier-sealed pockets are held
  // to a much smaller size cap (see the size check below).
  let usedNaturalBarrier = false;

  while (head < queue.length) {
    const [x, y] = queue[head]!;
    head += 1;
    for (const [dx, dy] of DIRECTIONS) {
      // The world is toroidal: neighbours wrap across the x=0/x=WORLD_WIDTH and
      // y=0/y=WORLD_HEIGHT seams, matching every other adjacency module
      // (frontier-topology, encirclement, defensibility). Without this a pocket
      // whose seal straddles the seam is wrongly treated as reaching an open map
      // edge and never auto-fills.
      const nx = wrapX(x + dx, WORLD_WIDTH);
      const ny = wrapY(y + dy, WORLD_HEIGHT);
      const key = simulationTileKey(nx, ny);
      if (region.has(key)) continue;
      const neighbor = tiles.get(key);
      // The enclosing player's own SETTLED tiles are a permanent seal.
      if (neighbor && neighbor.ownerId === enclosingOwnerId && neighbor.ownershipState === "SETTLED") continue;
      // Enemy tiles (any state) aren't ours to claim — leak out.
      if (neighbor && neighbor.ownerId && neighbor.ownerId !== enclosingOwnerId) return null;
      // Our own FRONTIER and unowned LAND are transparent interior — traversed
      // and (for unowned tiles) claimed. FRONTIER is walked through but never
      // seals, since it can still decay back to unowned.
      if (neighbor && neighbor.terrain === "LAND") {
        region.add(key);
        if (region.size > AUTO_FILL_MAX_REGION_SIZE) {
          if (outcome) outcome.hitSizeCap = true;
          return null;
        }
        queue.push([nx, ny]);
        continue;
      }
      // Anything else — sea, coastal sea, mountain, or a missing tile — is a
      // natural barrier that seals the pocket but caps its size.
      usedNaturalBarrier = true;
    }
  }
  // A pocket that leans on natural barriers is only auto-claimed when small; a
  // pocket fully ringed by the player's own settled tiles may be much larger.
  if (usedNaturalBarrier && region.size > AUTO_FILL_NATURAL_BARRIER_MAX_REGION_SIZE) return null;
  return region;
};

// A scan that bails on the size cap (a huge open region) is re-triggered on every
// subsequent settle adjacent to that same open area, each retry re-paying the full
// AUTO_FILL_MAX_REGION_SIZE-bounded BFS even though the region is nowhere near
// fillable. `originCooldownUntil` lets the caller skip re-scanning such an origin
// for a short window (see AUTO_FILL_SCAN_COOLDOWN_MS for why only size-cap failures
// are cached — never leak failures, which must stay eagerly re-scanned so a newly
// completed enclosure is sealed immediately). The cooldown map is keyed by tile key,
// so it's naturally bounded by world size like `tileYieldCollectedAtByTile`, and
// callers must not persist it — it's a pure perf cache, not game state.
export const findEnclosedRegionsAdjacentTo = (
  tile: DomainTileState,
  tiles: ReadonlyMap<string, DomainTileState>,
  ownerId: string,
  options?: {
    now: number;
    cooldownMs: number;
    originCooldownUntil: Map<string, number>;
  }
): Array<Set<string>> => {
  const checkedOrigins = new Set<string>();
  const results: Array<Set<string>> = [];
  for (const [dx, dy] of DIRECTIONS) {
    const nx = wrapX(tile.x + dx, WORLD_WIDTH);
    const ny = wrapY(tile.y + dy, WORLD_HEIGHT);
    const key = simulationTileKey(nx, ny);
    if (checkedOrigins.has(key)) continue;
    if (options && (options.originCooldownUntil.get(key) ?? 0) > options.now) {
      checkedOrigins.add(key);
      continue;
    }
    const outcome = { hitSizeCap: false };
    const region = findEnclosedRegion(key, tiles, ownerId, outcome);
    if (region) {
      for (const k of region) checkedOrigins.add(k);
      results.push(region);
    } else {
      checkedOrigins.add(key);
      // Only size-cap failures are cached; leak failures must stay eagerly
      // re-scanned (see AUTO_FILL_SCAN_COOLDOWN_MS).
      if (options && outcome.hitSizeCap) options.originCooldownUntil.set(key, options.now + options.cooldownMs);
    }
  }
  return results;
};

/**
 * Auto-fill: settle all unowned land pockets — and promote any of `ownerId`'s
 * own FRONTIER tiles inside those pockets to SETTLED — sealed by `ownerId`'s
 * territory adjacent to `capturedTile`. Natural barriers (sea, mountain) count
 * toward the seal, but a pocket that leans on them is capped at
 * AUTO_FILL_NATURAL_BARRIER_MAX_REGION_SIZE; a pocket walled purely by the
 * player's own SETTLED tiles may grow to AUTO_FILL_MAX_REGION_SIZE. Pockets
 * bordering enemy territory are left alone. Returns the newly-settled tiles.
 *
 * `recordYieldAnchors` is invoked once with every newly-settled tile key so the
 * caller can stamp their yield-collection baseline in a single batch, matching
 * the manual settle path (otherwise an auto-filled tile would accrue yield from
 * the player's income anchor rather than from the moment it was settled). It is
 * batched deliberately — per-tile anchor events are a known event-loop hazard
 * (see the TILE_YIELD_ANCHOR_BATCH rationale in runtime.ts).
 */
export const applyAutoFill = (input: {
  capturedTile: DomainTileState;
  ownerId: string;
  tiles: ReadonlyMap<string, DomainTileState>;
  replaceTileState: (key: string, tile: DomainTileState) => void;
  onAutoFillTiles?: ((count: number) => void) | undefined;
  recordYieldAnchors?: ((keys: readonly string[]) => void) | undefined;
  scanCooldown?: {
    now: number;
    cooldownMs: number;
    originCooldownUntil: Map<string, number>;
  };
}): DomainTileState[] => {
  const { capturedTile, ownerId, tiles, replaceTileState, onAutoFillTiles, recordYieldAnchors, scanCooldown } = input;
  const regions = findEnclosedRegionsAdjacentTo(capturedTile, tiles, ownerId, scanCooldown);
  const settled: DomainTileState[] = [];
  const settledKeys: string[] = [];
  for (const region of regions) {
    for (const key of region) {
      const existing = tiles.get(key);
      if (!existing) continue;
      // Claim unowned land, and promote the enclosing player's own FRONTIER
      // tiles inside the sealed pocket to SETTLED — once a pocket is fully
      // walled off it should settle, not remain vulnerable to frontier decay.
      const isUnowned = !existing.ownerId;
      const isOwnFrontier = existing.ownerId === ownerId && existing.ownershipState === "FRONTIER";
      if (!isUnowned && !isOwnFrontier) continue;
      const filledTile: DomainTileState = {
        ...existing,
        ownerId,
        ownershipState: "SETTLED",
        frontierDecayAt: undefined,
        frontierDecayKind: undefined,
      };
      replaceTileState(key, filledTile);
      settledKeys.push(key);
      settled.push(filledTile);
    }
  }
  if (settled.length > 0) {
    onAutoFillTiles?.(settled.length);
    recordYieldAnchors?.(settledKeys);
  }
  return settled;
};

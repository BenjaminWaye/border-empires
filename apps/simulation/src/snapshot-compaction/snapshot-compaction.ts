/**
 * Snapshot compaction (v0 ↔ v1).
 *
 * v0 snapshots store every tile in the world (~200k) with all static and
 * mutable fields. With active AI play this balloons (107 MB observed on
 * staging) and freezes the simulation main thread during every checkpoint.
 *
 * v1 snapshots store only the *mutable overlay* — tiles that differ from
 * what `generateSeasonWorld(rulesetId, worldSeed)` would produce — and omit
 * the static fields (terrain, resource, dockId, shardSite). At load time
 * the worldgen baseline is regenerated and the overlay is merged on top.
 *
 * Tile states the overlay must represent:
 *
 *  - Tile gained mutable state (e.g., AI claimed a tile that worldgen left
 *    empty) → included in overlay with the new fields.
 *  - Tile's mutable state changed (e.g., ownership flipped) → included in
 *    overlay with the new fields.
 *  - Tile lost mutable state that worldgen had assigned (e.g., a seed-owned
 *    AI tile got cleared) → included in overlay with `null` markers for
 *    every field worldgen had set so the merge knows to delete them.
 *
 * Anything that matches the worldgen baseline is omitted entirely.
 */

import type { RecoveredSimulationState } from "../event-recovery/event-recovery.js";
import type {
  SimulationSnapshotPayload,
  SimulationSnapshotSections,
  StoredSnapshotCommandEvents
} from "../snapshot-store/snapshot-store.js";

export const SNAPSHOT_FORMAT_VERSION = 1;

export type RecoveredTile = RecoveredSimulationState["tiles"][number];

const MUTABLE_TILE_FIELDS = [
  "ownerId",
  "ownershipState",
  "town",
  "fort",
  "observatory",
  "siegeOutpost",
  "economicStructure",
  "sabotage",
  // Phase 3 (dormant): Phase 4 writes this unified field in place of the four
  // legacy structure fields above. Including it here ensures the compaction
  // overlay preserves it on round-trip even before Phase 4 activates the reader.
  "structure"
] as const;
type MutableTileField = (typeof MUTABLE_TILE_FIELDS)[number];

/**
 * One row in the v1 overlay. Field semantics:
 *  - present non-null → the runtime tile has this value
 *  - present and null → explicit clear: worldgen had a value here, runtime no longer does
 *  - absent → no change from worldgen
 */
export type V1OverlayTile = {
  x: number;
  y: number;
} & Partial<{
  [K in MutableTileField]: NonNullable<RecoveredTile[K]> | null;
}>;

export type V1SnapshotPayload = {
  formatVersion: typeof SNAPSHOT_FORMAT_VERSION;
  /** Tiles that diverge from the worldgen baseline; all other tiles are implied by worldgen. */
  tileOverlay: V1OverlayTile[];
  /** Everything below is preserved verbatim from the original RecoveredSimulationState. */
  docks?: RecoveredSimulationState["docks"];
  activeLocks: RecoveredSimulationState["activeLocks"];
  season?: RecoveredSimulationState["season"];
  players?: RecoveredSimulationState["players"];
  pendingSettlements?: RecoveredSimulationState["pendingSettlements"];
  tileYieldCollectedAtByTile?: RecoveredSimulationState["tileYieldCollectedAtByTile"];
  playerYieldCollectionEpochByPlayer?: RecoveredSimulationState["playerYieldCollectionEpochByPlayer"];
  commandEvents: StoredSnapshotCommandEvents[];
};

const tileKey = (x: number, y: number): string => `${x},${y}`;

export const buildWorldgenBaselineIndex = (
  baselineTiles: ReadonlyArray<RecoveredTile>
): ReadonlyMap<string, RecoveredTile> => {
  const map = new Map<string, RecoveredTile>();
  for (const tile of baselineTiles) map.set(tileKey(tile.x, tile.y), tile);
  return map;
};

const buildOverlayForTile = (
  current: RecoveredTile,
  baseline: RecoveredTile | undefined
): V1OverlayTile | undefined => {
  const overlay: V1OverlayTile = { x: current.x, y: current.y };
  let hasDiff = false;
  for (const field of MUTABLE_TILE_FIELDS) {
    const currentValue = current[field];
    const baselineValue = baseline?.[field];
    if (currentValue === undefined && baselineValue === undefined) continue;
    if (currentValue === undefined && baselineValue !== undefined) {
      // Worldgen had it, runtime cleared it.
      (overlay as Record<MutableTileField, unknown>)[field] = null;
      hasDiff = true;
      continue;
    }
    if (currentValue !== undefined && baselineValue === undefined) {
      (overlay as Record<MutableTileField, unknown>)[field] = currentValue;
      hasDiff = true;
      continue;
    }
    // Both defined — compare by structural equality.
    if (!structuralEquals(currentValue, baselineValue)) {
      (overlay as Record<MutableTileField, unknown>)[field] = currentValue;
      hasDiff = true;
    }
  }
  return hasDiff ? overlay : undefined;
};

const structuralEquals = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  if (typeof left !== typeof right) return false;
  if (left === null || right === null) return false;
  if (typeof left !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const lKeys = Object.keys(left as object);
  const rKeys = Object.keys(right as object);
  if (lKeys.length !== rKeys.length) return false;
  for (const key of lKeys) {
    if (!structuralEquals((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
};

/** Yield helper injected by callers that run inside the sim main thread. */
export type CompactionYield = () => Promise<void>;

const defaultYieldToEventLoop: CompactionYield = () =>
  new Promise<void>((resolve) => setImmediate(resolve));

// Both compaction loops are O(world-tile-count) (~202,500 on the 450x450
// map). A prior fix made them yield every 2,000 tiles (~101 yields) to avoid
// a single ~100-130ms unyielded block, matching every other step in the
// checkpoint pipeline. That backfired badly in production: staging measured
// one checkpoint stretching to 17-22s wall time (sim_checkpoint_export_ms),
// because each setImmediate yield re-queues behind the AI planner's own tick
// scheduling on this same thread — and that queue-jump wait is UNBOUNDED,
// growing with however much AI-tick backlog happens to be queued at that
// exact moment. A follow-up that only reduced yield count (larger chunks,
// fewer yields) still measured 16.7s once the AI backlog built up over
// sustained uptime — fewer chances to get stuck behind AI ticks is not the
// same as zero chances. A worker thread was tried too, but moving the
// ~202,500-tile sections object across a worker boundary requires a
// structured clone that itself measured 7-9.5s on a realistic shape — worse
// than the problem it solved.
//
// The actual fix: don't yield at all. JS is single-threaded — once this
// synchronous pass starts, NOTHING on this thread (not AI ticks, not gRPC
// handlers) can preempt it until it finishes, which is what makes its cost
// genuinely bounded (~100-130ms, see snapshot-compaction.perf.test.ts) no
// matter how much AI-tick work is already queued. Yielding traded a small,
// bounded cost for an unbounded one under exactly the AI-tick contention this
// runs alongside. YIELD_CHUNK_SIZE stays effectively infinite for any
// realistic world size; `yieldToEventLoop` is left in the signature purely
// so tests can still assert on chunking behavior if the world ever grows
// enough to need it back (with a worker, not setImmediate, next time).
const YIELD_CHUNK_SIZE = Number.MAX_SAFE_INTEGER;

/**
 * Compact a v0-shaped payload into v1 storage form using the worldgen baseline.
 * The returned payload is what gets `JSON.stringify`'d for the snapshot row.
 */
export const compactSnapshotForStorage = async (
  sections: SimulationSnapshotSections,
  baselineIndex: ReadonlyMap<string, RecoveredTile>,
  yieldToEventLoop: CompactionYield = defaultYieldToEventLoop
): Promise<V1SnapshotPayload> => {
  const { initialState, commandEvents } = sections;
  const tileOverlay: V1OverlayTile[] = [];
  const seenKeys = new Set<string>();
  let i = 0;
  for (const tile of initialState.tiles) {
    if (i > 0 && i % YIELD_CHUNK_SIZE === 0) await yieldToEventLoop();
    const key = tileKey(tile.x, tile.y);
    seenKeys.add(key);
    const overlay = buildOverlayForTile(tile, baselineIndex.get(key));
    if (overlay) tileOverlay.push(overlay);
    i += 1;
  }
  // Tiles that exist in worldgen baseline but the runtime no longer tracks at all.
  // Treat them as "fully cleared" — emit null markers for whatever the baseline set.
  i = 0;
  for (const [key, baselineTile] of baselineIndex) {
    if (seenKeys.has(key)) continue;
    if (i > 0 && i % YIELD_CHUNK_SIZE === 0) await yieldToEventLoop();
    const overlay = buildOverlayForTile({ x: baselineTile.x, y: baselineTile.y, terrain: baselineTile.terrain }, baselineTile);
    if (overlay) tileOverlay.push(overlay);
    i += 1;
  }
  return {
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    tileOverlay,
    ...(initialState.docks ? { docks: initialState.docks } : {}),
    activeLocks: initialState.activeLocks,
    ...(initialState.season ? { season: initialState.season } : {}),
    ...(initialState.players ? { players: initialState.players } : {}),
    ...(initialState.pendingSettlements ? { pendingSettlements: initialState.pendingSettlements } : {}),
    ...(initialState.tileYieldCollectedAtByTile
      ? { tileYieldCollectedAtByTile: initialState.tileYieldCollectedAtByTile }
      : {}),
    ...(initialState.playerYieldCollectionEpochByPlayer
      ? { playerYieldCollectionEpochByPlayer: initialState.playerYieldCollectionEpochByPlayer }
      : {}),
    commandEvents
  };
};

const applyOverlayToBaseline = (baseline: RecoveredTile, overlay: V1OverlayTile): RecoveredTile => {
  const merged: RecoveredTile = { ...baseline };
  for (const field of MUTABLE_TILE_FIELDS) {
    if (!(field in overlay)) continue;
    const value = (overlay as Record<MutableTileField, unknown>)[field];
    if (value === null) {
      delete (merged as Record<string, unknown>)[field];
    } else {
      (merged as Record<MutableTileField, unknown>)[field] = value as never;
    }
  }
  return merged;
};

/**
 * Expand a v1 payload (or a v0 payload, untouched) into the v0-shaped
 * `SimulationSnapshotPayload` that the rest of the recovery code consumes.
 */
export const expandSnapshotFromStorage = (
  payload: unknown,
  baselineTiles: ReadonlyArray<RecoveredTile>
): SimulationSnapshotPayload => {
  if (!payload || typeof payload !== "object") {
    throw new Error("expandSnapshotFromStorage: payload is not an object");
  }
  const formatVersion = (payload as { formatVersion?: unknown }).formatVersion;
  if (formatVersion !== SNAPSHOT_FORMAT_VERSION) {
    // v0 / legacy: payload is already in the expected SimulationSnapshotPayload shape.
    return payload as SimulationSnapshotPayload;
  }
  const v1 = payload as V1SnapshotPayload;
  const overlayByKey = new Map<string, V1OverlayTile>();
  for (const overlay of v1.tileOverlay) overlayByKey.set(tileKey(overlay.x, overlay.y), overlay);
  const tiles: RecoveredTile[] = baselineTiles.map((baseline) => {
    const overlay = overlayByKey.get(tileKey(baseline.x, baseline.y));
    return overlay ? applyOverlayToBaseline(baseline, overlay) : baseline;
  });
  return {
    initialState: {
      tiles,
      ...(v1.docks ? { docks: v1.docks } : {}),
      activeLocks: v1.activeLocks,
      ...(v1.season ? { season: v1.season } : {}),
      ...(v1.players ? { players: v1.players } : {}),
      ...(v1.pendingSettlements ? { pendingSettlements: v1.pendingSettlements } : {}),
      ...(v1.tileYieldCollectedAtByTile ? { tileYieldCollectedAtByTile: v1.tileYieldCollectedAtByTile } : {}),
      ...(v1.playerYieldCollectionEpochByPlayer ? { playerYieldCollectionEpochByPlayer: v1.playerYieldCollectionEpochByPlayer } : {})
    },
    commandEvents: v1.commandEvents
  };
};

export const isV1SnapshotPayload = (payload: unknown): payload is V1SnapshotPayload => {
  return (
    !!payload &&
    typeof payload === "object" &&
    (payload as { formatVersion?: unknown }).formatVersion === SNAPSHOT_FORMAT_VERSION
  );
};

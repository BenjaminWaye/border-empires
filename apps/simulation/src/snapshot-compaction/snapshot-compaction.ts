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
// handlers) can preempt it until it finishes, so its cost can't be inflated
// by AI-tick contention the way the yielding version's unbounded queue-jump
// waits were. Yielding traded a self-contained cost for an unbounded one.
// YIELD_CHUNK_SIZE stays effectively infinite for any realistic world size;
// `yieldToEventLoop` is left in the signature purely so tests can still assert
// on chunking behavior if the world ever grows enough to need it back (with a
// worker, not setImmediate, next time).
//
// NOTE on cost: on a cold/unloaded box this pass is ~200ms at 202,500 tiles
// (snapshot-compaction.perf.test.ts). In prod it was measured at ~5s once the
// sim heap sits at its ceiling (867/905 MB) and every allocation here triggers
// GC — the pass is allocation-bound, not iteration-bound. That is why the loop
// below now avoids materialising a 202k-entry seen-Set and skips the reverse
// scan whenever the runtime already covers every baseline tile (the steady
// state): fewer allocations directly shrinks the GC-amplified wall time. The
// forward pass is still O(world) per call, but see `TileOverlayMemo` below:
// the per-tile diff result is memoised by tile object identity across
// checkpoints, so only tiles that actually mutated since the last checkpoint
// pay the `buildOverlayForTile` cost — the rest are a WeakMap hit. That's the
// "incremental overlay maintenance" this comment used to flag as the next
// lever; it's now the default path via `compactSnapshotForStorage`'s
// `tileOverlayMemo` parameter.
const YIELD_CHUNK_SIZE = Number.MAX_SAFE_INTEGER;

/**
 * Per-tile memo of a prior compaction's diff result, keyed by the exact
 * runtime tile object. The runtime's snapshot tile cache (see
 * runtime.ts's `snapshotTileCache`) only creates a NEW tile object when a
 * tile actually mutates (`replaceTileState`) — an unchanged tile keeps the
 * same object reference across checkpoints, since `initialState.tiles`
 * comes straight from that cache's `.values()`. That makes object identity
 * a correct, zero-maintenance signature for "has this tile's diff already
 * been computed": a WeakMap hit means the exact same tile object was seen
 * before and its overlay result (or `null` for "matches baseline, no
 * overlay entry") is still valid; a mutated tile is a new object and always
 * misses. `undefined` from `.get()` means "never seen"; `null` is a real
 * cached "no overlay" result, so it's stored/read explicitly rather than
 * treated as a miss.
 */
export type TileOverlayMemo = WeakMap<RecoveredTile, V1OverlayTile | null>;

/**
 * Compact a v0-shaped payload into v1 storage form using the worldgen baseline.
 * The returned payload is what gets `JSON.stringify`'d for the snapshot row.
 */
export const compactSnapshotForStorage = async (
  sections: SimulationSnapshotSections,
  baselineIndex: ReadonlyMap<string, RecoveredTile>,
  yieldToEventLoop: CompactionYield = defaultYieldToEventLoop,
  tileOverlayMemo?: TileOverlayMemo
): Promise<V1SnapshotPayload> => {
  const { initialState, commandEvents } = sections;
  const tileOverlay: V1OverlayTile[] = [];
  // Track how many DISTINCT baseline keys the runtime still covers. In the
  // steady state the runtime never deletes tiles (there is no `this.tiles.delete`
  // anywhere — worldgen seeds every tile and mutations only change fields in
  // place), so `initialState.tiles` is a superset of the baseline and the
  // "cleared tiles" reverse scan below finds nothing. Building a 202k-entry
  // `Set<string>` of seen keys just to confirm that — on every checkpoint, at
  // the heap ceiling where this whole pass balloons from ~200ms to ~5s of
  // GC-bound synchronous block (prod slow-phase `compact`) — is the bulk of
  // the allocation churn. So count matches cheaply first and only materialise
  // the Set + reverse scan in the (never-in-practice) case where a baseline
  // tile is genuinely missing, which is the only case that can emit an entry.
  let matchedBaselineCount = 0;
  let i = 0;
  for (const tile of initialState.tiles) {
    if (i > 0 && i % YIELD_CHUNK_SIZE === 0) await yieldToEventLoop();
    const baseline = baselineIndex.get(tileKey(tile.x, tile.y));
    if (baseline !== undefined) matchedBaselineCount += 1;
    let overlay: V1OverlayTile | undefined;
    const memoed = tileOverlayMemo?.get(tile);
    if (memoed !== undefined) {
      overlay = memoed ?? undefined;
    } else {
      overlay = buildOverlayForTile(tile, baseline);
      tileOverlayMemo?.set(tile, overlay ?? null);
    }
    if (overlay) tileOverlay.push(overlay);
    i += 1;
  }
  // Only if some baseline tile is unaccounted for could a "fully cleared"
  // overlay entry be needed. matchedBaselineCount counts distinct baseline hits (tile
  // keys are unique within the runtime map), so `< baselineIndex.size` means at
  // least one baseline tile is absent from the runtime — rebuild the seen-set
  // and emit clear markers for the missing tiles. Byte-for-byte identical to
  // the previous unconditional scan; just skipped when it would be a no-op.
  if (matchedBaselineCount < baselineIndex.size) {
    const seenKeys = new Set<string>();
    for (const tile of initialState.tiles) seenKeys.add(tileKey(tile.x, tile.y));
    i = 0;
    for (const [key, baselineTile] of baselineIndex) {
      if (seenKeys.has(key)) continue;
      if (i > 0 && i % YIELD_CHUNK_SIZE === 0) await yieldToEventLoop();
      const overlay = buildOverlayForTile({ x: baselineTile.x, y: baselineTile.y, terrain: baselineTile.terrain }, baselineTile);
      if (overlay) tileOverlay.push(overlay);
      i += 1;
    }
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

import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

/**
 * Persisted form of Runtime.reachBorder (tileKey -> ownerId).
 *
 * The border is history-dependent: when two players' anchors cover the same
 * tile, whoever's anchor claimed it first keeps it while they still defend
 * it. Anchor geometry alone cannot reproduce that, so the border is saved in
 * every snapshot and the changes made after the snapshot are replayed from
 * REACH_BORDER_CHANGED events (see runtime-reach-border-restore.ts).
 *
 * Encoding: one entry per owner, holding that owner's tile indices
 * (`y * TILE_INDEX_STRIDE + x`) sorted ascending and delta-encoded. Border
 * tiles come in contiguous runs, so most deltas are 1 and the JSON costs
 * about 2 bytes per tile instead of ~10 for a quoted "x,y" key. The stride is
 * a fixed constant rather than WORLD_WIDTH so a snapshot never depends on the
 * world size it was written under. Bounded by the world's tile count.
 */
export type ReachBorderSnapshotEntry = { ownerId: string; tiles: number[] };
export type ReachBorderSnapshot = ReachBorderSnapshotEntry[];
export type ReachBorderChange = { tileKey: string; ownerId: string | null };

const TILE_INDEX_STRIDE = 65_536;

/** Parses an "x,y" key into its world grid cell (y * WORLD_WIDTH + x) without allocating; -1 if malformed or off-world. */
const gridCellFromKey = (key: string): number => {
  let x = 0;
  let i = 0;
  for (; i < key.length; i += 1) {
    const code = key.charCodeAt(i);
    if (code === 44) break;
    if (code < 48 || code > 57) return -1;
    x = x * 10 + code - 48;
  }
  if (i === 0 || i >= key.length - 1) return -1;
  let y = 0;
  for (i += 1; i < key.length; i += 1) {
    const code = key.charCodeAt(i);
    if (code < 48 || code > 57) return -1;
    y = y * 10 + code - 48;
  }
  return x < WORLD_WIDTH && y < WORLD_HEIGHT ? y * WORLD_WIDTH + x : -1;
};

/**
 * Runs on the main thread at every checkpoint, so it avoids the obvious
 * per-tile costs: keys are parsed by char code (slice + Number was ~5x
 * slower), and instead of sorting each owner's indices the owners are
 * painted onto a world-sized grid that is then scanned in index order, which
 * yields every owner's tiles already sorted. ~150k border tiles encode in
 * single-digit milliseconds.
 */
export const encodeReachBorder = (border: ReadonlyMap<string, string>): ReachBorderSnapshot => {
  const ownerIds: string[] = [];
  const ownerSlotById = new Map<string, number>();
  // Slot + 1 per tile, 0 = no reach. Uint16 caps owners at 65,535.
  const grid = new Uint16Array(WORLD_WIDTH * WORLD_HEIGHT);
  let lastOwnerId: string | undefined;
  let lastSlot = 0;
  for (const [key, ownerId] of border) {
    const cell = gridCellFromKey(key);
    if (cell < 0) continue;
    if (ownerId !== lastOwnerId) {
      let slot = ownerSlotById.get(ownerId);
      if (slot === undefined) {
        slot = ownerIds.length + 1;
        ownerIds.push(ownerId);
        ownerSlotById.set(ownerId, slot);
      }
      lastOwnerId = ownerId;
      lastSlot = slot;
    }
    grid[cell] = lastSlot;
  }
  const tilesBySlot: number[][] = ownerIds.map(() => []);
  const previousBySlot = new Float64Array(ownerIds.length);
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    const row = y * WORLD_WIDTH;
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      const slot = grid[row + x]!;
      if (slot === 0) continue;
      const index = y * TILE_INDEX_STRIDE + x;
      tilesBySlot[slot - 1]!.push(index - previousBySlot[slot - 1]!);
      previousBySlot[slot - 1] = index;
    }
  }
  return ownerIds
    .map((ownerId, slotIndex) => ({ ownerId, tiles: tilesBySlot[slotIndex]! }))
    .sort((left, right) => (left.ownerId < right.ownerId ? -1 : left.ownerId > right.ownerId ? 1 : 0));
};

export const decodeReachBorder = (snapshot: ReachBorderSnapshot): Map<string, string> => {
  const border = new Map<string, string>();
  for (const { ownerId, tiles } of snapshot) {
    let index = 0;
    for (const delta of tiles) {
      index += delta;
      border.set(`${index % TILE_INDEX_STRIDE},${Math.floor(index / TILE_INDEX_STRIDE)}`, ownerId);
    }
  }
  return border;
};

/** The border diff over `keys` (the only tiles one anchor change can touch). */
export const diffReachBorder = (
  oldBorder: ReadonlyMap<string, string>,
  newBorder: ReadonlyMap<string, string>,
  keys: Iterable<string>
): ReachBorderChange[] => {
  const changes: ReachBorderChange[] = [];
  for (const tileKey of keys) {
    const ownerId = newBorder.get(tileKey);
    if (oldBorder.get(tileKey) !== ownerId) changes.push({ tileKey, ownerId: ownerId ?? null });
  }
  return changes;
};

export const applyReachBorderChanges = (border: Map<string, string>, changes: readonly ReachBorderChange[]): void => {
  for (const { tileKey, ownerId } of changes) {
    if (ownerId) border.set(tileKey, ownerId);
    else border.delete(tileKey);
  }
};

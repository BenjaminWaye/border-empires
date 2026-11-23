/**
 * Encirclement for tiles the reach border just unsettled.
 *
 * When a rival's reach overtakes a SETTLED tile (settleOvertaken in
 * runtime-reach-border-apply.ts) the tile drops to FRONTIER but keeps its
 * owner. That FRONTIER tile may now be cut off from its owner's supply -- the
 * classic case is capturing a town: the town's settled neighbours fall inside
 * the captor's reach, drop to FRONTIER, and sit wrapped in the captor's land.
 * Combat's own encirclement pass only seeds from the captured tile and its
 * eight neighbours, so an unsettled tile two or more steps away was never
 * checked and stayed the loser's FRONTIER inside the captor's lines.
 *
 * Downgrades usually happen inside another tile write (the town capture whose
 * anchor activation overtook them), so they are queued and checked once the
 * outermost write has finished: by then every tile the same activation
 * unsettled is FRONTIER, and the check sees the whole cluster at once. A
 * cut-off tile goes to the player whose reach overtook it when it touches
 * their land (see encirclement-pocket-capture.ts), otherwise to neutral.
 */

export type UnsettleEncirclementContext = {
  applyEncirclement: (changedKeys: string[], playerId: string, commandId: string, options?: { claimantId?: string }) => void;
};

type PendingUnsettle = { ownerId: string; claimantId: string; commandId: string; tileKeys: string[] };

// Bounds a pathological chain of drains re-queueing each other; each pass
// handles every batch queued so far.
const MAX_DRAIN_PASSES = 32;

export const createUnsettleEncirclementQueue = (context: UnsettleEncirclementContext) => {
  let depth = 0;
  let draining = false;
  // ownerId|claimantId|commandId -> batch; bounded by tiles one write unsettles.
  const pending = new Map<string, PendingUnsettle>();

  const drain = (): void => {
    if (draining) return;
    draining = true;
    try {
      for (let pass = 0; pending.size > 0; pass += 1) {
        if (pass >= MAX_DRAIN_PASSES) {
          console.warn(JSON.stringify({ event: "unsettle_encirclement_drain_capped", pending: pending.size }));
          pending.clear();
          break;
        }
        const batches = [...pending.values()];
        pending.clear();
        for (const { ownerId, claimantId, commandId, tileKeys } of batches) {
          context.applyEncirclement(tileKeys, ownerId, commandId, claimantId ? { claimantId } : undefined);
        }
      }
    } finally {
      draining = false;
    }
  };

  /**
   * Notes that `tileKey` (owned by `ownerId`) was just downgraded to FRONTIER
   * because `claimantId`'s reach overtook it ("" when the border was vacated).
   * Checked right away when no tile write is in progress.
   */
  const record = (tileKey: string, ownerId: string, claimantId: string, commandId: string): void => {
    if (!ownerId || ownerId.startsWith("barbarian-")) return;
    const batchKey = `${ownerId}|${claimantId}|${commandId}`;
    const batch = pending.get(batchKey);
    if (batch) batch.tileKeys.push(tileKey);
    else pending.set(batchKey, { ownerId, claimantId, commandId, tileKeys: [tileKey] });
    if (depth === 0) drain();
  };

  /** Runs one tile write; the outermost write checks the queued downgrades afterwards. */
  const write = (apply: () => void): void => {
    depth += 1;
    try {
      apply();
    } finally {
      depth -= 1;
    }
    if (depth === 0) drain();
  };

  return { write, record };
};

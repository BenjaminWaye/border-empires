import { liveReachForOwner, neighborTileKeys, type LandConnectivityQuery, type ReachAnchor } from "@border-empires/shared";

/**
 * Catches SETTLED tiles left stranded by a border change.
 *
 * settleOvertaken (runtime-reach-border-apply.ts) only unsettles the exact
 * tile(s) a rival's anchor just overtook -- it has no notion of what that
 * loss does to the *rest* of the owner's territory. If the overtaken tile
 * was a corridor connecting an owner's own anchor to a pocket of SETTLED
 * ground elsewhere, that pocket falls outside the owner's live reach but
 * nothing ever revisits it: it stays SETTLED indefinitely unless some rival
 * anchor later happens to contest that exact ground.
 *
 * This is a small, bounded flood-fill seeded from the tile(s) that just
 * changed hands, walking outward through the *same* owner's own ground --
 * SETTLED or FRONTIER -- that is NOT in their current live reach, collecting
 * only the SETTLED tiles it finds as stranded. FRONTIER tiles must still be
 * walked THROUGH (not just SETTLED ones): a settled pocket is very often
 * separated from the change by ordinary unsettled-but-owned corridor ground,
 * and stopping the walk at the first FRONTIER tile would miss exactly the
 * pockets this sweep exists to catch. A tile inside live reach is safe
 * ground and acts as a wall -- the walk does not cross it, keeping the sweep
 * local to the actually-affected pocket rather than re-verifying an owner's
 * entire (possibly enormous) territory. Mirrors encirclement.ts's bounded
 * BFS-from-changed-tiles shape and its BFS_CAP safety valve (see
 * ENCIRCLEMENT_BFS_CAP's doc comment) -- exceeding the cap bails out rather
 * than risk an O(territory) walk; the pocket stays SETTLED and the next
 * border change re-triggers detection.
 */
export const STRANDED_SETTLED_SWEEP_BFS_CAP = 10_000;

export type StrandedSweepTileView = {
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
};

export type StrandedSweepResult = {
  strandedTileKeys: string[];
  visitedCount: number;
  capExceeded: boolean;
};

/**
 * Walks outward from `seedKeys` through `ownerId`'s own ground that falls
 * outside `liveReach`, returning every SETTLED tile found along the way (the
 * caller is responsible for actually downgrading them). Seeds themselves are
 * only collected if they meet the same criteria -- callers typically seed
 * with the *neighbors* of a tile that just changed hands, not the changed
 * tile itself (already handled by the caller separately, e.g. settleOvertaken).
 * Accepts multiple seeds from multiple independent events in one call so a
 * caller processing a batch of changes can share one bounded walk instead of
 * running the BFS once per change.
 */
export const findStrandedSettledTiles = (
  seedKeys: Iterable<string>,
  ownerId: string,
  liveReach: ReadonlySet<string>,
  getTile: (tileKey: string) => StrandedSweepTileView | undefined
): StrandedSweepResult => {
  const visited = new Set<string>();
  const queue: string[] = [];
  let capExceeded = false;

  const enqueue = (key: string): void => {
    if (visited.has(key)) return;
    if (visited.size >= STRANDED_SETTLED_SWEEP_BFS_CAP) {
      capExceeded = true;
      return;
    }
    visited.add(key);
    queue.push(key);
  };

  for (const seed of seedKeys) enqueue(seed);

  const strandedTileKeys: string[] = [];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head]!;
    head += 1;
    const tile = getTile(current);
    if (!tile || tile.ownerId !== ownerId) continue; // not this owner's ground -- stop, don't cross into rival/neutral territory
    if (liveReach.has(current)) continue; // still genuinely covered -- safe wall, do not walk past it
    if (tile.ownershipState === "SETTLED") strandedTileKeys.push(current);
    for (const neighborKey of neighborTileKeys(current)) enqueue(neighborKey);
  }

  return { strandedTileKeys, visitedCount: visited.size, capExceeded };
};

/**
 * Runs `findStrandedSettledTiles` and applies its result: downgrades every
 * stranded tile found and logs the outcome. Shared by every ownership-
 * mutation call site that can strand a pocket of an owner's other territory
 * -- currently the border-retraction path (settleOvertaken, in
 * runtime-reach-border-apply.ts) and ATTACK capture (resolveLock, in
 * runtime-lock-resolution.ts) -- so the find-log-downgrade sequence and its
 * log message wording live in exactly one place.
 */
export const runStrandedSweepAndUnsettle = (
  seedKeys: Iterable<string>,
  ownerId: string,
  liveReach: ReadonlySet<string>,
  getTile: (tileKey: string) => StrandedSweepTileView | undefined,
  downgradeToFrontier: (tileKey: string) => void,
  runtimeLogInfo?: (payload: Record<string, unknown>, message: string) => void
): StrandedSweepResult => {
  const sweep = findStrandedSettledTiles(seedKeys, ownerId, liveReach, getTile);
  if (sweep.strandedTileKeys.length > 0) {
    runtimeLogInfo?.(
      { ownerId, strandedCount: sweep.strandedTileKeys.length, visitedCount: sweep.visitedCount },
      "[strandedSettledSweep] unsettled tile(s) stranded by a border retraction"
    );
  }
  if (sweep.capExceeded) {
    runtimeLogInfo?.({ ownerId, visitedCount: sweep.visitedCount }, "[strandedSettledSweep] BFS cap exceeded — skipping detection for this pocket this tick");
  }
  for (const strandedKey of sweep.strandedTileKeys) downgradeToFrontier(strandedKey);
  return sweep;
};

/**
 * Runtime-shaped entry point for `runStrandedSweepAndUnsettle`: takes the
 * runtime's own reach primitives instead of the caller pre-building a
 * live-reach set and a downgrade closure by hand at every call site.
 */
export const runtimeStrandedSettledSweep = (
  deps: {
    gatherReachAnchors: () => ReachAnchor[];
    isLandTileQuery?: LandConnectivityQuery;
    reachBorderApplyContext: () => {
      tileOwnership: (tileKey: string) => StrandedSweepTileView | undefined;
      downgradeToFrontier: (tileKey: string, causeCommandId: string) => void;
      runtimeLogInfo?: (payload: Record<string, unknown>, message: string) => void;
    };
  },
  seedTileKeys: readonly string[],
  ownerId: string,
  causeCommandId: string
): void => {
  const ctx = deps.reachBorderApplyContext();
  runStrandedSweepAndUnsettle(
    seedTileKeys,
    ownerId,
    liveReachForOwner(ownerId, deps.gatherReachAnchors(), deps.isLandTileQuery),
    ctx.tileOwnership,
    (k) => ctx.downgradeToFrontier(k, causeCommandId),
    ctx.runtimeLogInfo
  );
};

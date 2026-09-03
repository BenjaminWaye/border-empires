import { neighborTileKeys } from "@border-empires/shared";

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
 * changed hands, walking outward only through the *same* owner's SETTLED
 * tiles that are NOT in their current live reach. A tile inside live reach
 * is safe ground and acts as a wall -- the walk does not cross it, keeping
 * the sweep local to the actually-affected pocket rather than re-verifying
 * an owner's entire (possibly enormous) settled territory. Mirrors
 * encirclement.ts's bounded BFS-from-changed-tiles shape and its
 * BFS_CAP safety valve (see ENCIRCLEMENT_BFS_CAP's doc comment) --
 * exceeding the cap bails out rather than risk an O(territory) walk;
 * the pocket stays SETTLED and the next border change re-triggers detection.
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
 * Walks outward from `seedKeys` through `ownerId`'s own SETTLED tiles that
 * fall outside `liveReach`, returning every such tile found (the caller is
 * responsible for actually downgrading them). Seeds themselves are only
 * included in the result if they meet the same criteria -- callers typically
 * seed with the *neighbors* of a tile that just changed hands, not the
 * changed tile itself (already handled by settleOvertaken).
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
    if (!tile || tile.ownerId !== ownerId || tile.ownershipState !== "SETTLED") continue;
    if (liveReach.has(current)) continue; // still genuinely covered -- safe wall, do not walk past it
    strandedTileKeys.push(current);
    for (const neighborKey of neighborTileKeys(current)) enqueue(neighborKey);
  }

  return { strandedTileKeys, visitedCount: visited.size, capExceeded };
};

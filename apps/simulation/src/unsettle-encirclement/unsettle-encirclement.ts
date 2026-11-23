/**
 * Settled tiles a capture unsettles, handed to combat's encirclement pass.
 *
 * When a rival's reach overtakes a SETTLED tile (settleOvertaken in
 * runtime-reach-border-apply.ts) the tile drops to FRONTIER but keeps its
 * owner. Capturing a town does this to the loser's settled land around it:
 * the town's reach becomes the captor's. Combat's encirclement pass
 * (runtime-lock-resolution-encirclement.ts) only seeded from the fought-over
 * tile and its eight neighbours, so an unsettled tile two or more steps away
 * -- wrapped in the captor's land and cut off from its owner -- stayed the
 * loser's FRONTIER inside the captor's lines.
 *
 * The runtime runs each lock resolution inside `collect`; the unsettle hook
 * `record`s every downgrade made meanwhile, and combat `take`s the loser's
 * keys as extra seeds for its pass, where a cut-off tile touching the
 * captor's land goes to the captor (encirclement-pocket-capture.ts).
 *
 * Collection is scoped to combat on purpose: the boot-time reach replay and
 * non-combat anchor activations (AFC landings and respawns, structure builds)
 * also unsettle tiles, and handing a player's land to whoever's reach grew
 * over it there is not a rule of the game.
 */
export const createUnsettledTileCollector = () => {
  let depth = 0;
  // ownerId -> unsettled tile keys; bounded by tiles one lock resolution unsettles.
  const byOwner = new Map<string, string[]>();

  /** Runs `apply` (one lock resolution), collecting the downgrades it makes. */
  const collect = (apply: () => void): void => {
    depth += 1;
    try {
      apply();
    } finally {
      depth -= 1;
      if (depth === 0) byOwner.clear();
    }
  };

  /** Notes that `ownerId`'s `tileKey` was just downgraded to FRONTIER. No-op outside `collect`. */
  const record = (tileKey: string, ownerId: string | undefined): void => {
    if (depth === 0 || !ownerId) return;
    const keys = byOwner.get(ownerId);
    if (keys) keys.push(tileKey);
    else byOwner.set(ownerId, [tileKey]);
  };

  /** Returns and forgets the keys collected so far for `ownerId`. */
  const take = (ownerId: string): string[] => {
    const keys = byOwner.get(ownerId) ?? [];
    byOwner.delete(ownerId);
    return keys;
  };

  return { collect, record, take };
};

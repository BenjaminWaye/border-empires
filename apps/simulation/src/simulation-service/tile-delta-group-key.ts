// Group key for the per-subscriber TILE_DELTA_BATCH fanout: subscribers whose
// filtered delta set produces the same key share one proto serialization pass.
//
// The key MUST separate delta variants that share coordinates but serialize
// differently, or one variant's bytes get served to a subscriber who should
// have received the other:
//   - ":r"  terrain-only redacted stub (lock target owned by another player):
//           the ONLY variant with no `ownerId` key at all.
//   - ":c"  broadcast-only ownership-clear stub: carries an `ownerId` key (so
//           it misses ":r") but is minimal + flagged ownershipClearOnly, unlike
//           a full visible delta for the same tile. Without ":c" a non-visible
//           subscriber's clear stub collides with a visible subscriber's full
//           delta and gets served the full content — leaking fog and dropping
//           the ownershipClearOnly flag.
//   - (none) full delta.
export type GroupKeyTileDelta = { x: number; y: number; ownerId?: unknown; ownershipClearOnly?: boolean | undefined };

export const buildTileDeltaGroupKey = (deltas: ReadonlyArray<GroupKeyTileDelta>): string => {
  let key = "";
  let first = true;
  for (const d of deltas) {
    if (!first) key += "|";
    first = false;
    key += `${d.x}:${d.y}`;
    if (!("ownerId" in d)) key += ":r";
    else if (d.ownershipClearOnly) key += ":c";
  }
  return key;
};

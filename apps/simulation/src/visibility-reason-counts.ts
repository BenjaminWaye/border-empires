// Refcounted "why is this tile visible" tags, viewerId -> tileKey -> reason ->
// count, kept in lockstep with VisibilityCoverageCache's coverage refcounts.
// Extracted from visibility-coverage-cache.ts (over the 500-line cap).

export type VisibilityReasonCounts = Map<string, Map<string, Map<string, number>>>;

export const addReasonCount = (reasons: VisibilityReasonCounts, viewerId: string, tileKey: string, reason: string): void => {
  let byTile = reasons.get(viewerId);
  if (!byTile) {
    byTile = new Map();
    reasons.set(viewerId, byTile);
  }
  let byReason = byTile.get(tileKey);
  if (!byReason) {
    byReason = new Map();
    byTile.set(tileKey, byReason);
  }
  byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
};

export const removeReasonCount = (reasons: VisibilityReasonCounts, viewerId: string, tileKey: string, reason: string): void => {
  const byTile = reasons.get(viewerId);
  const byReason = byTile?.get(tileKey);
  if (!byReason) return;
  const next = (byReason.get(reason) ?? 0) - 1;
  if (next <= 0) {
    byReason.delete(reason);
    if (byReason.size === 0) byTile!.delete(tileKey);
    if (byTile!.size === 0) reasons.delete(viewerId);
  } else {
    byReason.set(reason, next);
  }
};

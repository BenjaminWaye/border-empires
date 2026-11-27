// Refcounted "why is this tile visible" tags, viewerId -> tileKey -> reason ->
// count, kept in lockstep with VisibilityCoverageCache's coverage refcounts.
// Extracted from visibility-coverage-cache.ts (over the 500-line cap).
//
// Compact form: almost every covered tile is covered only by the viewer's own
// territory ("radius:self"). Such a tile stores the bare refcount (a small
// integer, no allocation) instead of its own Map; a tile with any other reason
// is promoted to a Map and demoted again when only "radius:self" is left. A
// one-entry Map per covered tile per viewer cost about 185 bytes and was the
// largest growing holder in the 2026-11-28 heap snapshots (34 MB at 43k owned
// tiles, docs/load-results/sim-heap-growth-2026-11-28.md).

export const SELF_VISIBILITY_REASON = "radius:self";

/** A number is the refcount of SELF_VISIBILITY_REASON alone. */
export type TileVisibilityReasons = number | Map<string, number>;
export type VisibilityReasonCounts = Map<string, Map<string, TileVisibilityReasons>>;

const SELF_ONLY: ReadonlySet<string> = new Set([SELF_VISIBILITY_REASON]);

export const addReasonCount = (reasons: VisibilityReasonCounts, viewerId: string, tileKey: string, reason: string): void => {
  let byTile = reasons.get(viewerId);
  if (!byTile) {
    byTile = new Map();
    reasons.set(viewerId, byTile);
  }
  const existing = byTile.get(tileKey);
  if (existing === undefined && reason === SELF_VISIBILITY_REASON) {
    byTile.set(tileKey, 1);
    return;
  }
  if (typeof existing === "number") {
    if (reason === SELF_VISIBILITY_REASON) {
      byTile.set(tileKey, existing + 1);
      return;
    }
    byTile.set(tileKey, new Map([[SELF_VISIBILITY_REASON, existing], [reason, 1]]));
    return;
  }
  const byReason = existing ?? new Map<string, number>();
  if (!existing) byTile.set(tileKey, byReason);
  byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
};

export const removeReasonCount = (reasons: VisibilityReasonCounts, viewerId: string, tileKey: string, reason: string): void => {
  const byTile = reasons.get(viewerId);
  const existing = byTile?.get(tileKey);
  if (existing === undefined) return;
  if (typeof existing === "number") {
    if (reason !== SELF_VISIBILITY_REASON) return;
    if (existing > 1) byTile!.set(tileKey, existing - 1);
    else deleteTile(reasons, viewerId, byTile!, tileKey);
    return;
  }
  const next = (existing.get(reason) ?? 0) - 1;
  if (next > 0) {
    existing.set(reason, next);
    return;
  }
  existing.delete(reason);
  if (existing.size === 0) {
    deleteTile(reasons, viewerId, byTile!, tileKey);
  } else if (existing.size === 1 && existing.has(SELF_VISIBILITY_REASON)) {
    byTile!.set(tileKey, existing.get(SELF_VISIBILITY_REASON)!);
  }
};

export const reasonKeysForTile = (reasons: VisibilityReasonCounts, viewerId: string, tileKey: string): ReadonlySet<string> | undefined => {
  const existing = reasons.get(viewerId)?.get(tileKey);
  if (existing === undefined) return undefined;
  return typeof existing === "number" ? SELF_ONLY : new Set(existing.keys());
};

/** Size gauge: tiles held, and how many of them needed a per-tile Map. */
export const reasonCountStats = (reasons: VisibilityReasonCounts): { tiles: number; mapTiles: number } => {
  let tiles = 0;
  let mapTiles = 0;
  for (const byTile of reasons.values()) {
    tiles += byTile.size;
    for (const value of byTile.values()) if (typeof value !== "number") mapTiles += 1;
  }
  return { tiles, mapTiles };
};

const deleteTile = (reasons: VisibilityReasonCounts, viewerId: string, byTile: Map<string, TileVisibilityReasons>, tileKey: string): void => {
  byTile.delete(tileKey);
  if (byTile.size === 0) reasons.delete(viewerId);
};

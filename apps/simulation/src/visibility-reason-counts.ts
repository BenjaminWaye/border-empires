// Refcounted "why is this tile visible" tags, viewerId -> tileKey -> reason ->
// count, kept in lockstep with VisibilityCoverageCache's coverage refcounts.
// Extracted from visibility-coverage-cache.ts (over the 500-line cap).
//
// Compact storage. This was a Map per covered tile per viewer (about 190
// bytes with its usual two or three tags, e.g. "radius:self" + "reach:self" +
// "relay-beacon"), the largest holder that grows with land in the 2026-11-28
// heap snapshots (44 MB at 46k owned tiles,
// docs/load-results/sim-heap-growth-2026-11-28.md). Now:
// - reason strings are interned to small integer ids, per instance (the tag
//   vocabulary is fixed apart from one "radius:ally:<id>"/"reach:ally:<id>"
//   pair per House, so the table is bounded by the season's roster);
// - a tile tagged only "radius:self" stores its bare refcount;
// - any other tile stores an exact-size flat array of (reasonId, count)
//   pairs, replaced (not grown in place) when a tag is added or dropped.

export const SELF_VISIBILITY_REASON = "radius:self";

/** A number is the refcount of SELF_VISIBILITY_REASON alone; an array is (reasonId, count) pairs. */
type TileReasons = number | number[];

const SELF_ONLY: ReadonlySet<string> = new Set([SELF_VISIBILITY_REASON]);

export class VisibilityReasonCounts {
  private readonly byViewer = new Map<string, Map<string, TileReasons>>();
  private readonly reasonIds = new Map<string, number>();
  private readonly reasonNames: string[] = [];
  private readonly selfId = this.idFor(SELF_VISIBILITY_REASON);

  add(viewerId: string, tileKey: string, reason: string): void {
    let byTile = this.byViewer.get(viewerId);
    if (!byTile) {
      byTile = new Map();
      this.byViewer.set(viewerId, byTile);
    }
    const id = this.idFor(reason);
    const existing = byTile.get(tileKey);
    if (existing === undefined) {
      byTile.set(tileKey, id === this.selfId ? 1 : [id, 1]);
      return;
    }
    if (typeof existing === "number") {
      byTile.set(tileKey, id === this.selfId ? existing + 1 : [this.selfId, existing, id, 1]);
      return;
    }
    for (let i = 0; i < existing.length; i += 2) {
      if (existing[i] === id) {
        existing[i + 1] = existing[i + 1]! + 1;
        return;
      }
    }
    // concat() allocates exactly; push() or a spread literal reserves spare
    // capacity per tile (measured: 2.2x the memory for 180k tiles).
    byTile.set(tileKey, existing.concat(id, 1));
  }

  remove(viewerId: string, tileKey: string, reason: string): void {
    const byTile = this.byViewer.get(viewerId);
    const existing = byTile?.get(tileKey);
    const id = this.reasonIds.get(reason);
    if (!byTile || existing === undefined || id === undefined) return;
    if (typeof existing === "number") {
      if (id !== this.selfId) return;
      if (existing > 1) byTile.set(tileKey, existing - 1);
      else this.deleteTile(viewerId, byTile, tileKey);
      return;
    }
    const at = existing.findIndex((value, index) => index % 2 === 0 && value === id);
    if (at < 0) return;
    if (existing[at + 1]! > 1) {
      existing[at + 1] = existing[at + 1]! - 1;
      return;
    }
    const rest = existing.slice(0, at).concat(existing.slice(at + 2));
    if (rest.length === 0) this.deleteTile(viewerId, byTile, tileKey);
    else if (rest.length === 2 && rest[0] === this.selfId) byTile.set(tileKey, rest[1]!);
    else byTile.set(tileKey, rest);
  }

  reasonsForTile(viewerId: string, tileKey: string): ReadonlySet<string> | undefined {
    const existing = this.byViewer.get(viewerId)?.get(tileKey);
    if (existing === undefined) return undefined;
    if (typeof existing === "number") return SELF_ONLY;
    const names = new Set<string>();
    for (let i = 0; i < existing.length; i += 2) names.add(this.reasonNames[existing[i]!]!);
    return names;
  }

  /** Size gauge: viewers and tiles held, and how many tiles needed a pair array. */
  stats(): { viewers: number; tiles: number; arrayTiles: number; reasonIds: number } {
    let tiles = 0;
    let arrayTiles = 0;
    for (const byTile of this.byViewer.values()) {
      tiles += byTile.size;
      for (const value of byTile.values()) if (typeof value !== "number") arrayTiles += 1;
    }
    return { viewers: this.byViewer.size, tiles, arrayTiles, reasonIds: this.reasonNames.length };
  }

  private idFor(reason: string): number {
    let id = this.reasonIds.get(reason);
    if (id === undefined) {
      id = this.reasonNames.length;
      this.reasonNames.push(reason);
      this.reasonIds.set(reason, id);
    }
    return id;
  }

  private deleteTile(viewerId: string, byTile: Map<string, TileReasons>, tileKey: string): void {
    byTile.delete(tileKey);
    if (byTile.size === 0) this.byViewer.delete(viewerId);
  }
}

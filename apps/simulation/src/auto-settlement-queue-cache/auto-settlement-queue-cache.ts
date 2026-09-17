// Per-player cache policy for the auto-settlement queue (the ordered list of
// a player's FRONTIER tiles eligible for free auto-SETTLE -- see
// orderedAutoSettlementTileKeys). Extracted from runtime.ts's
// autoSettlementQueueForPlayer during the 2026-09-17 prod CPU-throttle
// incident.
//
// Why this exists: the rebuild is O(frontier tiles) with a wide town-support
// ring scan per tile (hasTownSupport -> supportedTownKeysForTile ->
// wideSupportRingScanRadiusFor). A live CPU profile of the sim thread showed
// that chain alone at ~15% of a core, continuously -- on a shared-cpu-1x whose
// sustained budget is 6.25%. One HUMAN player with ~10.5k frontier tiles was
// paying ~10.4k support scans per rebuild to produce a 2-entry queue, and the
// rebuild ran uncached on every emitPlayerStateUpdate (every command, every
// passive-income credit) plus three times per 30s territory-automation tick.
// The previous AI-only coalescing assumed "humans settle far less frequently"
// -- but the rebuild frequency is driven by state updates, not settles.
//
// Policy (same for AI and humans now):
//   - serve the cached queue while the player is not dirty;
//   - a dirty player is rebuilt on the next read, unless the last rebuild was
//     under COALESCE_MS ago (a player auto-expanding several tiles a second
//     would otherwise rebuild on every claim);
//   - MAX_AGE_MS bounds staleness for inputs that don't mark dirty (fog
//     visibility, reach anchors from other players' tiles);
//   - cache hits are re-filtered through isBlocked, which is transient
//     (combat locks, pending settlements) and cheap on the tiny result.
// Mark players dirty from replaceTileState for both the previous and next
// owner of any tile change -- that covers frontier membership, town tier
// changes (hasTownSupport), and own reach anchors.

export type AutoSettlementQueueEntry = { x: number; y: number };

export const AUTO_SETTLEMENT_QUEUE_COALESCE_MS = 5_000;
export const AUTO_SETTLEMENT_QUEUE_MAX_AGE_MS = 60_000;

type CacheEntry = { value: AutoSettlementQueueEntry[]; computedAtMs: number };

export type AutoSettlementQueueCacheStats = {
  hits: number;
  rebuilds: number;
  rebuildMsTotal: number;
};

export class AutoSettlementQueueCache {
  private readonly byPlayer = new Map<string, CacheEntry>();
  private readonly dirty = new Set<string>();
  readonly stats: AutoSettlementQueueCacheStats = { hits: 0, rebuilds: 0, rebuildMsTotal: 0 };

  constructor(
    private readonly now: () => number,
    private readonly coalesceMs = AUTO_SETTLEMENT_QUEUE_COALESCE_MS,
    private readonly maxAgeMs = AUTO_SETTLEMENT_QUEUE_MAX_AGE_MS
  ) {}

  markDirty(playerId: string): void {
    this.dirty.add(playerId);
  }

  forget(playerId: string): void {
    this.byPlayer.delete(playerId);
    this.dirty.delete(playerId);
  }

  isDirty(playerId: string): boolean {
    return this.dirty.has(playerId);
  }

  /** Returns the cached queue when policy allows, else runs `rebuild` and caches it. */
  read(
    playerId: string,
    rebuild: () => AutoSettlementQueueEntry[],
    isBlocked: (tileKey: string) => boolean
  ): AutoSettlementQueueEntry[] {
    const nowMs = this.now();
    const cached = this.byPlayer.get(playerId);
    if (cached) {
      const age = nowMs - cached.computedAtMs;
      const fresh = age < this.maxAgeMs && (!this.dirty.has(playerId) || age < this.coalesceMs);
      if (fresh) {
        this.stats.hits += 1;
        return cached.value.filter((entry) => !isBlocked(`${entry.x},${entry.y}`));
      }
    }
    const startedAt = nowMs;
    const value = rebuild();
    this.stats.rebuilds += 1;
    this.stats.rebuildMsTotal += this.now() - startedAt;
    this.byPlayer.set(playerId, { value, computedAtMs: nowMs });
    this.dirty.delete(playerId);
    return value;
  }
}

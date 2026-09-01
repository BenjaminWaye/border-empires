/**
 * §5.4: a resource tile gained or lost anywhere in a player's territory can
 * push one of their Relay Beacons/Siege Outposts or their Observatory into
 * or out of dormancy without that structure's own tile changing at all, so
 * reconcileOutpostVisionBonus/reconcileObservatoryVisionBonus (which only
 * ever look at the one tile that just mutated) can't catch it.
 *
 * Deliberately NOT resolved eagerly inside replaceTileState: dormancy comes
 * from resourceSlotDormancyForPlayer, which refreshEconomyCachesForTileChange
 * already deletes (for human players) on *every* settled-tile mutation of an
 * owner, regardless of whether that mutation could plausibly touch a
 * FOOD/TITANIUM/CRYSTAL/UMBRITE total — including tickMuster, which calls
 * replaceTileState in tight per-tile loops with no emitPlayerStateUpdate in
 * between (the one place that would otherwise naturally coalesce a
 * rebuild). Eagerly resyncing on every replaceTileState call would turn one
 * 30s muster tick into an O(mutated tiles ×
 * settled tiles) dormancy-rebuild storm for any player who owns one of these
 * structures — exactly the class of O(territory)-per-tick cost
 * tickTerritoryAutomation's own indexes were built to avoid. So the runtime
 * only marks the owner dirty here (an O(1) Set add); the actual resync is
 * flushed lazily, once per player, from emitPlayerStateUpdate (the
 * command-driven path) and from the end of tickTerritoryAutomation (the
 * tick-driven path).
 *
 * Relay Beacon/Siege Outpost and Observatory share this one dirty-flag/flush
 * pair rather than each carrying its own — same underlying trigger, so one
 * per-player Set add and one lazy flush covers both.
 */
export class StructureVisionDormancyTracker {
  private readonly dirtyPlayerIds = new Set<string>();

  /** Marks `playerId` dirty, but only if `hasTrackedStructure()` says they actually own one of these structures — a no-op player never needs a flush. */
  markDirty(playerId: string | undefined, hasTrackedStructure: () => boolean): void {
    if (!playerId || !hasTrackedStructure()) return;
    this.dirtyPlayerIds.add(playerId);
  }

  /** Resolves a pending resync for one player, if one is pending. Cheap no-op when nothing was marked dirty for them. */
  flush(playerId: string | undefined, resync: () => void): void {
    if (!playerId || !this.dirtyPlayerIds.delete(playerId)) return;
    resync();
  }

  /** Resolves every pending resync at once (end of a tick sweep) — one resync per dirty player, not per tile mutation. */
  flushAll(resync: (playerId: string) => void): void {
    if (this.dirtyPlayerIds.size === 0) return;
    for (const playerId of [...this.dirtyPlayerIds]) {
      this.dirtyPlayerIds.delete(playerId);
      resync(playerId);
    }
  }
}

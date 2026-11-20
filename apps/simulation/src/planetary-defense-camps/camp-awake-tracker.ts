// Which Planetary Defense camps are awake (docs/planetary-defense-camps-plan.md,
// rule 7): a camp acts only while a watcher can see at least one of its tiles.
// A watcher is an AI player (always on) or a human with the game open.
//
// Event-driven, no per-second scan: each camp keeps a count of (watcher, tile)
// pairs in view, adjusted only when
//   - a watcher's coverage of a tile crosses 0↔1 (VisibilityCoverageCache's
//     onCoverageEdge, the two places coverage changes),
//   - a tile joins or leaves a camp (PlanetaryDefenseCampIndex listener),
//   - a player starts or stops being a watcher (`syncWatchers`, polled by the
//     runtime's 1s side tick; it compares the player list, not tiles).
// The counts are derived and rebuilt on boot (`recount`); `verify` re-derives
// them and reports drift so a missed edge shows up as a counter, not a silent
// sleeping camp.
export type CampAwakeTrackerDeps = {
  /** Every player id that could be a watcher (never Planetary Defense). */
  readonly candidateWatcherIds: () => Iterable<string>;
  /** AI players always count; humans count while they have the game open. */
  readonly isWatcherNow: (playerId: string) => boolean;
  readonly isVisible: (viewerId: string, tileKey: string) => boolean;
  readonly campOf: (tileKey: string) => string | undefined;
  readonly memberTileKeys: () => Iterable<string>;
};

export class PlanetaryDefenseCampAwakeTracker {
  private readonly deps: CampAwakeTrackerDeps;
  private readonly watchers = new Set<string>();
  private readonly seenByCamp = new Map<string, number>();
  private driftCount = 0;

  constructor(deps: CampAwakeTrackerDeps) {
    this.deps = deps;
  }

  onCoverageEdge(viewerId: string, tileKey: string, entered: boolean): void {
    if (!this.watchers.has(viewerId)) return;
    const campId = this.deps.campOf(tileKey);
    if (campId) this.adjust(campId, entered ? 1 : -1);
  }

  onTileJoined(tileKey: string, campId: string): void {
    this.adjust(campId, this.watchersSeeing(tileKey));
  }

  onTileLeft(tileKey: string, campId: string): void {
    this.adjust(campId, -this.watchersSeeing(tileKey));
  }

  /** Bring the watcher set up to date; cheap when nobody logged in or out. */
  syncWatchers(): void {
    const current = new Set<string>();
    for (const id of this.deps.candidateWatcherIds()) if (this.deps.isWatcherNow(id)) current.add(id);
    for (const id of [...this.watchers]) {
      if (current.has(id)) continue;
      this.applyWatcher(id, -1);
      this.watchers.delete(id);
    }
    for (const id of current) {
      if (this.watchers.has(id)) continue;
      this.watchers.add(id);
      this.applyWatcher(id, 1);
    }
  }

  /** Rebuild every count from scratch (boot, after the camp index is rebuilt). */
  recount(): void {
    this.seenByCamp.clear();
    for (const [campId, count] of this.derive()) this.seenByCamp.set(campId, count);
  }

  /** Re-derive the counts; on any mismatch fix them and return how many camps drifted. */
  verify(): number {
    const derived = this.derive();
    let drifted = 0;
    for (const campId of new Set([...derived.keys(), ...this.seenByCamp.keys()])) {
      if ((derived.get(campId) ?? 0) !== (this.seenByCamp.get(campId) ?? 0)) drifted += 1;
    }
    if (drifted > 0) {
      this.driftCount += drifted;
      this.recount();
    }
    return drifted;
  }

  isAwake(campId: string): boolean {
    return (this.seenByCamp.get(campId) ?? 0) > 0;
  }

  awakeCampIds(): string[] {
    const awake: string[] = [];
    for (const [campId, count] of this.seenByCamp) if (count > 0) awake.push(campId);
    return awake;
  }

  sizes(): { trackedCamps: number; watchers: number; driftTotal: number } {
    return { trackedCamps: this.seenByCamp.size, watchers: this.watchers.size, driftTotal: this.driftCount };
  }

  private derive(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const tileKey of this.deps.memberTileKeys()) {
      const campId = this.deps.campOf(tileKey);
      const seen = campId ? this.watchersSeeing(tileKey) : 0;
      if (campId && seen > 0) counts.set(campId, (counts.get(campId) ?? 0) + seen);
    }
    return counts;
  }

  private applyWatcher(viewerId: string, sign: 1 | -1): void {
    for (const tileKey of this.deps.memberTileKeys()) {
      if (!this.deps.isVisible(viewerId, tileKey)) continue;
      const campId = this.deps.campOf(tileKey);
      if (campId) this.adjust(campId, sign);
    }
  }

  private watchersSeeing(tileKey: string): number {
    let seen = 0;
    for (const id of this.watchers) if (this.deps.isVisible(id, tileKey)) seen += 1;
    return seen;
  }

  private adjust(campId: string, delta: number): void {
    if (delta === 0) return;
    const next = (this.seenByCamp.get(campId) ?? 0) + delta;
    if (next > 0) this.seenByCamp.set(campId, next);
    else this.seenByCamp.delete(campId);
  }
}

// Planetary Defense camps on the simulation main thread
// (docs/planetary-defense-camps-plan.md): the camp index, which camps are
// awake, and collapsing land cut off from its camp. Kept out of runtime.ts
// (over the 500-line cap); the runtime feeds it tile writes, coverage edges and
// its 1s side tick, and reads camp counts and awake camps back.
import type { DomainTileState } from "@border-empires/game-domain";
import { PlanetaryDefenseCampAwakeTracker } from "./camp-awake-tracker.js";
import { PlanetaryDefenseCampIndex } from "./camp-index.js";
import type { PlanetaryDefensePlannerSnapshot } from "../ai/system-job-barbarian-planner.js";
import { createRuntimeBarbarianBridge, type RuntimeBarbarianBridge } from "../runtime-barbarian-planner-bridge.js";
import { migrateLegacyPlanetaryDefenseTiles } from "./camp-migration.js";
import { releasedPlanetaryDefenseTile } from "./camp-rules.js";
import { campTilesCutOff } from "./camp-supply.js";
import { forEachFrontierNeighbor } from "../frontier-topology.js";
import { simulationTileKey } from "../seed-state/seed-state.js";

// Re-derive the awake counts this often and count any drift (a missed edge).
const AWAKE_VERIFY_INTERVAL_MS = 5 * 60_000;
// A camp whose cut-off land is locked in a fight is retried; this many passes
// per drain, so one drain can never loop.
const MAX_DRAIN_PASSES = 3;

export type PlanetaryDefenseCampsDeps = {
  readonly tiles: () => ReadonlyMap<string, DomainTileState>;
  readonly dockLinksByDockTileKey: () => ReadonlyMap<string, readonly string[]>;
  /** Every non-Planetary-Defense player id. */
  readonly candidateWatcherIds: () => Iterable<string>;
  /** AI players always; humans while they have the game open. */
  readonly isWatcherNow: (playerId: string) => boolean;
  readonly isVisible: (viewerId: string, tileKey: string) => boolean;
  /** True while a fight holds `tileKey` (as origin or target): its land is left alone until it resolves. */
  readonly isLocked: (tileKey: string) => boolean;
  readonly replaceTileState: (tileKey: string, tile: DomainTileState, commandId: string) => void;
  /** Broadcasts and records changed Planetary Defense tiles (collapse, boot conversion). */
  readonly emitTiles: (commandId: string, tiles: readonly DomainTileState[]) => void;
  readonly now: () => number;
  /** Defers a drain to after the current synchronous work (queueMicrotask in production). */
  readonly defer?: (task: () => void) => void;
  readonly logInfo?: (payload: Record<string, unknown>, message: string) => void;
};

export class PlanetaryDefenseCamps {
  private readonly deps: PlanetaryDefenseCampsDeps;
  private readonly index = new PlanetaryDefenseCampIndex();
  private readonly awake: PlanetaryDefenseCampAwakeTracker;
  private draining = false;
  private drainScheduled = false;
  private lastVerifyAt = 0;
  private releasedTotal = 0;
  // The first watcher sync is deferred to first use: it asks who has the game
  // open, which must never run while the runtime (and the service's
  // subscription registry) is still being constructed.
  private watchersSynced = false;
  // Tiles the boot conversion changed, emitted (and so persisted) on the first tick.
  private pendingMigrationKeys: readonly string[] = [];
  private neighbourChanged: ((campId: string) => void) | undefined;
  private bridge: RuntimeBarbarianBridge | undefined;
  // Planner state from the snapshot, held until the planner is first created.
  private restoredPlanner: PlanetaryDefensePlannerSnapshot | undefined;

  constructor(deps: PlanetaryDefenseCampsDeps) {
    this.deps = deps;
    this.awake = new PlanetaryDefenseCampAwakeTracker({
      candidateWatcherIds: deps.candidateWatcherIds,
      isWatcherNow: deps.isWatcherNow,
      isVisible: deps.isVisible,
      campOf: (tileKey) => this.index.campOf(tileKey),
      memberTileKeys: () => this.index.memberTileKeys()
    });
    this.index.setListener({
      onTileJoined: (tileKey, campId) => this.awake.onTileJoined(tileKey, campId),
      onTileLeft: (tileKey, campId) => this.awake.onTileLeft(tileKey, campId)
    });
  }

  /** Every tile write (Runtime.replaceTileState). `ownerChanged` wakes camps next to it (planner). */
  onTileWrite(tileKey: string, next: DomainTileState, ownerChanged: boolean): void {
    if (this.index.onTileWrite(tileKey, next) && !this.draining) this.scheduleDrain();
    if (!ownerChanged || !this.neighbourChanged) return;
    const notify = this.neighbourChanged;
    forEachFrontierNeighbor(next.x, next.y, (nx, ny) => {
      const campId = this.index.campOf(simulationTileKey(nx, ny));
      if (campId) notify(campId);
    });
  }

  /** The planner's wake-up for a camp next to a tile that changed owner (one listener). */
  onCampNeighbourChanged(listener: (campId: string) => void): void {
    this.neighbourChanged = listener;
  }

  /** The main-thread Planetary Defense planner (runtime-barbarian-planner-bridge.ts), created on first use. */
  planner(): RuntimeBarbarianBridge {
    return this.bridge ??= createRuntimeBarbarianBridge({
      tiles: this.deps.tiles(),
      dockLinksByDockTileKey: this.deps.dockLinksByDockTileKey,
      liveCampIds: () => this.liveCampIds(),
      campTileKeys: (campId) => this.campTileKeys(campId),
      awakeCampIds: () => this.awakeCampIds(),
      onCampNeighbourChanged: (listener) => this.onCampNeighbourChanged(listener),
      now: this.deps.now
    }, this.restoredPlanner);
  }

  /** Boot: the planner state saved in the snapshot (camp rest, raid counts). */
  restorePlannerState(snapshot: PlanetaryDefensePlannerSnapshot | undefined): void {
    this.restoredPlanner = snapshot;
  }

  exportPlannerState(): PlanetaryDefensePlannerSnapshot | undefined {
    return this.bridge ? this.bridge.exportState() : this.restoredPlanner;
  }

  /** VisibilityCoverageCache 0↔1 edges. */
  readonly onCoverageEdge = (viewerId: string, tileKey: string, entered: boolean): void => {
    this.awake.onCoverageEdge(viewerId, tileKey, entered);
  };

  /**
   * Boot: convert pre-camp Planetary Defense land in place (camp-migration.ts),
   * then index the hydrated tiles. Call `bootVision` once coverage is seeded.
   */
  bootTiles(tiles: Map<string, DomainTileState>): void {
    const migrated = migrateLegacyPlanetaryDefenseTiles(tiles);
    if (migrated.changedKeys.length > 0) {
      const { changedKeys, ...counts } = migrated;
      this.deps.logInfo?.({ type: "pd_camp_migration", ...counts }, "converted pre-camp Planetary Defense land into camps");
      this.pendingMigrationKeys = changedKeys;
    }
    this.index.rebuild(tiles);
  }

  /** Boot, once coverage is seeded: the counts are rebuilt on first use (see `watchersSynced`). */
  bootVision(): void {
    this.watchersSynced = false;
  }

  /** 1s side tick: watchers who came or went, retries, periodic drift check. */
  tick(nowMs: number): void {
    this.emitMigration(nowMs);
    this.syncWatchers();
    if (this.index.hasDirtyCamps()) this.drain(`pd-camp-collapse:${nowMs}`);
    if (nowMs - this.lastVerifyAt >= AWAKE_VERIFY_INTERVAL_MS) {
      this.lastVerifyAt = nowMs;
      this.awake.verify();
    }
  }

  campCount(): number {
    return this.index.campCount();
  }

  campOf(tileKey: string): string | undefined {
    return this.index.campOf(tileKey);
  }

  liveCampIds(): ReadonlySet<string> {
    return this.index.liveCamps();
  }

  campTileKeys(campId: string): ReadonlySet<string> {
    return this.index.tilesOf(campId);
  }

  awakeCampIds(): string[] {
    this.ensureWatchersSynced();
    return this.awake.awakeCampIds();
  }

  isAwake(campId: string): boolean {
    this.ensureWatchersSynced();
    return this.awake.isAwake(campId);
  }

  sizes(): { camps: number; tiles: number; dirtyCamps: number; awakeCamps: number; watchers: number; awakeDriftTotal: number; releasedTotal: number } {
    const index = this.index.sizes();
    const awake = this.awake.sizes();
    return { ...index, awakeCamps: this.awake.awakeCampIds().length, watchers: awake.watchers, awakeDriftTotal: awake.driftTotal, releasedTotal: this.releasedTotal };
  }

  /** Release every tile cut off from its camp. Land held by a fight is retried on a later tick. */
  drain(commandId: string): void {
    if (this.draining) return;
    this.draining = true;
    const retry = new Set<string>();
    try {
      for (let pass = 0; pass < MAX_DRAIN_PASSES && this.index.hasDirtyCamps(); pass += 1) {
        for (const campId of this.index.takeDirtyCamps()) this.collapse(campId, commandId, retry);
      }
    } finally {
      this.draining = false;
      for (const campId of retry) this.index.markDirty(campId);
    }
  }

  private collapse(campId: string, commandId: string, retry: Set<string>): void {
    const tiles = this.deps.tiles();
    const cutOff = campTilesCutOff({ campId, members: this.index.tilesOf(campId), tiles, dockLinksByDockTileKey: this.deps.dockLinksByDockTileKey() });
    const released: DomainTileState[] = [];
    for (const tileKey of cutOff) {
      const tile = tiles.get(tileKey);
      if (!tile) continue;
      if (this.deps.isLocked(tileKey)) {
        retry.add(campId);
        continue;
      }
      const next = releasedPlanetaryDefenseTile(tile);
      this.deps.replaceTileState(tileKey, next, commandId);
      released.push(next);
    }
    this.releasedTotal += released.length;
    if (released.length > 0) this.deps.emitTiles(commandId, released);
  }

  private emitMigration(nowMs: number): void {
    if (this.pendingMigrationKeys.length === 0) return;
    const tiles = this.deps.tiles();
    const changed = this.pendingMigrationKeys.flatMap((key) => {
      const tile = tiles.get(key);
      return tile ? [tile] : [];
    });
    this.pendingMigrationKeys = [];
    if (changed.length > 0) this.deps.emitTiles(`pd-camp-migration:${nowMs}`, changed);
  }

  private ensureWatchersSynced(): void {
    if (!this.watchersSynced) this.syncWatchers();
  }

  private syncWatchers(): void {
    this.awake.syncWatchers();
    if (this.watchersSynced) return;
    this.watchersSynced = true;
    this.awake.recount();
  }

  private scheduleDrain(): void {
    if (this.drainScheduled) return;
    this.drainScheduled = true;
    (this.deps.defer ?? queueMicrotask)(() => {
      this.drainScheduled = false;
      this.drain(`pd-camp-collapse:${this.deps.now()}`);
    });
  }
}

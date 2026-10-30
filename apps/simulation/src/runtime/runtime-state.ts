import type { DomainTileState } from "@border-empires/game-domain";
import { buildDockLandingIndex, type DockLandingIndex } from "@border-empires/shared";
import type { DockRouteDefinition } from "../dock-network/dock-network.js";
import type { RuntimePlayer } from "../runtime-types.js";
import type { VisibilityCoverageTracker } from "../visibility-coverage-cache.js";
import { CombatLockIndex } from "../combat-lock-index/combat-lock-index.js";

/**
 * Stage 7 of the SimulationRuntime god-class breakup: a plain data holder for
 * the core shared world-state fields that used to live directly on
 * SimulationRuntime. This is pure indirection (zero behavior change) — it
 * exists so future subsystem classes (Stage 8) have something shared to hold
 * a reference to instead of `this`. Fields are constructed up front by
 * SimulationRuntime's constructor and never reassigned afterward; the Maps
 * themselves are still mutated in place by the existing runtime logic.
 *
 * Fields are added to this class incrementally, one small commit at a time
 * (see Stage 7 process notes) rather than all at once.
 */
export class RuntimeState {
  readonly players: Map<string, RuntimePlayer>;
  readonly tiles: Map<string, DomainTileState>;
  readonly docks: DockRouteDefinition[];
  readonly dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  readonly dockNetworkComponentByTileKey: ReadonlyMap<string, ReadonlySet<string>>;
  // Beach-landing ground and sea-lane supply edges (packages/shared
  // dock-landing). Derived from the dock links and the world's water, both
  // fixed after worldgen, so it is built once here and never rebuilt.
  readonly dockLanding: DockLandingIndex;
  readonly locksByTile: CombatLockIndex;
  readonly visibilityCoverage: VisibilityCoverageTracker;

  constructor(init: {
    players: Map<string, RuntimePlayer>;
    tiles: Map<string, DomainTileState>;
    docks: DockRouteDefinition[];
    dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
    dockNetworkComponentByTileKey: ReadonlyMap<string, ReadonlySet<string>>;
    locksByTile: CombatLockIndex;
    visibilityCoverage: VisibilityCoverageTracker;
  }) {
    this.players = init.players;
    this.tiles = init.tiles;
    this.docks = init.docks;
    this.dockLinksByDockTileKey = init.dockLinksByDockTileKey;
    this.dockNetworkComponentByTileKey = init.dockNetworkComponentByTileKey;
    this.dockLanding = buildDockLandingIndex(init.dockLinksByDockTileKey, (x, y) => init.tiles.get(`${x},${y}`)?.terrain);
    this.locksByTile = init.locksByTile;
    this.visibilityCoverage = init.visibilityCoverage;
  }
}

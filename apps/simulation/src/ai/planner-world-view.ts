import type { DomainStrategicResourceKey, DomainTileState } from "@border-empires/game-domain";
import type { EconomicStructureType, Terrain } from "@border-empires/shared";
import type { PlannerOwnedStructureCounts } from "./planner-owned-structure-counts.js";

/**
 * Serializable world-view snapshot passed to AI and system worker threads via
 * postMessage. Contains only the data needed for planning.
 */

// ─── Tile view ────────────────────────────────────────────────────────────────

export type PlannerTileView = {
  x: number;
  y: number;
  terrain: Terrain;
  resource?: DomainTileState["resource"];
  dockId?: string;
  ownerId?: string;
  ownershipState?: DomainTileState["ownershipState"];
  /** Minimal town info needed to score settlement priority. */
  town?: {
    supportMax?: number;
    supportCurrent?: number;
    type?: "MARKET" | "FARMING";
    name?: string;
    populationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
  } | null;
  fort?: { ownerId?: string; status?: string } | null;
  observatory?: { ownerId?: string; status?: string } | null;
  siegeOutpost?: { ownerId?: string; status?: string } | null;
  economicStructure?: { ownerId?: string; type?: EconomicStructureType; status?: string } | null;
};

export type PlannerDockView = {
  dockId: string;
  tileKey: string;
  pairedDockId: string;
  connectedDockIds?: readonly string[];
};

// ─── Per-player view ──────────────────────────────────────────────────────────

export type PlannerPlayerView = {
  id: string;
  points: number;
  manpower: number;
  techIds?: string[];
  domainIds?: string[];
  strategicResources?: Partial<Record<DomainStrategicResourceKey, number>>;
  settledTileCount?: number;
  townCount?: number;
  incomePerMinute?: number;
  /** Bumped whenever territory/frontier/pending-settlement key sets change. */
  tileCollectionVersion: number;
  /**
   * Bumped only when tile *ownership* changes (EXPAND, ATTACK, tile loss).
   * Building placements, tech updates, and ownershipState transitions do NOT
   * bump this version, so planner-sync-scope.ts skips the O(territory×25)
   * relevance rebuild for non-topology mutations.
   */
  topologyVersion: number;
  /**
   * Tile keys whose ownership changed for this player since the last
   * syncPlayers call. Drained on export — empty between syncs.
   *
   * replacePlayers uses these to apply the relevance rebuild incrementally
   * (O(delta×650)) instead of rebuilding from scratch (O(territory×25)).
   * Empty at steady state → 0ms rebuild.
   */
  topologyDirtyTileKeys: string[];
  /** Whether this player currently holds any combat lock (origin or target). */
  hasActiveLock: boolean;
  territoryTileKeys: string[];
  frontierTileKeys: string[];
  hotFrontierTileKeys: string[];
  strategicFrontierTileKeys: string[];
  buildCandidateTileKeys: string[];
  /** tileKeys of in-progress settle commands (don't double-settle). */
  pendingSettlementTileKeys: string[];
  activeDevelopmentProcessCount: number;
  ownedStructureCounts?: PlannerOwnedStructureCounts;
  /**
   * Nearest high-value neutral or enemy tile to this player's territory.
   * Computed on the main thread from the beacon index; passed to the worker
   * to guide directional expansion toward distant objectives.
   */
  expansionObjective?: { x: number; y: number; kind: "neutral_value" | "enemy" };
  /** Number of active muster flags this player currently has placed. */
  activeMusterCount?: number;
  /** Total owned tiles (territoryTileKeys.length = settled + frontier). */
  ownedTileCount: number;
  /** Total frontier tiles (frontierTileKeys.length). */
  frontierTileCount: number;
};

// ─── World view ───────────────────────────────────────────────────────────────

export type PlannerWorldView = {
  /** Tile slice scoped around players currently being planned. */
  tiles: PlannerTileView[];
  /** Dock-route metadata needed for cross-island frontier planning. */
  docks?: PlannerDockView[];
  /** One entry per player that needs planning in this tick. */
  players: PlannerPlayerView[];
};

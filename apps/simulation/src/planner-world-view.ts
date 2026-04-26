import type { DomainStrategicResourceKey, DomainTileState } from "@border-empires/game-domain";
import type { EconomicStructureType } from "@border-empires/shared";

/**
 * Serializable world-view snapshot passed to AI and system worker threads via
 * postMessage. Contains only the data needed for planning.
 */

// ─── Tile view ────────────────────────────────────────────────────────────────

export type PlannerTileView = {
  x: number;
  y: number;
  terrain: "LAND" | "SEA" | "MOUNTAIN";
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
  strategicResources?: Partial<Record<DomainStrategicResourceKey, number>>;
  settledTileCount?: number;
  townCount?: number;
  incomePerMinute?: number;
  /** Bumped whenever territory/frontier/pending-settlement key sets change. */
  tileCollectionVersion: number;
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

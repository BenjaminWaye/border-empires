/**
 * Serializable world-view snapshot passed to AI and system worker threads via
 * postMessage. Contains only the data needed for planning.
 */

// ─── Tile view ────────────────────────────────────────────────────────────────

export type PlannerTileView = {
  x: number;
  y: number;
  terrain: "LAND" | "SEA" | "MOUNTAIN";
  resource?: string;
  dockId?: string;
  ownerId?: string;
  ownershipState?: string;
  /** Minimal town info needed to score settlement priority. */
  town?: { supportMax?: number; supportCurrent?: number } | null;
};

// ─── Per-player view ──────────────────────────────────────────────────────────

export type PlannerPlayerView = {
  id: string;
  points: number;
  manpower: number;
  /** Whether this player currently holds any combat lock (origin or target). */
  hasActiveLock: boolean;
  territoryTileKeys: string[];
  frontierTileKeys: string[];
  /** tileKeys of in-progress settle commands (don't double-settle). */
  pendingSettlementTileKeys: string[];
  activeDevelopmentProcessCount: number;
};

// ─── World view ───────────────────────────────────────────────────────────────

export type PlannerWorldView = {
  /** Tile slice scoped around players currently being planned. */
  tiles: PlannerTileView[];
  /** One entry per player that needs planning in this tick. */
  players: PlannerPlayerView[];
};

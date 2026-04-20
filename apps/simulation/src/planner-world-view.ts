/**
 * Serializable world-view snapshot passed to AI and system worker threads via
 * postMessage. Contains only the data needed for planning — not the full runtime
 * state — so the main thread can build it quickly and the worker can operate on
 * it without holding any runtime references.
 */

import type { SimulationRuntime } from "./runtime.js";

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
  /** All tiles — used to rebuild the Map<tileKey, PlannerTileView> in the worker. */
  tiles: PlannerTileView[];
  /** One entry per player that needs planning in this tick. */
  players: PlannerPlayerView[];
};

// ─── Builder ──────────────────────────────────────────────────────────────────

type RuntimeState = ReturnType<SimulationRuntime["exportState"]>;

/**
 * Build a serializable PlannerWorldView from the runtime's exportState() output.
 * Called on the main thread; must be fast (no heavy computation).
 */
export const buildPlannerWorldView = (
  state: RuntimeState,
  playerIds: string[]
): PlannerWorldView => {
  const lockPlayerIds = new Set(state.activeLocks.map((l) => l.playerId));

  // Build a lightweight tile array (omit heavy JSON blobs — worker only needs
  // the fields used by frontier-command-planner and ai-settlement-priority).
  const tiles: PlannerTileView[] = state.tiles.map((t): PlannerTileView => {
    const base: PlannerTileView = { x: t.x, y: t.y, terrain: t.terrain };
    if (t.resource) base.resource = t.resource;
    if (t.dockId) base.dockId = t.dockId;
    if (t.ownerId) base.ownerId = t.ownerId;
    if (t.ownershipState) base.ownershipState = t.ownershipState;
    if (t.townJson) {
      try {
        const parsed = JSON.parse(t.townJson) as Record<string, unknown>;
        base.town = {
          ...(typeof parsed.supportMax === "number" ? { supportMax: parsed.supportMax } : {}),
          ...(typeof parsed.supportCurrent === "number" ? { supportCurrent: parsed.supportCurrent } : {})
        };
      } catch {
        base.town = null;
      }
    }
    return base;
  });

  const playerMap = new Map(state.players.map((p) => [p.id, p]));

  const players: PlannerPlayerView[] = playerIds.flatMap((id) => {
    const p = playerMap.get(id);
    if (!p) return [];
    return [
      {
        id: p.id,
        points: p.points,
        manpower: p.manpower,
        hasActiveLock: lockPlayerIds.has(id),
        territoryTileKeys: p.territoryTileKeys,
        frontierTileKeys: [],         // populated below from tile scan
        pendingSettlementTileKeys: [], // populated below
        activeDevelopmentProcessCount: 0 // populated below
      } satisfies PlannerPlayerView
    ];
  });

  // Derive frontier tile keys from tile ownership state (cheaper than a
  // separate runtime call, and the worker doesn't have access to summaries).
  const frontierByPlayer = new Map<string, string[]>();
  for (const tile of state.tiles) {
    if (tile.ownershipState === "FRONTIER" && tile.ownerId) {
      let keys = frontierByPlayer.get(tile.ownerId);
      if (!keys) {
        keys = [];
        frontierByPlayer.set(tile.ownerId, keys);
      }
      keys.push(`${tile.x},${tile.y}`);
    }
  }

  // Derive pending settlements from activeLocks (SETTLE locks)
  // and from pendingSettlements list on exportState.
  const pendingSettlementsByPlayer = new Map<string, string[]>();
  for (const settlement of state.pendingSettlements) {
    const existing = pendingSettlementsByPlayer.get(settlement.ownerId) ?? [];
    existing.push(settlement.tileKey);
    pendingSettlementsByPlayer.set(settlement.ownerId, existing);
  }

  for (const player of players) {
    player.frontierTileKeys = frontierByPlayer.get(player.id) ?? [];
    player.pendingSettlementTileKeys = pendingSettlementsByPlayer.get(player.id) ?? [];
    player.activeDevelopmentProcessCount = player.pendingSettlementTileKeys.length;
  }

  return { tiles, players };
};

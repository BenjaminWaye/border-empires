/**
 * AI planner worker thread.
 *
 * Runs inside a Node.js Worker so that planning computation never blocks the
 * main simulation event loop. The worker keeps planner state in-memory and is
 * updated incrementally via player/tile deltas.
 *
 * Message protocol (main → worker):
 *   { type: "init"; worldView: PlannerWorldView }
 *   { type: "sync_players"; players: PlannerPlayerView[] }
 *   { type: "tile_deltas"; tileDeltas: SimulationTileDelta[] }
 *   { type: "plan"; playerId: string; clientSeq: number; issuedAt: number;
 *     sessionPrefix: "ai-runtime" }
 *   { type: "pause" }
 *   { type: "resume" }
 *   { type: "shutdown" }
 *
 * Message protocol (worker → main):
 *   { type: "command"; playerId: string; command: CommandEnvelope | null;
 *     diagnostic?: AutomationPlannerDiagnostic }
 *   { type: "ready" }
 */

import { parentPort } from "node:worker_threads";
import type { EconomicStructureType } from "@border-empires/shared";
import {
  createAutomationNoopDiagnostic,
  planAutomationCommand
} from "./automation-command-planner.js";
import type { AutomationPlannerDiagnostic } from "./automation-command-planner.js";
import { buildDockLinksByDockTileKey, type DockRouteDefinition } from "./dock-network.js";
import type { PlannerPlayerView, PlannerWorldView, PlannerTileView } from "./planner-world-view.js";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

if (!parentPort) throw new Error("ai-planner-worker must run inside a Worker thread");

let paused = false;
const tilesByKey = new Map<string, PlannerTileView>();
let dockLinksByDockTileKey = new Map<string, readonly string[]>();
const playersById = new Map<string, PlannerPlayerView>();
const playerTileCacheById = new Map<string, {
  tileCollectionVersion: number;
  ownedTiles: PlannerTileView[];
  frontierTiles: PlannerTileView[];
  hotFrontierTiles: PlannerTileView[];
  strategicFrontierTiles: PlannerTileView[];
  buildCandidateTiles: PlannerTileView[];
  pendingSettlementTileKeys: Set<string>;
}>();

type SimulationTileDelta = {
  x: number;
  y: number;
  terrain?: "LAND" | "SEA" | "MOUNTAIN" | undefined;
  resource?: string | undefined;
  dockId?: string | undefined;
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  townJson?: string | undefined;
  fortJson?: string | undefined;
  observatoryJson?: string | undefined;
  siegeOutpostJson?: string | undefined;
  economicStructureJson?: string | undefined;
};

const parseTownSupport = (
  townJson: string | undefined
): PlannerTileView["town"] | undefined => {
  if (typeof townJson !== "string") return undefined;
  try {
    const parsed = JSON.parse(townJson) as {
      supportMax?: unknown;
      supportCurrent?: unknown;
      type?: unknown;
      name?: unknown;
      populationTier?: unknown;
    };
    return {
      ...(typeof parsed.supportMax === "number" ? { supportMax: parsed.supportMax } : {}),
      ...(typeof parsed.supportCurrent === "number" ? { supportCurrent: parsed.supportCurrent } : {}),
      ...(parsed.type === "MARKET" || parsed.type === "FARMING" ? { type: parsed.type } : {}),
      ...(typeof parsed.name === "string" ? { name: parsed.name } : {}),
      ...(parsed.populationTier === "SETTLEMENT" ||
      parsed.populationTier === "TOWN" ||
      parsed.populationTier === "CITY" ||
      parsed.populationTier === "GREAT_CITY" ||
      parsed.populationTier === "METROPOLIS"
        ? { populationTier: parsed.populationTier }
        : {})
    };
  } catch {
    return undefined;
  }
};

const parseOwnedStructure = (
  raw: string | undefined
): { ownerId?: string; status?: string; type?: string } | undefined => {
  if (typeof raw !== "string") return undefined;
  try {
    const parsed = JSON.parse(raw) as { ownerId?: unknown; status?: unknown; type?: unknown };
    return {
      ...(typeof parsed.ownerId === "string" ? { ownerId: parsed.ownerId } : {}),
      ...(typeof parsed.status === "string" ? { status: parsed.status } : {}),
      ...(typeof parsed.type === "string" ? { type: parsed.type } : {})
    };
  } catch {
    return undefined;
  }
};

const parseEconomicStructure = (
  raw: string | undefined
): { ownerId?: string; status?: string; type?: EconomicStructureType } | undefined => {
  const parsed = parseOwnedStructure(raw);
  if (!parsed) return undefined;
  return {
    ...(parsed.ownerId ? { ownerId: parsed.ownerId } : {}),
    ...(parsed.status ? { status: parsed.status } : {}),
    ...(parsed.type ? { type: parsed.type as EconomicStructureType } : {})
  };
};

const applyTileDelta = (delta: SimulationTileDelta): void => {
  const key = `${delta.x},${delta.y}`;
  const existing = tilesByKey.get(key);
  const terrain = delta.terrain ?? existing?.terrain;
  if (!terrain) return;
  const next: PlannerTileView = existing ?? { x: delta.x, y: delta.y, terrain };

  if (delta.terrain) next.terrain = delta.terrain;
  if ("resource" in delta) {
    if (delta.resource) next.resource = delta.resource as PlannerTileView["resource"];
    else delete next.resource;
  }
  if ("dockId" in delta) {
    if (delta.dockId) next.dockId = delta.dockId;
    else delete next.dockId;
  }
  if ("ownerId" in delta) {
    if (delta.ownerId) next.ownerId = delta.ownerId;
    else delete next.ownerId;
  }
  if ("ownershipState" in delta) {
    if (delta.ownershipState) next.ownershipState = delta.ownershipState as PlannerTileView["ownershipState"];
    else delete next.ownershipState;
  }
  if ("townJson" in delta) {
    const town = parseTownSupport(delta.townJson);
    if (town) next.town = town;
    else delete next.town;
  }
  if ("fortJson" in delta) {
    const fort = parseOwnedStructure(delta.fortJson);
    if (fort) next.fort = fort;
    else delete next.fort;
  }
  if ("observatoryJson" in delta) {
    const observatory = parseOwnedStructure(delta.observatoryJson);
    if (observatory) next.observatory = observatory;
    else delete next.observatory;
  }
  if ("siegeOutpostJson" in delta) {
    const siegeOutpost = parseOwnedStructure(delta.siegeOutpostJson);
    if (siegeOutpost) next.siegeOutpost = siegeOutpost;
    else delete next.siegeOutpost;
  }
  if ("economicStructureJson" in delta) {
    const economicStructure = parseEconomicStructure(delta.economicStructureJson);
    if (economicStructure) next.economicStructure = economicStructure;
    else delete next.economicStructure;
  }

  tilesByKey.set(key, next);
};

const resolvePlayerTiles = (
  player: PlannerPlayerView
): {
  ownedTiles: PlannerTileView[];
  frontierTiles: PlannerTileView[];
  hotFrontierTiles: PlannerTileView[];
  strategicFrontierTiles: PlannerTileView[];
  buildCandidateTiles: PlannerTileView[];
  pendingSettlementTileKeys: Set<string>;
} => {
  const cached = playerTileCacheById.get(player.id);
  if (cached && cached.tileCollectionVersion === player.tileCollectionVersion) {
    return {
      ownedTiles: cached.ownedTiles,
      frontierTiles: cached.frontierTiles,
      hotFrontierTiles: cached.hotFrontierTiles,
      strategicFrontierTiles: cached.strategicFrontierTiles,
      buildCandidateTiles: cached.buildCandidateTiles,
      pendingSettlementTileKeys: cached.pendingSettlementTileKeys
    };
  }

  const ownedTiles = player.territoryTileKeys
    .map((k) => tilesByKey.get(k))
    .filter((t): t is PlannerTileView => t !== undefined);
  const frontierTiles = player.frontierTileKeys
    .map((k) => tilesByKey.get(k))
    .filter((t): t is PlannerTileView => t !== undefined);
  const hotFrontierTiles = player.hotFrontierTileKeys
    .map((k) => tilesByKey.get(k))
    .filter((t): t is PlannerTileView => t !== undefined);
  const strategicFrontierTiles = player.strategicFrontierTileKeys
    .map((k) => tilesByKey.get(k))
    .filter((t): t is PlannerTileView => t !== undefined);
  const buildCandidateTiles = player.buildCandidateTileKeys
    .map((k) => tilesByKey.get(k))
    .filter((t): t is PlannerTileView => t !== undefined);
  const pendingSettlementTileKeys = new Set(player.pendingSettlementTileKeys);

  playerTileCacheById.set(player.id, {
    tileCollectionVersion: player.tileCollectionVersion,
    ownedTiles,
    frontierTiles,
    hotFrontierTiles,
    strategicFrontierTiles,
    buildCandidateTiles,
    pendingSettlementTileKeys
  });
  return { ownedTiles, frontierTiles, hotFrontierTiles, strategicFrontierTiles, buildCandidateTiles, pendingSettlementTileKeys };
};

// ─── Planning logic ───────────────────────────────────────────────────────────

const choosePlannerCommand = (
  playerId: string,
  clientSeq: number,
  issuedAt: number
): { command: CommandEnvelope | null; diagnostic: AutomationPlannerDiagnostic } => {
  const player = playersById.get(playerId);
  if (!player) {
    return {
      command: null,
      diagnostic: createAutomationNoopDiagnostic(playerId, "ai-runtime", "player_missing")
    };
  }
  const { frontierTiles, ownedTiles, hotFrontierTiles, strategicFrontierTiles, buildCandidateTiles, pendingSettlementTileKeys } = resolvePlayerTiles(player);
  const plan = planAutomationCommand({
    playerId,
    points: player.points,
    manpower: player.manpower,
    ...(player.techIds ? { techIds: player.techIds } : {}),
    ...(player.strategicResources ? { strategicResources: player.strategicResources } : {}),
    ...(typeof player.settledTileCount === "number" ? { settledTileCount: player.settledTileCount } : {}),
    ...(typeof player.townCount === "number" ? { townCount: player.townCount } : {}),
    ...(typeof player.incomePerMinute === "number" ? { incomePerMinute: player.incomePerMinute } : {}),
    hasActiveLock: player.hasActiveLock,
    activeDevelopmentProcessCount: player.activeDevelopmentProcessCount,
    frontierTiles,
    hotFrontierTiles,
    strategicFrontierTiles,
    buildCandidateTiles,
    ownedTiles,
    tilesByKey,
    dockLinksByDockTileKey,
    isPendingSettlement: (tile) => pendingSettlementTileKeys.has(`${tile.x},${tile.y}`),
    clientSeq,
    issuedAt,
    sessionPrefix: "ai-runtime"
  });
  return {
    command: plan.command ?? null,
    diagnostic: plan.diagnostic
  };
};

// ─── Message handler ──────────────────────────────────────────────────────────

parentPort.on("message", (msg: unknown) => {
  if (!msg || typeof msg !== "object") return;
  const message = msg as Record<string, unknown>;

  switch (message.type) {
    case "pause":
      paused = true;
      break;

    case "resume":
      paused = false;
      break;

    case "shutdown":
      process.exit(0);
      break;

    case "plan": {
      if (paused) {
        parentPort!.postMessage({ type: "command", playerId: message.playerId, command: null });
        break;
      }
      try {
        const plan = choosePlannerCommand(
          message.playerId as string,
          message.clientSeq as number,
          message.issuedAt as number
        );
        parentPort!.postMessage({ type: "command", playerId: message.playerId, command: plan.command, diagnostic: plan.diagnostic });
      } catch (err) {
        parentPort!.postMessage({
          type: "error",
          playerId: message.playerId,
          message: err instanceof Error ? err.message : String(err)
        });
      }
      break;
    }

    case "init": {
      const worldView = message.worldView as PlannerWorldView;
      tilesByKey.clear();
      playersById.clear();
      playerTileCacheById.clear();
      for (const tile of worldView.tiles) {
        tilesByKey.set(`${tile.x},${tile.y}`, tile);
      }
      dockLinksByDockTileKey = buildDockLinksByDockTileKey((worldView.docks ?? []) as DockRouteDefinition[]);
      for (const player of worldView.players) {
        playersById.set(player.id, player);
      }
      break;
    }

    case "sync_players": {
      const players = (message.players as PlannerPlayerView[]) ?? [];
      for (const player of players) {
        const cached = playerTileCacheById.get(player.id);
        if (cached && cached.tileCollectionVersion !== player.tileCollectionVersion) {
          playerTileCacheById.delete(player.id);
        }
        playersById.set(player.id, player);
      }
      break;
    }

    case "tile_deltas": {
      const tileDeltas = (message.tileDeltas as SimulationTileDelta[]) ?? [];
      for (const tileDelta of tileDeltas) {
        applyTileDelta(tileDelta);
      }
      break;
    }
  }
});

parentPort.postMessage({ type: "ready" });

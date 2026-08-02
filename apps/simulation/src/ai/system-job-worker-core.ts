/**
 * System job worker core — the actual barbarian/truce/upkeep planning logic
 * that used to run directly inside system-job-worker.ts's top-level
 * `parentPort` handler.
 *
 * Extracted so the SAME logic can run either:
 *  - standalone, inside its own dedicated Worker (system-job-worker.ts —
 *    still used as the default/fallback path and by every existing test), or
 *  - multiplexed alongside the AI planner core inside a single shared Worker
 *    (combined-producer-worker.ts — the P3 thread-consolidation path).
 *
 * IMPORTANT: no scheduling/gating/decision logic changes here — this is a
 * mechanical extraction. `post` replaces the old direct `parentPort!.postMessage`
 * call so the caller controls message shape (e.g. adding a `channel` tag).
 */

import {
  ATTACK_MANPOWER_MIN,
  EXPAND_MANPOWER_COST,
  FRONTIER_CLAIM_COST,
  SETTLE_COST,
  type Terrain
} from "@border-empires/shared";
import { buildDockLinksByDockTileKey, type DockRouteDefinition } from "../dock-network/dock-network.js";
import { chooseNextOwnedFrontierCommandFromLookup } from "./frontier-command-planner.js";
import { BARBARIAN_PLAYER_ID, createBarbarianPlanner } from "./system-job-barbarian-planner.js";
import type { PlannerPlayerView, PlannerWorldView, PlannerTileView } from "./planner-world-view.js";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

type SimulationTileDelta = {
  x: number;
  y: number;
  terrain?: Terrain | undefined;
  resource?: string | undefined;
  dockId?: string | undefined;
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  townJson?: string | undefined;
};

export const createSystemJobWorkerCore = (post: (msg: Record<string, unknown>) => void) => {
  let paused = false;
  const tilesByKey = new Map<string, PlannerTileView>();
  let dockLinksByDockTileKey = new Map<string, readonly string[]>();
  const playersById = new Map<string, PlannerPlayerView>();
  const playerTileCacheById = new Map<string, {
    tileCollectionVersion: number;
    ownedTiles: PlannerTileView[];
  }>();

  // Union of tile keys currently inside at least one non-barb player's fog.
  // Computed and shipped by the main process via `vision_union` — this core
  // is a passive consumer because it does not receive non-barb player views.
  let visibleToAnyNonBarbPlayer: ReadonlySet<string> = new Set();

  const parseTownSupport = (
    townJson: string | undefined
  ): PlannerTileView["town"] | undefined => {
    if (typeof townJson !== "string") return undefined;
    try {
      const parsed = JSON.parse(townJson) as { supportMax?: unknown; supportCurrent?: unknown };
      return {
        ...(typeof parsed.supportMax === "number" ? { supportMax: parsed.supportMax } : {}),
        ...(typeof parsed.supportCurrent === "number" ? { supportCurrent: parsed.supportCurrent } : {})
      };
    } catch {
      return undefined;
    }
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

    tilesByKey.set(key, next);
  };

  const resolveOwnedTiles = (player: PlannerPlayerView): PlannerTileView[] => {
    const cached = playerTileCacheById.get(player.id);
    if (cached && cached.tileCollectionVersion === player.tileCollectionVersion) {
      return cached.ownedTiles;
    }
    const ownedTiles = player.territoryTileKeys
      .map((k) => tilesByKey.get(k))
      .filter((t): t is PlannerTileView => t !== undefined);
    playerTileCacheById.set(player.id, {
      tileCollectionVersion: player.tileCollectionVersion,
      ownedTiles
    });
    return ownedTiles;
  };

  const barbarianPlanner = createBarbarianPlanner({
    tilesByKey,
    resolveOwnedTiles,
    // dockLinksByDockTileKey is replaced on every `init` — read it fresh per plan.
    getDockLinksByDockTileKey: () => dockLinksByDockTileKey,
    getVisibleToAnyNonBarbPlayer: () => visibleToAnyNonBarbPlayer
  });

  const chooseSystemCommand = (
    playerId: string,
    clientSeq: number,
    issuedAt: number
  ): CommandEnvelope | null => {
    const player = playersById.get(playerId);
    if (!player) return null;
    if (player.hasActiveLock) return null;

    if (playerId === BARBARIAN_PLAYER_ID) {
      return barbarianPlanner.choose(player, clientSeq, issuedAt);
    }

    const ownedTiles = resolveOwnedTiles(player);

    const canAttack = player.points >= FRONTIER_CLAIM_COST && player.manpower >= ATTACK_MANPOWER_MIN;
    const canExpand = player.points >= SETTLE_COST && player.manpower >= EXPAND_MANPOWER_COST;

    if (!canAttack && !canExpand) return null;

    return chooseNextOwnedFrontierCommandFromLookup(
      tilesByKey,
      ownedTiles,
      playerId,
      clientSeq,
      issuedAt,
      "system-runtime",
      { canAttack, canExpand, dockLinksByDockTileKey }
    ) ?? null;
  };

  const handleMessage = (msg: unknown): void => {
    if (!msg || typeof msg !== "object") return;
    const message = msg as Record<string, unknown>;

    switch (message.type) {
      case "pause":
        paused = true;
        break;

      case "resume":
        paused = false;
        break;

      case "plan": {
        if (paused) {
          post({ type: "command", playerId: message.playerId, command: null });
          break;
        }
        try {
          const command = chooseSystemCommand(
            message.playerId as string,
            message.clientSeq as number,
            message.issuedAt as number
          );
          post({ type: "command", playerId: message.playerId, command });
        } catch (err) {
          post({
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
        visibleToAnyNonBarbPlayer = new Set();
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

      case "vision_union": {
        const keys = (message.keys as string[]) ?? [];
        visibleToAnyNonBarbPlayer = new Set(keys);
        break;
      }
    }
  };

  return {
    handleMessage,
    // No async cleanup needed today (unlike the AI core's training-recorder
    // flush), but kept for interface symmetry with ai-planner-worker-core.
    shutdown: (): Promise<void> => Promise.resolve()
  };
};

export type SystemJobWorkerCore = ReturnType<typeof createSystemJobWorkerCore>;

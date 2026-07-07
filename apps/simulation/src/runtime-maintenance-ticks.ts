import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";
import type { LockRecord, RuntimePlayer, SimulationTileWireDelta } from "./runtime-types.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";

type TrackSync = <T>(
  phase: string,
  details: Record<string, string | number | boolean | null> | undefined,
  task: () => T
) => T;

export async function tickTileShedding(input: {
  nowMs: number;
  players: ReadonlyMap<string, RuntimePlayer>;
  tiles: ReadonlyMap<string, DomainTileState>;
  locksByTile: ReadonlyMap<string, LockRecord>;
  tileSettledAtByKey: ReadonlyMap<string, number>;
  applyEconomyAccrual: (player: RuntimePlayer, nowMs: number) => void;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId: string) => void;
  emitEvent: (event: SimulationEvent) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitPlayerStateUpdate: (command: { commandId: string; playerId: string }) => void;
  yieldToEventLoop?: () => Promise<void>;
  trackSync?: TrackSync;
  /** Fires each time the AI-player PLAYER_UPDATE emit is skipped below. Zero
   *  forever means the skip never engages under real load. */
  onPlayerStateUpdateSkippedAi?: (playerId: string) => void;
}): Promise<void> {
  const yield_ = input.yieldToEventLoop ?? (() => Promise.resolve());
  const track = input.trackSync;
  for (const player of input.players.values()) {
    if (player.id.startsWith("barbarian-")) continue;
    input.applyEconomyAccrual(player, input.nowMs);
    if ((player.points ?? 0) > 0) {
      await yield_();
      continue;
    }
    const run = () => {
      const summary = input.summaryForPlayer(player.id);

      let shedTileKey: string | undefined;
      let shedTile: DomainTileState | undefined;
      let shedStamp = -Infinity;
      for (const tileKey of summary.territoryTileKeys) {
        const tile = input.tiles.get(tileKey);
        if (!tile) continue;
        if (tile.ownerId !== player.id) continue;
        if (tile.ownershipState !== "SETTLED") continue;
        if (input.locksByTile.has(tileKey)) continue;
        const stamp = input.tileSettledAtByKey.get(tileKey) ?? -Infinity;
        if (stamp >= shedStamp) {
          shedStamp = stamp;
          shedTileKey = tileKey;
          shedTile = tile;
        }
      }
      return { shedTileKey, shedTile };
    };
    const { shedTileKey, shedTile } = track
      ? track("tick_tile_shedding_scan", { playerId: player.id }, run)
      : run();
    if (!shedTileKey || !shedTile) {
      await yield_();
      continue;
    }

    const exec = () => {
      const commandId = `tile-shed:${player.id}:${shedTileKey}:${input.nowMs}`;
      const shedState: DomainTileState = {
        ...shedTile,
        ownerId: undefined,
        ownershipState: undefined,
        town: undefined,
        fort: undefined,
        observatory: undefined,
        siegeOutpost: undefined,
        economicStructure: undefined
      };
      input.replaceTileState(shedTileKey, shedState, commandId);
      input.emitEvent({
        eventType: "TILE_DELTA_BATCH",
        commandId,
        playerId: player.id,
        tileDeltas: [
          {
            ...input.tileDeltaFromState(shedState),
            ownerId: "",
            ownershipState: "",
            townJson: "",
            fortJson: "",
            observatoryJson: "",
            siegeOutpostJson: "",
            economicStructureJson: ""
          }
        ]
      });
      // AI players have no WS subscribers (established precedent: PR #732
      // skips this same emit on lock resolution for the same reason), so the
      // resulting PLAYER_UPDATE — which forces an economy snapshot +
      // town-network rebuild via cachedEconomySnapshot's invalidate-on-every-
      // replaceTileState contract — has nowhere to go. Measured 1123ms
      // (economy) + 880ms (nested town-network BFS) on a ~1918-tile/13-town
      // AI empire on staging 2026-07-05, one of two blockers behind spurious
      // human SIMULATION_UNAVAILABLE (the sim thread was too busy past the
      // gateway's 2500ms submit timeout).
      if (player.isAi) {
        input.onPlayerStateUpdateSkippedAi?.(player.id);
      } else {
        input.emitPlayerStateUpdate({ commandId, playerId: player.id });
      }
    };
    if (track) {
      track("tick_tile_shedding_execute", { playerId: player.id, tileKey: shedTileKey }, exec);
    } else {
      exec();
    }
    await yield_();
  }
}

export function tickOrphanedLockSweep(input: {
  nowMs: number;
  orphanLockGraceMs: number;
  locksByTile: Map<string, LockRecord>;
  locksByCommandId: Map<string, LockRecord>;
}): number {
  const cutoff = input.nowMs - input.orphanLockGraceMs;
  const droppedCommandIds = new Set<string>();
  for (const [tileKey, lock] of input.locksByTile) {
    if (lock.resolvesAt < cutoff) {
      input.locksByTile.delete(tileKey);
      input.locksByCommandId.delete(lock.commandId);
      droppedCommandIds.add(lock.commandId);
    }
  }
  return droppedCommandIds.size;
}

import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";
import type { LockRecord, RuntimePlayer, SimulationTileWireDelta } from "./runtime-types.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";

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
}): Promise<void> {
  // applyEconomyAccrual → consumeUpkeepFromTileYield → tileYieldEconomyContextForPlayer
  // rebuilds buildConnectedTownNetworkForPlayer (O(N×settledTiles)) on cache miss.
  // With 6 players × ~540ms each = ~3.2s synchronous block that exceeds the 2500ms
  // gRPC timeout. Yield between players so commands can be processed in between.
  const yield_ = input.yieldToEventLoop ?? (() => Promise.resolve());
  for (const player of input.players.values()) {
    if (player.id.startsWith("barbarian-")) continue;
    input.applyEconomyAccrual(player, input.nowMs);
    if ((player.points ?? 0) > 0) {
      await yield_();
      continue;
    }
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
    if (!shedTileKey || !shedTile) {
      await yield_();
      continue;
    }

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
    input.emitPlayerStateUpdate({ commandId, playerId: player.id });
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

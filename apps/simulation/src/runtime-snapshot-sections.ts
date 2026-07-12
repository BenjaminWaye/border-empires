import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { buildSimulationSnapshotCommandEvents, type SimulationSnapshotSections } from "./snapshot-store/snapshot-store.js";
import type { LockRecord } from "./runtime-types.js";
import type { PendingSettlementRecord, PlayerRuntimeSummary } from "./player-runtime-summary.js";
import { visionRadiusBonusForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";
import type { DockRouteDefinition } from "./dock-network/dock-network.js";
import { shouldYieldAt } from "./event-loop-yield.js";

export type SnapshotTile = SimulationSnapshotSections["initialState"]["tiles"][number];

export type SnapshotExportInput = {
  tiles: ReadonlyMap<string, DomainTileState>;
  locksByCommandId: ReadonlyMap<string, LockRecord>;
  players: ReadonlyMap<string, DomainPlayer>;
  pendingSettlementsByTile: ReadonlyMap<string, PendingSettlementRecord>;
  tileYieldCollectedAtByTile: ReadonlyMap<string, number>;
  playerYieldCollectionEpochByPlayer: ReadonlyMap<string, number>;
  docks: readonly DockRouteDefinition[];
  recordedEventsByCommandId: ReadonlyMap<string, SimulationEvent[]>;
  incomePerMinuteForPlayer: (playerId: string) => number;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  // Phase 3c: pre-serialized tile cache, updated on every replaceTileState call.
  // When provided, the async export skips the O(202k-tile) yield loop entirely.
  prebuiltTiles?: ReadonlyMap<string, SnapshotTile>;
};

export const mapTile = (tile: DomainTileState): SnapshotTile => ({
  x: tile.x,
  y: tile.y,
  terrain: tile.terrain,
  ...(tile.resource ? { resource: tile.resource } : {}),
  ...(tile.dockId ? { dockId: tile.dockId } : {}),
  ...(tile.shardSite ? { shardSite: tile.shardSite } : {}),
  ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
  ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
  ...(typeof tile.frontierDecayAt === "number" ? { frontierDecayAt: tile.frontierDecayAt } : {}),
  ...(tile.frontierDecayKind ? { frontierDecayKind: tile.frontierDecayKind } : {}),
  ...(tile.town ? { town: tile.town } : {}),
  ...(tile.fort ? { fort: tile.fort } : {}),
  ...(tile.observatory ? { observatory: tile.observatory } : {}),
  ...(tile.siegeOutpost ? { siegeOutpost: tile.siegeOutpost } : {}),
  ...(tile.economicStructure ? { economicStructure: tile.economicStructure } : {}),
  ...(tile.sabotage ? { sabotage: tile.sabotage } : {}),
  ...(tile.muster ? { muster: tile.muster } : {})
});

function buildSnapshotBody(input: SnapshotExportInput, tiles: SnapshotTile[]): SimulationSnapshotSections {
  return {
    initialState: {
      tiles,
      activeLocks: [...input.locksByCommandId.values()]
        .map((lock) => ({
          commandId: lock.commandId,
          playerId: lock.playerId,
          actionType: lock.actionType,
          originX: lock.originX,
          originY: lock.originY,
          targetX: lock.targetX,
          targetY: lock.targetY,
          originKey: lock.originKey,
          targetKey: lock.targetKey,
          resolvesAt: lock.resolvesAt,
          ...(lock.combatResolution ? { combatResolutionJson: JSON.stringify(lock.combatResolution) } : {})
        }))
        .sort((a, b) => a.commandId.localeCompare(b.commandId)),
      players: [...input.players.values()]
        .map((player) => ({
          id: player.id,
          ...(player.name ? { name: player.name } : {}),
          isAi: player.isAi,
          points: player.points,
          manpower: player.manpower,
          ...(typeof player.manpowerUpdatedAt === "number" ? { manpowerUpdatedAt: player.manpowerUpdatedAt } : {}),
          ...(typeof player.manpowerCapSnapshot === "number" ? { manpowerCapSnapshot: player.manpowerCapSnapshot } : {}),
          techIds: [...player.techIds].sort(),
          domainIds: [...(player.domainIds ?? [])].sort(),
          ...(player.chosenTrickleResource ? { chosenTrickleResource: player.chosenTrickleResource } : {}),
          ...(typeof player.imperialWardCharges === "number" ? { imperialWardCharges: player.imperialWardCharges } : {}),
          strategicResources: { ...(player.strategicResources ?? {}) },
          allies: [...player.allies].sort(),
          vision: player.mods?.vision ?? 1,
          visionRadiusBonus: visionRadiusBonusForPlayer(player),
          incomeMultiplier: player.mods?.income ?? 1,
          incomePerMinute: input.incomePerMinuteForPlayer(player.id),
          ownedTownTileKeys: [...input.summaryForPlayer(player.id).ownedTownTierByTile.keys()]
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      pendingSettlements: [...input.pendingSettlementsByTile.values()]
        .map((s) => ({ ...s }))
        .sort((a, b) => a.tileKey.localeCompare(b.tileKey)),
      tileYieldCollectedAtByTile: [...input.tileYieldCollectedAtByTile.entries()]
        .map(([tileKey, collectedAt]) => ({ tileKey, collectedAt }))
        .sort((a, b) => a.tileKey.localeCompare(b.tileKey)),
      playerYieldCollectionEpochByPlayer: [...input.playerYieldCollectionEpochByPlayer.entries()]
        .map(([playerId, collectedAt]) => ({ playerId, collectedAt }))
        .sort((a, b) => a.playerId.localeCompare(b.playerId)),
      ...(input.docks.length
        ? {
            docks: input.docks.map((dock) => ({
              dockId: dock.dockId,
              tileKey: dock.tileKey,
              pairedDockId: dock.pairedDockId,
              ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {})
            }))
          }
        : {})
    },
    commandEvents: buildSimulationSnapshotCommandEvents(input.recordedEventsByCommandId)
  };
}

export function buildRuntimeSnapshotSections(input: SnapshotExportInput): SimulationSnapshotSections {
  const tiles = [...input.tiles.values()].map(mapTile);
  tiles.sort((a, b) => a.x - b.x || a.y - b.y);
  return buildSnapshotBody(input, tiles);
}

export async function buildRuntimeSnapshotSectionsAsync(
  input: SnapshotExportInput,
  yieldToEventLoop: () => Promise<void>
): Promise<SimulationSnapshotSections> {
  // Phase 3c: if a pre-serialized tile cache is wired in, skip the O(202k-tile)
  // yield loop. On prod the 101 setImmediate yields each wait ~400-900 ms behind
  // AI ticks, making the checkpoint take 43-93 s. With the cache the only EL
  // block is the sort (~50 ms) before handing off to the stringify worker.
  if (input.prebuiltTiles) {
    const tiles = [...input.prebuiltTiles.values()];
    tiles.sort((a, b) => a.x - b.x || a.y - b.y);
    return buildSnapshotBody(input, tiles);
  }
  const tiles: SnapshotTile[] = [];
  let i = 0;
  for (const tile of input.tiles.values()) {
    if (shouldYieldAt(i, 2_000)) await yieldToEventLoop();
    tiles.push(mapTile(tile));
    i += 1;
  }
  await yieldToEventLoop();
  tiles.sort((a, b) => a.x - b.x || a.y - b.y);
  return buildSnapshotBody(input, tiles);
}

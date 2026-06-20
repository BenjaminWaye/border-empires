import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import { isChosenTrickleResource } from "@border-empires/shared";
import { MANPOWER_BASE_CAP, POPULATION_MAX, type DomainTileState } from "@border-empires/game-domain";
import { recomputeMods } from "./tech-domain-bridge/tech-domain-bridge.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import type { DockRouteDefinition } from "./dock-network/dock-network.js";
import type { RecoveredCommandHistory } from "./command-recovery/command-recovery.js";
import type { RecoveredSimulationState } from "./event-recovery/event-recovery.js";
import { isReplayTrackedCommandId } from "./command-event-lifecycle.js";
import { lockSourceFromCommandId } from "./runtime-types.js";
import type { LockedCombatResolution, LockRecord, RuntimePlayer } from "./runtime-types.js";

const isSyntheticSettlementTown = (
  town: DomainTileState["town"] | undefined,
  x: number,
  y: number
): boolean =>
  Boolean(
    town &&
    town.populationTier === "SETTLEMENT" &&
    town.name === `Settlement ${x},${y}`
  );

export const SYNTHETIC_SETTLEMENT_POPULATION = 800;

export const hydrateSyntheticSettlementTown = (
  town: DomainTileState["town"] | undefined,
  x: number,
  y: number
): DomainTileState["town"] | undefined => {
  if (!town || !isSyntheticSettlementTown(town, x, y)) return town;
  return {
    ...town,
    population: typeof town.population === "number" ? town.population : SYNTHETIC_SETTLEMENT_POPULATION,
    maxPopulation: typeof town.maxPopulation === "number" ? town.maxPopulation : POPULATION_MAX
  };
};

export const createPlayersFromRecoveredState = (
  initialState?: RecoveredSimulationState,
  fallbackPlayers?: ReadonlyMap<string, RuntimePlayer>
): Map<string, RuntimePlayer> | undefined => {
  if (!initialState?.players || initialState.players.length === 0) return undefined;
  return new Map(
    initialState.players.map((player) => {
      const techIds = new Set(player.techIds ?? []);
      const domainIds = new Set(player.domainIds ?? []);
      return [
        player.id,
        {
          id: player.id,
          isAi: player.isAi ?? fallbackPlayers?.get(player.id)?.isAi ?? false,
          name: player.name ?? player.id,
          points: player.points ?? 0,
          manpower: player.manpower ?? MANPOWER_BASE_CAP,
          ...(typeof player.manpowerUpdatedAt === "number" ? { manpowerUpdatedAt: player.manpowerUpdatedAt } : {}),
          ...(typeof player.manpowerCapSnapshot === "number" ? { manpowerCapSnapshot: player.manpowerCapSnapshot } : {}),
          techIds,
          domainIds,
          mods: recomputeMods({ techIds, domainIds }),
          techRootId: "rewrite-recovered",
          allies: new Set(player.allies ?? []),
          strategicResources: {
            FOOD: player.strategicResources?.FOOD ?? 0,
            IRON: player.strategicResources?.IRON ?? 0,
            CRYSTAL: player.strategicResources?.CRYSTAL ?? 0,
            SUPPLY: player.strategicResources?.SUPPLY ?? 0,
            SHARD: player.strategicResources?.SHARD ?? 0
          },
          ...(player.chosenTrickleResource && isChosenTrickleResource(player.chosenTrickleResource)
            ? { chosenTrickleResource: player.chosenTrickleResource }
            : {}),
          strategicProductionPerMinute: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 }
        }
      ] as const;
    })
  );
};

export const createTilesFromInitialState = (
  initialState: RecoveredSimulationState | undefined,
  seedTiles: Map<string, DomainTileState>,
  mergeSeedTilesWithInitialState: boolean
): Map<string, DomainTileState> => {
  if (!initialState) return new Map(seedTiles);
  const recoveredTileKeys = new Set<string>();
  for (const tile of initialState.tiles) {
    recoveredTileKeys.add(simulationTileKey(tile.x, tile.y));
  }
  const shouldBackfillMissingSeedTiles = !mergeSeedTilesWithInitialState && recoveredTileKeys.size < seedTiles.size;
  const mergedTiles = mergeSeedTilesWithInitialState || shouldBackfillMissingSeedTiles
    ? new Map(seedTiles)
    : new Map<string, DomainTileState>();

  for (const tile of initialState.tiles) {
    const tileKey = simulationTileKey(tile.x, tile.y);
    const seededTile = mergedTiles.get(tileKey);
    const hydratedTown = hydrateSyntheticSettlementTown(tile.town, tile.x, tile.y);
    mergedTiles.set(tileKey, {
      x: tile.x,
      y: tile.y,
      terrain: tile.terrain ?? seededTile?.terrain ?? "LAND",
      ...(tile.resource ? { resource: tile.resource } : {}),
      ...(tile.dockId ? { dockId: tile.dockId } : {}),
      ...(tile.shardSite ? { shardSite: tile.shardSite } : {}),
      ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
      ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
      ...(typeof tile.frontierDecayAt === "number" ? { frontierDecayAt: tile.frontierDecayAt } : {}),
      ...(tile.frontierDecayKind ? { frontierDecayKind: tile.frontierDecayKind } : {}),
      ...(hydratedTown ? { town: hydratedTown } : {}),
      ...(tile.fort ? { fort: tile.fort } : {}),
      ...(tile.observatory ? { observatory: tile.observatory } : {}),
      ...(tile.siegeOutpost ? { siegeOutpost: tile.siegeOutpost } : {}),
      ...(tile.economicStructure ? { economicStructure: tile.economicStructure } : {}),
      // Phase 4 activation point: when tile.structure is present it is the
      // authoritative unified field written by the Phase-4 runtime. Replace
      // the four legacy spreads above with a projection from tile.structure
      // (using projectLegacyToUnified in reverse) and remove this comment.
      // In Phase 3 we accept the field (see RecoveredTileState) and ignore it
      // so a Phase-4 snapshot can be loaded by a Phase-3-era binary safely.
      ...(tile.sabotage ? { sabotage: tile.sabotage } : {}),
      ...(tile.muster ? { muster: tile.muster } : {})
    });
  }
  return mergedTiles;
};

export const createDocksFromInitialState = (
  initialState: RecoveredSimulationState | undefined,
  seedDocks: DockRouteDefinition[]
): DockRouteDefinition[] =>
  (initialState?.docks ?? seedDocks).map((dock) => ({
    dockId: dock.dockId,
    tileKey: dock.tileKey,
    pairedDockId: dock.pairedDockId,
    ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {})
  }));

const parseRecoveredCombatResolution = (combatResolutionJson?: string): LockedCombatResolution | undefined => {
  if (!combatResolutionJson) return undefined;
  try {
    const parsed = JSON.parse(combatResolutionJson) as Partial<LockedCombatResolution> | undefined;
    if (!parsed || typeof parsed !== "object") return undefined;
    if (parsed.result) return {
      result: parsed.result,
      defenderGoldLoss: typeof parsed.defenderGoldLoss === "number" ? parsed.defenderGoldLoss : 0,
      targetRecentlyPillaged: parsed.targetRecentlyPillaged === true
    };
    return parsed as LockedCombatResolution | undefined;
  } catch {
    return undefined;
  }
};

export const createLocksFromInitialState = (initialState?: RecoveredSimulationState): Map<string, LockRecord> => {
  const locksByTile = new Map<string, LockRecord>();
  if (!initialState) return locksByTile;

  for (const lock of initialState.activeLocks) {
    const combatResolution = parseRecoveredCombatResolution(lock.combatResolutionJson);
    // Newer snapshots carry `source` explicitly; older snapshots (written
    // before the field existed) are migrated by sniffing the commandId
    // prefix produced by `nextTerritoryAutomationCommandId`.
    const source = lock.source ?? lockSourceFromCommandId(lock.commandId);
    const hydratedLock: LockRecord = {
      commandId: lock.commandId,
      playerId: lock.playerId,
      actionType: lock.actionType,
      manpowerCost: 0,
      originX: lock.originX,
      originY: lock.originY,
      targetX: lock.targetX,
      targetY: lock.targetY,
      originKey: lock.originKey,
      targetKey: lock.targetKey,
      resolvesAt: lock.resolvesAt,
      source,
      ...(combatResolution ? { combatResolution } : {})
    };
    locksByTile.set(hydratedLock.originKey, hydratedLock);
    locksByTile.set(hydratedLock.targetKey, hydratedLock);
  }

  return locksByTile;
};

export const uniqueLocksByCommandId = (locks: Iterable<LockRecord>): LockRecord[] => {
  const deduped = new Map<string, LockRecord>();
  for (const lock of locks) {
    if (!deduped.has(lock.commandId)) deduped.set(lock.commandId, lock);
  }
  return [...deduped.values()];
};

export const hydrateCommandHistory = ({
  commandIdsByPlayerSeq,
  recordedEventsByCommandId,
  recoveredCommandHistory
}: {
  commandIdsByPlayerSeq: Map<string, string>;
  recordedEventsByCommandId: Map<string, SimulationEvent[]>;
  recoveredCommandHistory?: RecoveredCommandHistory;
}): void => {
  if (!recoveredCommandHistory) return;

  for (const command of recoveredCommandHistory.commands) {
    if (command.type === "SYNC_ALLIANCE") continue;
    commandIdsByPlayerSeq.set(`${command.playerId}:${command.clientSeq}`, command.commandId);
  }
  for (const [commandId, events] of recoveredCommandHistory.eventsByCommandId.entries()) {
    // Mirror the live recordEvent gate: never load server-generated command
    // events into the in-memory replay cache (they would re-bloat the next
    // snapshot after a restart). The requeue-skip check reads
    // recoveredCommandHistory directly, not this cache, so this is safe.
    if (!isReplayTrackedCommandId(commandId)) continue;
    recordedEventsByCommandId.set(commandId, [...events]);
  }
};

export const requeueRecoveredCommands = ({
  recoveredCommandHistory,
  queueCommandForProcessing
}: {
  recoveredCommandHistory?: RecoveredCommandHistory;
  queueCommandForProcessing: (command: CommandEnvelope) => void;
}): void => {
  if (!recoveredCommandHistory) return;

  for (const command of recoveredCommandHistory.commands) {
    if (command.status !== "QUEUED") continue;
    if (recoveredCommandHistory.eventsByCommandId.has(command.commandId)) continue;
    queueCommandForProcessing({
      commandId: command.commandId,
      sessionId: command.sessionId,
      playerId: command.playerId,
      clientSeq: command.clientSeq,
      issuedAt: command.queuedAt,
      type: command.type,
      payloadJson: command.payloadJson
    });
  }
};

import type { ManpowerBreakdown, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainPlayer, DomainTileState, FrontierCommandType, PlayerEventLogEntry } from "@border-empires/game-domain";
import { simulationTileKey } from "./seed-state/seed-state.js";
import type { DockRouteDefinition } from "./dock-network/dock-network.js";
import type { SimulationSnapshotSections } from "./snapshot-store/snapshot-store.js";
import { TileDeltaStringifyCache } from "./tile-delta-stringify-cache/tile-delta-stringify-cache.js";
import type { StrategicResourceKey } from "./runtime-types.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import { cloneStrategicProduction, waypointQueueWireEntries, type PendingSettlementRecord, type WaypointQueueWireEntry } from "./player-runtime-summary.js";
import { toPersistedDevQueueEntries, type ExportedDevQueueEntry } from "./runtime-dev-queue-restore.js";
import { visionRadiusBonusForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";
import type { FrontierDecayKind, SlotResource, Terrain } from "@border-empires/shared";
import type { PlannerPlayerView, PlannerTileView, PlannerWorldView } from "./ai/planner-world-view.js";
import type { PlannerOwnedStructureCounts } from "./ai/planner-owned-structure-counts.js";
import { buildPlannerTileSlice, toPlannerTileView } from "./ai/planner-world-view-slice.js";
import { selectExpansionObjective, sampleEnemyYieldKeysAcrossPlayers, type ExpansionObjective } from "./ai/ai-expansion-objective.js";
import { shouldYieldAt } from "./event-loop-yield.js";
import type { SnapshotExportInput } from "./runtime-snapshot-sections.js";

export const plannerPlayerScopeKeyCount = (summary: PlayerRuntimeSummary): number => {
  const scopedKeys = new Set<string>();
  for (const key of summary.territoryTileKeys) scopedKeys.add(key);
  for (const key of summary.frontierTileKeys) scopedKeys.add(key);
  for (const key of summary.hotFrontierTileKeys) scopedKeys.add(key);
  for (const key of summary.strategicFrontierTileKeys) scopedKeys.add(key);
  for (const key of summary.buildCandidateTileKeys) scopedKeys.add(key);
  for (const key of summary.pendingSettlementsByTile.keys()) scopedKeys.add(key);
  return scopedKeys.size;
};

export type RuntimeExportState = {
  tiles: Array<{
    x: number;
    y: number;
    terrain: Terrain;
    resource?: string;
    dockId?: string;
    shardSiteJson?: string;
    naturalWonderJson?: string;
    ownerId?: string;
    ownershipState?: string;
    /** Persistent-border reach owner (Runtime.reachBorder), independent of ownerId — see SimulationTileWireDelta.reachOwnerId. Populated only by the per-player visible-state export (runtime-visible-state.ts); the full-world export below does not currently source it. */
    reachOwnerId?: string;
    frontierDecayAt?: number;
    frontierDecayKind?: FrontierDecayKind;
    townJson?: string;
    townType?: "MARKET" | "FARMING";
    townName?: string;
    townPopulationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
    fortJson?: string;
    observatoryJson?: string;
    siegeOutpostJson?: string;
    economicStructureJson?: string;
    sabotageJson?: string;
    musterJson?: string;
  }>;
  players: Array<{
    id: string;
    name?: string;
    points: number;
    manpower: number;
    manpowerCap?: number;
    manpowerRegenPerMinute?: number;
    logisticsThroughputPerMinute?: number;
    manpowerBreakdown?: ManpowerBreakdown;
    manpowerCapSnapshot?: number;
    techIds: string[];
    domainIds: string[];
    strategicResources: Partial<Record<StrategicResourceKey, number>>;
    allies: string[];
    truces: string[];
    vision: number;
    visionRadiusBonus: number;
    incomeMultiplier?: number;
    ownedTownTileKeys: string[];
    settledTileCount?: number;
    townCount?: number;
    incomePerMinute?: number;
    strategicProductionPerMinute?: Record<StrategicResourceKey, number>;
    activeDevelopmentProcessCount?: number;
    imperialWardCharges?: number;
    // Quickforge wonder: ms timestamp of this player's last discounted
    // rush-buy (0/absent = never used). Sent to the client purely so the
    // rush-buy price preview (client-tile-menu-view.ts) can replicate the
    // exact UTC-day gate quickforgeAdjustedRushPrice enforces server-side —
    // the server remains authoritative on the actual charged price.
    wonderLastFreeRushBuyAt?: number;
    galacticWonderManpowerRegenBonusPerMinute?: number; // v0 Wonder stand-in (§5, §12) — see DomainPlayer.
    galacticWonderVisionRadiusBonus?: number;
    eventLog?: PlayerEventLogEntry[];
    // Server-durable dev/expand queue tail (see player-runtime-summary.ts /
    // runtime-dev-queue.ts / runtime-waypoint-queue.ts) -- carried through
    // exportState so player-snapshot.ts can seed a reconnecting/fresh-login
    // client with whatever survived while it was disconnected, the same way
    // emitPlayerStateUpdate already does for the live PLAYER_UPDATE stream.
    // reservedManpower/reservedSlotRequirements MUST round-trip: the reserve
    // was already deducted from the persisted player.manpower above, so a
    // restore that dropped them would owe a refund it no longer knows about
    // and burn that manpower permanently (see runtime-dev-queue-restore.ts).
    devQueue?: ExportedDevQueueEntry[];
    waypointQueue?: WaypointQueueWireEntry[];
  }>;
  pendingSettlements: Array<PendingSettlementRecord>;
  activeLocks: Array<{
    commandId: string;
    playerId: string;
    actionType: FrontierCommandType;
    originKey: string;
    targetKey: string;
    resolvesAt: number;
    combatResolutionJson?: string;
  }>;
  docks: Array<{
    dockId: string;
    tileKey: string;
    pairedDockId: string;
    connectedDockIds?: readonly string[];
    routeWaypointsByLinkedDockId?: Readonly<Record<string, ReadonlyArray<{ x: number; y: number }>>>;
  }>;
  tileYieldCollectedAtByTile: Array<{ tileKey: string; collectedAt: number }>;
  playerYieldCollectionEpochByPlayer: Array<{ playerId: string; collectedAt: number }>;
  terrainEpoch: number;
  /** Cumulative count of town growth ticks skipped due to insufficient food. */
  growthStalledNoFoodCounter?: number;
};

// Lean row shape for the per-second metrics ticker (metrics-ai-player-state.ts).
// Deliberately not RuntimePlayerDebugSnapshot: that type's builder sorts
// techIds/domainIds/allies, clones strategicResources, and walks locksByTile
// for every player on every call — wasted work when only 4 numeric fields
// for AI players are needed once per second.
export type RuntimeAiPlayerMetricsRow = { id: string; isAi: boolean; points: number; incomePerMinute: number; settledTileCount: number; ownedTileCount: number };

export { buildRuntimePlayerDebugSnapshot } from "./runtime-player-debug-snapshot.js";
export type { RuntimePlayerDebugSnapshot } from "./runtime-player-debug-snapshot.js";

type RuntimeExportInput = Omit<SnapshotExportInput, "recordedEventsByCommandId"> & {
  terrainEpoch: number;
  tileDeltaStringifyCache: TileDeltaStringifyCache;
  applyManpowerRegen: (player: DomainPlayer) => void;
  playerManpowerCap: (player: DomainPlayer) => number;
  playerManpowerRegenPerMinute: (player: DomainPlayer) => number;
  playerLogisticsThroughputPerMinute: (player: DomainPlayer) => number;
  playerManpowerBreakdown: (player: DomainPlayer) => ManpowerBreakdown;
  growthStalledNoFoodCounter: number;
};

const toRuntimeExportTile = (
  tile: DomainTileState,
  tileDeltaStringifyCache: TileDeltaStringifyCache
): RuntimeExportState["tiles"][number] => {
  const tileKey = simulationTileKey(tile.x, tile.y);
  const cached = tileDeltaStringifyCache.getOrComputeAll(tileKey, tile);
  const entry: RuntimeExportState["tiles"][number] = {
    x: tile.x,
    y: tile.y,
    terrain: tile.terrain
  };
  if (tile.resource) entry.resource = tile.resource;
  if (tile.dockId) entry.dockId = tile.dockId;
  if (cached.shardSiteJson) entry.shardSiteJson = cached.shardSiteJson;
  if (cached.naturalWonderJson) entry.naturalWonderJson = cached.naturalWonderJson;
  if (tile.ownerId) entry.ownerId = tile.ownerId;
  if (tile.ownershipState) entry.ownershipState = tile.ownershipState;
  if (typeof tile.frontierDecayAt === "number") entry.frontierDecayAt = tile.frontierDecayAt;
  if (tile.frontierDecayKind) entry.frontierDecayKind = tile.frontierDecayKind;
  if (cached.townJson) entry.townJson = cached.townJson;
  if (tile.town?.type) entry.townType = tile.town.type;
  if (tile.town?.name) entry.townName = tile.town.name;
  if (tile.town?.populationTier) entry.townPopulationTier = tile.town.populationTier;
  if (cached.fortJson) entry.fortJson = cached.fortJson;
  if (cached.observatoryJson) entry.observatoryJson = cached.observatoryJson;
  if (cached.siegeOutpostJson) entry.siegeOutpostJson = cached.siegeOutpostJson;
  if (cached.economicStructureJson) entry.economicStructureJson = cached.economicStructureJson;
  if (cached.sabotageJson) entry.sabotageJson = cached.sabotageJson;
  if (cached.musterJson) entry.musterJson = cached.musterJson;
  return entry;
};

export const buildRuntimeExportPlayers = (input: RuntimeExportInput): RuntimeExportState["players"] =>
  [...input.players.values()]
    .map((player) => {
      // NOT swapped to refreshManpowerOnly, unlike the sibling planner-view
      // exports: verified (the hard way, via 3 failing tests) that this
      // function's full applyManpowerRegen call is relied on as one of the
      // "real" accrual catch-up paths — e.g. chosenTrickleResource /
      // gold-upkeep tests advance fake timers with NO other tick or command
      // in between and then call exportState() (which routes through this
      // function) expecting deferred accrual to have landed. Skipping accrual
      // here would silently break that guarantee for every caller, not just
      // tests. See visiblePlayersProjection in runtime-visible-state.ts for
      // where the equivalent skip *was* safe to apply (self keeps full
      // accrual there; only OTHER viewed players — who have their own command/
      // tick path — get the cheaper refresh).
      input.applyManpowerRegen(player);
      const summary = input.summaryForPlayer(player.id);
      return {
        id: player.id,
        ...(player.name ? { name: player.name } : {}),
        points: player.points,
        manpower: player.manpower,
        manpowerCap: input.playerManpowerCap(player),
        manpowerRegenPerMinute: input.playerManpowerRegenPerMinute(player),
        logisticsThroughputPerMinute: input.playerLogisticsThroughputPerMinute(player),
        manpowerBreakdown: input.playerManpowerBreakdown(player),
        ...(typeof player.manpowerCapSnapshot === "number" ? { manpowerCapSnapshot: player.manpowerCapSnapshot } : {}),
        techIds: [...player.techIds].sort(),
        domainIds: [...(player.domainIds ?? [])].sort(),
        strategicResources: { ...(player.strategicResources ?? {}) },
        allies: [...player.allies].sort(),
        truces: [...(player.truces ?? [])].sort(),
        vision: player.mods?.vision ?? 1,
        visionRadiusBonus: visionRadiusBonusForPlayer(player),
        incomeMultiplier: player.mods?.income ?? 1,
        ownedTownTileKeys: [...summary.ownedTownTierByTile.keys()],
        settledTileCount: summary.settledTileCount,
        townCount: summary.townCount,
        incomePerMinute: input.incomePerMinuteForPlayer(player.id),
        strategicProductionPerMinute: cloneStrategicProduction(summary.strategicProductionPerMinute),
        activeDevelopmentProcessCount: summary.activeDevelopmentProcessCount,
        ...(typeof player.imperialWardCharges === "number" ? { imperialWardCharges: player.imperialWardCharges } : {}),
        ...(typeof player.wonderLastFreeRushBuyAt === "number" ? { wonderLastFreeRushBuyAt: player.wonderLastFreeRushBuyAt } : {}),
        ...(typeof player.galacticWonderManpowerRegenBonusPerMinute === "number" ? { galacticWonderManpowerRegenBonusPerMinute: player.galacticWonderManpowerRegenBonusPerMinute } : {}),
        ...(typeof player.galacticWonderVisionRadiusBonus === "number" ? { galacticWonderVisionRadiusBonus: player.galacticWonderVisionRadiusBonus } : {}),
        ...(player.eventLog?.length ? { eventLog: player.eventLog } : {}),
        ...(summary.devQueue.length ? { devQueue: toPersistedDevQueueEntries(summary.devQueue) } : {}),
        ...(summary.waypointQueue.length ? { waypointQueue: waypointQueueWireEntries(summary.waypointQueue) } : {})
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));

export function buildRuntimeExportState(input: RuntimeExportInput): RuntimeExportState {
  return {
    tiles: (() => {
      const result = new Array(input.tiles.size) as RuntimeExportState["tiles"];
      let i = 0;
      for (const tile of input.tiles.values()) {
        result[i] = toRuntimeExportTile(tile, input.tileDeltaStringifyCache);
        i += 1;
      }
      result.sort((left, right) => left.x - right.x || left.y - right.y);
      return result;
    })(),
    players: buildRuntimeExportPlayers(input),
    pendingSettlements: sortedPendingSettlements(input.pendingSettlementsByTile),
    activeLocks: [...input.locksByCommandId.values()]
      .map((lock) => ({
        commandId: lock.commandId,
        playerId: lock.playerId,
        actionType: lock.actionType,
        originKey: lock.originKey,
        targetKey: lock.targetKey,
        resolvesAt: lock.resolvesAt,
        ...(lock.combatResolution ? { combatResolutionJson: JSON.stringify(lock.combatResolution) } : {})
      }))
      .sort((left, right) => left.commandId.localeCompare(right.commandId)),
    docks: input.docks.map((dock) => ({ ...dock, ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {}) })),
    tileYieldCollectedAtByTile: sortedCollectionEpochs(input.tileYieldCollectedAtByTile, "tileKey"),
    playerYieldCollectionEpochByPlayer: sortedCollectionEpochs(input.playerYieldCollectionEpochByPlayer, "playerId"),
    terrainEpoch: input.terrainEpoch,
    growthStalledNoFoodCounter: input.growthStalledNoFoodCounter
  };
}

export async function buildRuntimeExportStateAsync(
  input: RuntimeExportInput,
  yieldToEventLoop: () => Promise<void>
): Promise<RuntimeExportState> {
  const tiles = new Array(input.tiles.size) as RuntimeExportState["tiles"];
  let i = 0;
  for (const tile of input.tiles.values()) {
    if (shouldYieldAt(i, 2_000)) await yieldToEventLoop();
    tiles[i] = toRuntimeExportTile(tile, input.tileDeltaStringifyCache);
    i += 1;
  }
  await yieldToEventLoop();
  tiles.sort((left, right) => left.x - right.x || left.y - right.y);
  return {
    tiles,
    players: buildRuntimeExportPlayers(input),
    pendingSettlements: sortedPendingSettlements(input.pendingSettlementsByTile),
    activeLocks: [...input.locksByCommandId.values()]
      .map((lock) => ({
        commandId: lock.commandId,
        playerId: lock.playerId,
        actionType: lock.actionType,
        originKey: lock.originKey,
        targetKey: lock.targetKey,
        resolvesAt: lock.resolvesAt,
        ...(lock.combatResolution ? { combatResolutionJson: JSON.stringify(lock.combatResolution) } : {})
      }))
      .sort((left, right) => left.commandId.localeCompare(right.commandId)),
    docks: input.docks.map((dock) => ({ ...dock, ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {}) })),
    tileYieldCollectedAtByTile: sortedCollectionEpochs(input.tileYieldCollectedAtByTile, "tileKey"),
    playerYieldCollectionEpochByPlayer: sortedCollectionEpochs(input.playerYieldCollectionEpochByPlayer, "playerId"),
    terrainEpoch: input.terrainEpoch,
    growthStalledNoFoodCounter: input.growthStalledNoFoodCounter
  };
}

type PlannerTileKeys = {
  tileCollectionVersion: number;
  topologyVersion: number;
  topologyDirtyTileKeys: string[];
  territoryTileKeys: string[];
  frontierTileKeys: string[];
  hotFrontierTileKeys: string[];
  strategicFrontierTileKeys: string[];
  buildCandidateTileKeys: string[];
  pendingSettlementTileKeys: string[];
};

type ExpansionObjectiveCache = Map<string, { topologyVersion: number; beaconGeneration: number; objective: ExpansionObjective | undefined }>;

type PlannerExportInput = {
  playerIds: string[];
  tiles: ReadonlyMap<string, DomainTileState>;
  docks: readonly DockRouteDefinition[];
  players: ReadonlyMap<string, DomainPlayer>;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  plannerGatingLockPlayerIds: () => Set<string>;
  refreshManpowerOnly: (player: DomainPlayer) => void;
  plannerPlayerTileKeys: (playerId: string, summary: PlayerRuntimeSummary) => PlannerTileKeys;
  ownedStructureCountsForPlayer: (playerId: string) => PlannerOwnedStructureCounts;
  estimatedIncomePerMinuteForPlayer: (playerId: string) => number;
  // Fixed-border reach (packages/shared/src/reach/reach.ts) — see
  // PlannerPlayerView.reachTileKeys' doc comment for why this is required,
  // not optional: without it EXPAND-family planning is reach-blind.
  reachTileKeysForPlayer: (playerId: string) => string[];
  // Phase 1 of docs/ai-structure-building-rewrite-plan.md (§9): feed the
  // planner's diagnostic-only needVector. Optional so callers that don't care
  // about it (tests building a PlannerExportInput by hand) don't need to wire
  // four more closures — buildRuntimePlannerPlayerViews degrades to omitting
  // the corresponding PlannerPlayerView fields, and the planner then omits
  // needVector entirely (see automation-command-planner.ts's needVector gate).
  playerManpowerCap?: (playerId: string) => number;
  playerManpowerRegenPerMinute?: (playerId: string) => number;
  resourceSlotSupplyForPlayer?: (playerId: string) => Partial<Record<SlotResource, number>>;
  resourceSlotDemandForPlayer?: (playerId: string) => Partial<Record<SlotResource, number>>;
  // Feeds food-slot-relief.ts's chooseFoodConsumingStructureToDisable — same
  // optional-degrades-gracefully pattern as the four fields above.
  foodDormantEconomicStructureKeysForPlayer?: (playerId: string) => ReadonlySet<string>;
  neutralBeaconTileKeys: ReadonlySet<string>;
  beaconGeneration: number;
  yieldBearingTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  expansionObjectiveCacheByPlayer: ExpansionObjectiveCache;
  musterTilesByOwner: ReadonlyMap<string, ReadonlySet<string>>;
  // Instrumentation only (2026-07-29 login-stall investigation): a single-player
  // exportPlannerPlayerViews call was clocked at 6.6s in staging with no GC
  // pause to explain it, but every piece here reads as O(1)/bounded on
  // inspection. Wrapping the two candidates that have a "first access / cache
  // miss" full-rebuild branch (tile-key cache init, expansion objective) lets
  // the next event_loop_blocked capture attribute the real cost precisely
  // instead of guessing further from source alone.
  trackSync?: <T>(phase: string, details: Record<string, string | number> | undefined, task: () => T) => T;
};

export function buildRuntimePlannerWorldView(input: PlannerExportInput): PlannerWorldView {
  return {
    tiles: buildPlannerTileSlice({
      playerIds: input.playerIds,
      tiles: input.tiles,
      docks: input.docks,
      summaryForPlayer: input.summaryForPlayer
    }),
    players: buildRuntimePlannerPlayerViews(input),
    docks: input.docks.map((dock) => ({ ...dock, ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {}) }))
  };
}

export function buildRuntimePlannerPlayerViews(input: PlannerExportInput): PlannerPlayerView[] {
  const track = <T>(phase: string, playerId: string, task: () => T): T =>
    input.trackSync ? input.trackSync(phase, { playerId }, task) : task();
  const lockPlayerIds = input.plannerGatingLockPlayerIds();
  const players: PlannerPlayerView[] = [];
  // 2026-07-29 login-stall investigation: sampleEnemyYieldKeysAcrossPlayers is
  // O(total yield-bearing tiles across every player) before it samples down —
  // this used to run once PER PLAYER inside selectExpansionObjective even
  // though every player in this same batch reads the exact same source map.
  // Computed at most once per call, and only if some player actually needs it
  // (a cache-miss), not for a batch where every player's cache is warm.
  let sampledEnemyYieldKeys: ReturnType<typeof sampleEnemyYieldKeysAcrossPlayers> | undefined;
  const getSampledEnemyYieldKeys = (): ReturnType<typeof sampleEnemyYieldKeysAcrossPlayers> =>
    sampledEnemyYieldKeys ??= sampleEnemyYieldKeysAcrossPlayers(input.yieldBearingTilesByOwner);
  for (const playerId of input.playerIds) {
    const player = input.players.get(playerId);
    if (!player) continue;
    input.refreshManpowerOnly(player);
    const summary = input.summaryForPlayer(playerId);
    const tileKeys = track("planner_view_tile_keys", playerId, () => input.plannerPlayerTileKeys(playerId, summary));

    // Cache expansion objective keyed by (topologyVersion, beaconGeneration).
    // At steady state this is a pure integer compare — 0 work.
    const cached = input.expansionObjectiveCacheByPlayer.get(playerId);
    let expansionObjective: ExpansionObjective | undefined;
    if (
      cached &&
      cached.topologyVersion === tileKeys.topologyVersion &&
      cached.beaconGeneration === input.beaconGeneration
    ) {
      expansionObjective = cached.objective;
    } else {
      expansionObjective = track("planner_view_expansion_objective", playerId, () =>
        selectExpansionObjective({
          territoryTileKeys: tileKeys.territoryTileKeys,
          neutralBeaconTileKeys: input.neutralBeaconTileKeys,
          sampledEnemyYieldKeys: getSampledEnemyYieldKeys(),
          playerId
        }));
      input.expansionObjectiveCacheByPlayer.set(playerId, {
        topologyVersion: tileKeys.topologyVersion,
        beaconGeneration: input.beaconGeneration,
        objective: expansionObjective
      });
    }

    const ownedTileCount = tileKeys.territoryTileKeys.length;
    const frontierTileCount = tileKeys.frontierTileKeys.length;

    track("planner_view_push", playerId, () => {
      players.push({
        id: player.id,
        points: player.points,
        manpower: player.manpower,
        techIds: [...player.techIds].sort(),
        domainIds: [...(player.domainIds ?? [])].sort(),
        strategicResources: { ...(player.strategicResources ?? {}) },
        settledTileCount: summary.settledTileCount,
        townCount: summary.townCount,
        incomePerMinute: input.estimatedIncomePerMinuteForPlayer(playerId),
        tileCollectionVersion: tileKeys.tileCollectionVersion,
        topologyVersion: tileKeys.topologyVersion,
        topologyDirtyTileKeys: tileKeys.topologyDirtyTileKeys,
        hasActiveLock: lockPlayerIds.has(player.id),
        territoryTileKeys: tileKeys.territoryTileKeys,
        reachTileKeys: track("planner_view_reach_tile_keys", playerId, () => input.reachTileKeysForPlayer(playerId)),
        frontierTileKeys: tileKeys.frontierTileKeys,
        hotFrontierTileKeys: tileKeys.hotFrontierTileKeys,
        strategicFrontierTileKeys: tileKeys.strategicFrontierTileKeys,
        buildCandidateTileKeys: tileKeys.buildCandidateTileKeys,
        pendingSettlementTileKeys: tileKeys.pendingSettlementTileKeys,
        // Small (tens of tiles), safe to spread fresh every sync unlike the
        // territory-sized key sets above, which is why this bypasses the
        // incremental planner-tile-keys-cache machinery entirely.
        townTileKeys: [...summary.ownedTownTierByTile.keys()],
        activeDevelopmentProcessCount: summary.activeDevelopmentProcessCount,
        ownedStructureCounts: input.ownedStructureCountsForPlayer(playerId),
        ...(expansionObjective ? { expansionObjective } : {}),
        activeMusterCount: input.musterTilesByOwner.get(playerId)?.size ?? 0,
        musterTileKeys: [...(input.musterTilesByOwner.get(playerId) ?? [])],
        ownedTileCount,
        frontierTileCount,
        ...(input.playerManpowerCap ? { manpowerCapacity: input.playerManpowerCap(playerId) } : {}),
        ...(input.playerManpowerRegenPerMinute
          ? { manpowerRegenPerMinute: input.playerManpowerRegenPerMinute(playerId) }
          : {}),
        ...(input.resourceSlotSupplyForPlayer
          ? { slotSupplyByResource: input.resourceSlotSupplyForPlayer(playerId) }
          : {}),
        ...(input.resourceSlotDemandForPlayer
          ? { slotDemandByResource: input.resourceSlotDemandForPlayer(playerId) }
          : {}),
        ...(input.foodDormantEconomicStructureKeysForPlayer
          ? { foodDormantEconomicStructureKeys: [...input.foodDormantEconomicStructureKeysForPlayer(playerId)] }
          : {})
      });
    });
  }
  return players;
}

export function exportPlannerTilesForKeys(tiles: ReadonlyMap<string, DomainTileState>, tileKeys: Iterable<string>): PlannerTileView[] {
  const result: PlannerTileView[] = [];
  for (const tileKey of tileKeys) {
    const tile = tiles.get(tileKey);
    if (tile) result.push(toPlannerTileView(tile));
  }
  return result;
}

function sortedPendingSettlements(pendingSettlementsByTile: ReadonlyMap<string, PendingSettlementRecord>): PendingSettlementRecord[] {
  return [...pendingSettlementsByTile.values()]
    .map((settlement) => ({ ...settlement }))
    .sort((left, right) => left.tileKey.localeCompare(right.tileKey));
}

function sortedCollectionEpochs<Key extends "tileKey" | "playerId">(
  collection: ReadonlyMap<string, number>,
  key: Key
): Array<Record<Key, string> & { collectedAt: number }> {
  return [...collection.entries()]
    .map(([id, collectedAt]) => ({ [key]: id, collectedAt }) as Record<Key, string> & { collectedAt: number })
    .sort((left, right) => left[key].localeCompare(right[key]));
}

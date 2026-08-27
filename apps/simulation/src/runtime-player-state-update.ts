import { DEVELOPMENT_PROCESS_LIMIT, empireIntegrity } from "@border-empires/shared";
import type { ManpowerBreakdown } from "@border-empires/sim-protocol";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { additiveEffectForPlayer, buildModBreakdownForPlayer, recomputeMods } from "./tech-domain-bridge/tech-domain-bridge.js";
import { computeEmpireStorageCap, type EmpireStorageCap } from "./runtime-empire-storage.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import { waypointQueueWireEntries } from "./player-runtime-summary.js";
import type { PlayerDefensibilityMetrics } from "./player-defensibility-metrics.js";
import type { PlayerUpdateEconomySnapshot } from "./player-update-economy/player-update-economy.js";
import type { RuntimePlayer } from "./runtime-types.js";
import type { DormantStructureDetail, ResourceSlotTotals } from "./resource-slot-view/resource-slot-view.js";

/** Dependencies {@link emitPlayerStateUpdate} needs to build and emit a PLAYER_UPDATE message. */
export type RuntimePlayerStateUpdateContext = {
  players: ReadonlyMap<string, RuntimePlayer>;
  lastEmittedStorageCapByPlayer: Map<string, EmpireStorageCap>;
  applyManpowerRegen: (player: RuntimePlayer) => void;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  cachedDefensibilityMetrics: (playerId: string, summary: PlayerRuntimeSummary) => PlayerDefensibilityMetrics;
  cachedEconomySnapshot: (player: RuntimePlayer) => PlayerUpdateEconomySnapshot;
  resourceSlotSupplyForPlayer: (playerId: string) => ResourceSlotTotals;
  resourceSlotDemandForPlayer: (playerId: string) => ResourceSlotTotals;
  dormantStructuresForPlayer: (playerId: string) => DormantStructureDetail[];
  emitPlayerMessage: (command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: Record<string, unknown>) => void;
  playerManpowerCap: (player: RuntimePlayer) => number;
  playerManpowerRegenPerMinute: (player: RuntimePlayer) => number;
  playerLogisticsThroughputPerMinute: (player: RuntimePlayer) => number;
  playerManpowerBreakdown: (player: RuntimePlayer) => ManpowerBreakdown;
  pendingSettlementsSnapshotForPlayer: (playerId: string) => Array<{ x: number; y: number; startedAt: number; resolvesAt: number }>;
  autoSettlementQueueForPlayer: (playerId: string) => Array<{ x: number; y: number }>;
  activeDevelopmentProcessCountForPlayer: (playerId: string) => number;
  weaponsFactoryCountsForPlayer: (playerId: string) => { titanium: number; umbrite: number };
};

/**
 * Build and emit the PLAYER_UPDATE message for one player: manpower regen,
 * cached economy/defensibility snapshots, storage cap (only included in the
 * payload when it changed since the last emission), and settlement/dev-slot
 * state. Defensibility is computed before the economy snapshot so the latter
 * can read the warm defensibility cache for its integrity multiplier without
 * triggering its own rebuild.
 */
export function emitPlayerStateUpdate(
  context: RuntimePlayerStateUpdateContext,
  command: Pick<CommandEnvelope, "commandId" | "playerId">,
  playerId: string = command.playerId
): void {
  const player = context.players.get(playerId);
  if (!player) return;
  context.applyManpowerRegen(player);
  const summary = context.summaryForPlayer(playerId);
  const metrics = context.cachedDefensibilityMetrics(playerId, summary);
  const economy = context.cachedEconomySnapshot(player);
  player.strategicProductionPerMinute = economy.strategicProductionPerMinute;
  const storageCap = computeEmpireStorageCap(summary, economy.goldCapIncomePerMinute, economy.strategicProductionPerMinute);
  const lastCap = context.lastEmittedStorageCapByPlayer.get(playerId);
  const capChanged =
    !lastCap ||
    lastCap.GOLD !== storageCap.GOLD ||
    lastCap.FOOD !== storageCap.FOOD ||
    lastCap.SHARD !== storageCap.SHARD;
  if (capChanged) context.lastEmittedStorageCapByPlayer.set(playerId, storageCap);
  context.emitPlayerMessage(
    { commandId: command.commandId, playerId },
    {
      type: "PLAYER_UPDATE",
      gold: player.points,
      mods: player.mods ?? recomputeMods(player),
      modBreakdown: buildModBreakdownForPlayer(player, context.weaponsFactoryCountsForPlayer(playerId)),
      manpower: player.manpower,
      manpowerCap: context.playerManpowerCap(player),
      manpowerRegenPerMinute: context.playerManpowerRegenPerMinute(player),
      logisticsThroughputPerMinute: context.playerLogisticsThroughputPerMinute(player),
      manpowerBreakdown: context.playerManpowerBreakdown(player),
      incomePerMinute: economy.incomePerMinute,
      strategicResources: {
        FOOD: player.strategicResources?.FOOD ?? 0,
        TITANIUM: player.strategicResources?.TITANIUM ?? 0,
        CRYSTAL: player.strategicResources?.CRYSTAL ?? 0,
        UMBRITE: player.strategicResources?.UMBRITE ?? 0,
        SHARD: player.strategicResources?.SHARD ?? 0
      },
      strategicProductionPerMinute: economy.strategicProductionPerMinute,
      resourceSlots: {
        supply: context.resourceSlotSupplyForPlayer(playerId),
        demand: context.resourceSlotDemandForPlayer(playerId)
      },
      // §14.2: which of this player's structures are currently dormant
      // (slot demand not covered by supply), and which resource(s) each one
      // is short — feeds the client's greyed-out/"unpowered" indicator.
      dormantStructures: context.dormantStructuresForPlayer(playerId),
      // §20: durable per-player event log, sent in full like
      // strategicResources/dormantStructures above rather than diffed —
      // bounded to PLAYER_EVENT_LOG_MAX_ENTRIES, so the redundancy costs
      // little and keeps this consistent with every other field here.
      eventLog: player.eventLog ?? [],
      economyBreakdown: economy.economyBreakdown,
      upkeepPerMinute: economy.upkeepPerMinute,
      upkeepLastTick: economy.upkeepLastTick,
      T: metrics.T,
      E: metrics.E,
      Ts: metrics.Ts,
      Es: metrics.Es,
      // Authoritative empire-integrity percentage (global perimeter-ratio
      // model, defensibilityScore) — sent alongside the raw T/E/Ts/Es counts
      // (still used by client breakdown/tips UI) so the client can display the
      // real mechanic instead of recomputing an approximation client-side from
      // just two aggregate numbers.
      integrityPct: Math.round(Math.max(0, Math.min(1, empireIntegrity(metrics.Ts, metrics.Es))) * 100),
      pendingSettlements: context.pendingSettlementsSnapshotForPlayer(playerId),
      autoSettlementQueue: context.autoSettlementQueueForPlayer(playerId),
      devQueue: summary.devQueue.map((entry) => ({
        tileKey: entry.tileKey,
        x: entry.x,
        y: entry.y,
        kind: entry.kind,
        ...(entry.structureType ? { structureType: entry.structureType } : {}),
        queuedAt: entry.queuedAt
      })),
      waypointQueue: waypointQueueWireEntries(summary.waypointQueue),
      developmentProcessLimit: DEVELOPMENT_PROCESS_LIMIT + additiveEffectForPlayer(player, "developmentProcessCapacityAdd"),
      activeDevelopmentProcessCount: context.activeDevelopmentProcessCountForPlayer(playerId),
      ...(capChanged ? { storageCap } : {})
    }
  );
}

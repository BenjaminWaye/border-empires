import { DEVELOPMENT_PROCESS_LIMIT } from "@border-empires/shared";
import type { ManpowerBreakdown } from "@border-empires/sim-protocol";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { additiveEffectForPlayer, buildModBreakdownForPlayer, recomputeMods } from "./tech-domain-bridge/tech-domain-bridge.js";
import { computeEmpireStorageCap, type EmpireStorageCap } from "./runtime-empire-storage.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { PlayerUpdateEconomySnapshot } from "./player-update-economy/player-update-economy.js";
import type { RuntimePlayer } from "./runtime-types.js";

/** Dependencies {@link emitPlayerStateUpdate} needs to build and emit a PLAYER_UPDATE message. */
export type RuntimePlayerStateUpdateContext = {
  players: ReadonlyMap<string, RuntimePlayer>;
  lastEmittedStorageCapByPlayer: Map<string, EmpireStorageCap>;
  applyManpowerRegen: (player: RuntimePlayer) => void;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  cachedDefensibilityMetrics: (playerId: string, summary: PlayerRuntimeSummary) => { T: number; E: number; Ts: number; Es: number };
  cachedEconomySnapshot: (player: RuntimePlayer) => PlayerUpdateEconomySnapshot;
  emitPlayerMessage: (command: Pick<CommandEnvelope, "commandId" | "playerId">, payload: Record<string, unknown>) => void;
  playerManpowerCap: (player: RuntimePlayer) => number;
  playerManpowerRegenPerMinute: (player: RuntimePlayer) => number;
  playerLogisticsThroughputPerMinute: (player: RuntimePlayer) => number;
  playerManpowerBreakdown: (player: RuntimePlayer) => ManpowerBreakdown;
  pendingSettlementsSnapshotForPlayer: (playerId: string) => Array<{ x: number; y: number; startedAt: number; resolvesAt: number }>;
  autoSettlementQueueForPlayer: (playerId: string) => Array<{ x: number; y: number }>;
  activeDevelopmentProcessCountForPlayer: (playerId: string) => number;
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
    lastCap.IRON !== storageCap.IRON ||
    lastCap.CRYSTAL !== storageCap.CRYSTAL ||
    lastCap.SUPPLY !== storageCap.SUPPLY ||
    lastCap.SHARD !== storageCap.SHARD;
  if (capChanged) context.lastEmittedStorageCapByPlayer.set(playerId, storageCap);
  context.emitPlayerMessage(
    { commandId: command.commandId, playerId },
    {
      type: "PLAYER_UPDATE",
      gold: player.points,
      mods: player.mods ?? recomputeMods(player),
      modBreakdown: buildModBreakdownForPlayer(player),
      manpower: player.manpower,
      manpowerCap: context.playerManpowerCap(player),
      manpowerRegenPerMinute: context.playerManpowerRegenPerMinute(player),
      logisticsThroughputPerMinute: context.playerLogisticsThroughputPerMinute(player),
      manpowerBreakdown: context.playerManpowerBreakdown(player),
      incomePerMinute: economy.incomePerMinute,
      strategicResources: {
        FOOD: player.strategicResources?.FOOD ?? 0,
        IRON: player.strategicResources?.IRON ?? 0,
        CRYSTAL: player.strategicResources?.CRYSTAL ?? 0,
        SUPPLY: player.strategicResources?.SUPPLY ?? 0,
        SHARD: player.strategicResources?.SHARD ?? 0
      },
      strategicProductionPerMinute: economy.strategicProductionPerMinute,
      economyBreakdown: economy.economyBreakdown,
      upkeepPerMinute: economy.upkeepPerMinute,
      upkeepLastTick: economy.upkeepLastTick,
      T: metrics.T,
      E: metrics.E,
      Ts: metrics.Ts,
      Es: metrics.Es,
      pendingSettlements: context.pendingSettlementsSnapshotForPlayer(playerId),
      autoSettlementQueue: context.autoSettlementQueueForPlayer(playerId),
      developmentProcessLimit: DEVELOPMENT_PROCESS_LIMIT + additiveEffectForPlayer(player, "developmentProcessCapacityAdd"),
      activeDevelopmentProcessCount: context.activeDevelopmentProcessCountForPlayer(playerId),
      ...(capChanged ? { storageCap } : {})
    }
  );
}

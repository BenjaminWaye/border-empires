import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { FrontierCommandType } from "@border-empires/game-domain";
import type { QueueLane } from "./command-lane/command-lane.js";

export type RuntimeCommandDispatchHandlers = {
  emitUnsupported: (command: CommandEnvelope) => void;
  handleWatchMusterCommand: (command: CommandEnvelope) => void;
  handleUnwatchMusterCommand: (command: CommandEnvelope) => void;
  handleSettleCommand: (command: CommandEnvelope) => void;
  handleBuildStructureCommand: (command: CommandEnvelope) => void;
  normalizeLegacyBuildCommand: (command: CommandEnvelope) => CommandEnvelope;
  handleSetMusterCommand: (command: CommandEnvelope) => void;
  handleClearMusterCommand: (command: CommandEnvelope) => void;
  handleCancelCaptureCommand: (command: CommandEnvelope) => void;
  handleCancelFortBuildCommand: (command: CommandEnvelope) => void;
  handleCancelStructureBuildCommand: (command: CommandEnvelope) => void;
  handleRemoveStructureCommand: (command: CommandEnvelope) => void;
  handleCancelSiegeOutpostBuildCommand: (command: CommandEnvelope) => void;
  handleCollectTileCommand: (command: CommandEnvelope) => void;
  handleCollectVisibleCommand: (command: CommandEnvelope) => void;
  handleUncaptureTileCommand: (command: CommandEnvelope) => void;
  handleChooseTechCommand: (command: CommandEnvelope) => void;
  handleChooseDomainCommand: (command: CommandEnvelope) => void;
  handleOverloadSynthesizerCommand: (command: CommandEnvelope) => void;
  handleSetConverterStructureEnabledCommand: (command: CommandEnvelope) => void;
  handleRevealEmpireCommand: (command: CommandEnvelope) => void;
  handleRevealEmpireStatsCommand: (command: CommandEnvelope) => void;
  handleSurveySweepCommand: (command: CommandEnvelope) => void;
  handleAetherLanceCommand: (command: CommandEnvelope) => void;
  handleCastAetherBridgeCommand: (command: CommandEnvelope) => void;
  handleCastAetherWallCommand: (command: CommandEnvelope) => void;
  handleSiphonTileCommand: (command: CommandEnvelope) => void;
  handlePurgeSiphonCommand: (command: CommandEnvelope) => void;
  handleCreateMountainCommand: (command: CommandEnvelope) => void;
  handleRemoveMountainCommand: (command: CommandEnvelope) => void;
  handleAirportBombardCommand: (command: CommandEnvelope) => void;
  handleImperialExchangeLevyCommand: (command: CommandEnvelope) => void;
  handleWorldEngineStrikeCommand: (command: CommandEnvelope) => void;
  handleUpgradeTownTierCommand: (command: CommandEnvelope) => void;
  handleCollectShardCommand: (command: CommandEnvelope) => void;
  handleSyncAllianceCommand: (command: CommandEnvelope) => void;
  handleFrontierCommand: (command: CommandEnvelope, actionType: FrontierCommandType) => void;
};

export const commandScheduling = (command: CommandEnvelope): "immediate" | "background" =>
  command.type !== "SYNC_ALLIANCE" &&
  (command.sessionId.startsWith("ai-runtime:") || command.sessionId.startsWith("system-runtime:"))
    ? "background"
    : "immediate";

export const dispatchRuntimeCommand = (command: CommandEnvelope, handlers: RuntimeCommandDispatchHandlers): void => {
  if (!isSupportedRuntimeCommand(command)) {
    handlers.emitUnsupported(command);
    return;
  }
  if (command.type === "SETTLE") return handlers.handleSettleCommand(command);
  if ((command.type as string) === "BUILD_STRUCTURE") return handlers.handleBuildStructureCommand(command);
  if (isLegacyBuildCommand(command)) return handlers.handleBuildStructureCommand(handlers.normalizeLegacyBuildCommand(command));
  if ((command.type as string) === "SET_MUSTER") return handlers.handleSetMusterCommand(command);
  if ((command.type as string) === "CLEAR_MUSTER") return handlers.handleClearMusterCommand(command);
  if ((command.type as string) === "WATCH_MUSTER") return handlers.handleWatchMusterCommand(command);
  if ((command.type as string) === "UNWATCH_MUSTER") return handlers.handleUnwatchMusterCommand(command);
  if (command.type === "CANCEL_CAPTURE") return handlers.handleCancelCaptureCommand(command);
  if (command.type === "CANCEL_FORT_BUILD") return handlers.handleCancelFortBuildCommand(command);
  if (command.type === "CANCEL_STRUCTURE_BUILD") return handlers.handleCancelStructureBuildCommand(command);
  if (command.type === "REMOVE_STRUCTURE") return handlers.handleRemoveStructureCommand(command);
  if (command.type === "CANCEL_SIEGE_OUTPOST_BUILD") return handlers.handleCancelSiegeOutpostBuildCommand(command);
  if (command.type === "COLLECT_TILE") return handlers.handleCollectTileCommand(command);
  if (command.type === "COLLECT_VISIBLE") return handlers.handleCollectVisibleCommand(command);
  if (command.type === "UNCAPTURE_TILE") return handlers.handleUncaptureTileCommand(command);
  if (command.type === "CHOOSE_TECH") return handlers.handleChooseTechCommand(command);
  if (command.type === "CHOOSE_DOMAIN") return handlers.handleChooseDomainCommand(command);
  if (command.type === "OVERLOAD_SYNTHESIZER") return handlers.handleOverloadSynthesizerCommand(command);
  if (command.type === "SET_CONVERTER_STRUCTURE_ENABLED") return handlers.handleSetConverterStructureEnabledCommand(command);
  if (command.type === "REVEAL_EMPIRE") return handlers.handleRevealEmpireCommand(command);
  if (command.type === "REVEAL_EMPIRE_STATS") return handlers.handleRevealEmpireStatsCommand(command);
  if (command.type === "SURVEY_SWEEP") return handlers.handleSurveySweepCommand(command);
  if (command.type === "AETHER_LANCE") return handlers.handleAetherLanceCommand(command);
  if (command.type === "CAST_AETHER_BRIDGE") return handlers.handleCastAetherBridgeCommand(command);
  if (command.type === "CAST_AETHER_WALL") return handlers.handleCastAetherWallCommand(command);
  if (command.type === "SIPHON_TILE") return handlers.handleSiphonTileCommand(command);
  if (command.type === "PURGE_SIPHON") return handlers.handlePurgeSiphonCommand(command);
  if (command.type === "CREATE_MOUNTAIN") return handlers.handleCreateMountainCommand(command);
  if (command.type === "REMOVE_MOUNTAIN") return handlers.handleRemoveMountainCommand(command);
  if (command.type === "AIRPORT_BOMBARD") return handlers.handleAirportBombardCommand(command);
  if (command.type === "IMPERIAL_EXCHANGE_LEVY") return handlers.handleImperialExchangeLevyCommand(command);
  if (command.type === "WORLD_ENGINE_STRIKE") return handlers.handleWorldEngineStrikeCommand(command);
  if (command.type === "UPGRADE_TOWN_TIER") return handlers.handleUpgradeTownTierCommand(command);
  if (command.type === "COLLECT_SHARD") return handlers.handleCollectShardCommand(command);
  if (command.type === "SYNC_ALLIANCE") return handlers.handleSyncAllianceCommand(command);
  if (command.type === "ATTACK" || command.type === "EXPAND") {
    handlers.handleFrontierCommand(command, command.type);
  }
};

const isLegacyBuildCommand = (command: CommandEnvelope): boolean =>
  command.type === "BUILD_FORT" ||
  command.type === "BUILD_OBSERVATORY" ||
  command.type === "BUILD_SIEGE_OUTPOST" ||
  command.type === "BUILD_ECONOMIC_STRUCTURE";

const isSupportedRuntimeCommand = (command: CommandEnvelope): boolean =>
  command.type === "ATTACK" ||
  command.type === "EXPAND" ||
  command.type === "SETTLE" ||
  (command.type as string) === "BUILD_STRUCTURE" ||
  isLegacyBuildCommand(command) ||
  (command.type as string) === "SET_MUSTER" ||
  (command.type as string) === "CLEAR_MUSTER" ||
  (command.type as string) === "WATCH_MUSTER" ||
  (command.type as string) === "UNWATCH_MUSTER" ||
  command.type === "CANCEL_CAPTURE" ||
  command.type === "CANCEL_FORT_BUILD" ||
  command.type === "CANCEL_STRUCTURE_BUILD" ||
  command.type === "REMOVE_STRUCTURE" ||
  command.type === "CANCEL_SIEGE_OUTPOST_BUILD" ||
  command.type === "UNCAPTURE_TILE" ||
  command.type === "COLLECT_TILE" ||
  command.type === "COLLECT_VISIBLE" ||
  command.type === "CHOOSE_TECH" ||
  command.type === "CHOOSE_DOMAIN" ||
  command.type === "OVERLOAD_SYNTHESIZER" ||
  command.type === "SET_CONVERTER_STRUCTURE_ENABLED" ||
  command.type === "REVEAL_EMPIRE" ||
  command.type === "REVEAL_EMPIRE_STATS" ||
  command.type === "SURVEY_SWEEP" ||
  command.type === "AETHER_LANCE" ||
  command.type === "CAST_AETHER_BRIDGE" ||
  command.type === "CAST_AETHER_WALL" ||
  command.type === "SIPHON_TILE" ||
  command.type === "PURGE_SIPHON" ||
  command.type === "CREATE_MOUNTAIN" ||
  command.type === "REMOVE_MOUNTAIN" ||
  command.type === "AIRPORT_BOMBARD" ||
  command.type === "IMPERIAL_EXCHANGE_LEVY" ||
  command.type === "WORLD_ENGINE_STRIKE" ||
  command.type === "UPGRADE_TOWN_TIER" ||
  command.type === "COLLECT_SHARD" ||
  command.type === "SYNC_ALLIANCE";

export type RuntimeCommandEnqueue = (
  lane: QueueLane,
  run: () => void,
  commandType?: CommandEnvelope["type"],
  scheduling?: "immediate" | "background"
) => void;

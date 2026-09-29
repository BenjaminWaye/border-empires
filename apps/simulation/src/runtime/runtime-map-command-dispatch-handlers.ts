import type { CommandEnvelope } from "@border-empires/sim-protocol";
import {
  handleAegisLockCommand as handleAegisLockCommandImpl,
  handleAirportBombardCommand as handleAirportBombardCommandImpl,
  handleAstralDockLaunchCommand as handleAstralDockLaunchCommandImpl,
  handleCreateMountainCommand as handleCreateMountainCommandImpl,
  handleRemoveMountainCommand as handleRemoveMountainCommandImpl,
  handleWorldEngineStrikeCommand as handleWorldEngineStrikeCommandImpl,
  type RuntimeMapCommandContext
} from "../runtime-map-command-handlers.js";
import { handleRetortRecastCommand as handleRetortRecastCommandImpl } from "../runtime-retort-recast-command-handler.js";
import { handleSyncTruceCommand as handleSyncTruceCommandImpl } from "../runtime-truce-sync-command.js";
import { handleImperialExchangeLevyCommand as handleImperialExchangeLevyCommandImpl } from "../runtime-imperial-exchange-levy-command.js";
import { handleTitaniumLevyMusterCommand as handleTitaniumLevyMusterCommandImpl } from "../runtime-titanium-levy-command.js";
import { handleActivateImperialWardCommand as handleActivateImperialWardCommandImpl } from "../runtime-imperial-ward-command-handler.js";

// Extracted from runtime.ts's commandDispatchHandlers() (500-line source
// budget, see AGENTS.md) so a new map-command ability only adds one line
// there. Every one of these handlers only needs RuntimeMapCommandContext,
// unlike the sibling handlers that stay in commandDispatchHandlers()
// because they also call other private SimulationRuntime methods.
export const buildMapCommandDispatchHandlers = (mapCommandContext: () => RuntimeMapCommandContext) => ({
  handleCreateMountainCommand: (command: CommandEnvelope) => handleCreateMountainCommandImpl(mapCommandContext(), command),
  handleRemoveMountainCommand: (command: CommandEnvelope) => handleRemoveMountainCommandImpl(mapCommandContext(), command),
  handleRetortRecastCommand: (command: CommandEnvelope) => handleRetortRecastCommandImpl(mapCommandContext(), command),
  handleAirportBombardCommand: (command: CommandEnvelope) => handleAirportBombardCommandImpl(mapCommandContext(), command),
  handleImperialExchangeLevyCommand: (command: CommandEnvelope) => handleImperialExchangeLevyCommandImpl(mapCommandContext(), command),
  handleWorldEngineStrikeCommand: (command: CommandEnvelope) => handleWorldEngineStrikeCommandImpl(mapCommandContext(), command),
  handleAegisLockCommand: (command: CommandEnvelope) => handleAegisLockCommandImpl(mapCommandContext(), command),
  handleAstralDockLaunchCommand: (command: CommandEnvelope) => handleAstralDockLaunchCommandImpl(mapCommandContext(), command),
  handleTitaniumLevyMusterCommand: (command: CommandEnvelope) => handleTitaniumLevyMusterCommandImpl(mapCommandContext(), command),
  handleActivateImperialWardCommand: (command: CommandEnvelope) => handleActivateImperialWardCommandImpl(mapCommandContext(), command),
  handleSyncTruceCommand: (command: CommandEnvelope) => handleSyncTruceCommandImpl(mapCommandContext(), command)
});

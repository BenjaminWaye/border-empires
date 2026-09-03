import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import { simulationTileKey } from "./seed-state/seed-state.js";

export const handleWatchMusterCommand = (
  watchedMusterTileByPlayer: Map<string, string>,
  command: CommandEnvelope,
  emitEvent: (event: SimulationEvent) => void
): void => {
  const payload = JSON.parse(command.payloadJson) as { x: number; y: number };
  watchedMusterTileByPlayer.set(command.playerId, simulationTileKey(payload.x, payload.y));
  emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
};

export const handleUnwatchMusterCommand = (
  watchedMusterTileByPlayer: Map<string, string>,
  command: CommandEnvelope,
  emitEvent: (event: SimulationEvent) => void
): void => {
  watchedMusterTileByPlayer.delete(command.playerId);
  emitEvent({ eventType: "COMMAND_RESOLVED", commandId: command.commandId, playerId: command.playerId });
};

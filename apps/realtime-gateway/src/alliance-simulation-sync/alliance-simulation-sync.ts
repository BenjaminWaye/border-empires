import crypto from "node:crypto";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { TruceSimulationSyncDeps } from "../truce-simulation-sync/truce-simulation-sync.js";

type AllianceSyncInput = { playerId: string; targetPlayerId: string; allied: boolean };
type AllianceSimulationSyncDeps = Omit<TruceSimulationSyncDeps, "socialState" | "initialTrucePairs">;

export const createAllianceSimulationSync = (deps: AllianceSimulationSyncDeps): ((input: AllianceSyncInput) => Promise<boolean>) => {
  const { simulationClient, simulationHealth, simulationSubmitTimeoutMs, withTimeout, markSimulationReady, handleSubmitError, recordGatewayEvent } = deps;
  return async (input: AllianceSyncInput): Promise<boolean> => {
    if (!simulationHealth.connected) {
      recordGatewayEvent("warn", "gateway_social_simulation_sync_skipped", {
        playerId: input.playerId,
        targetPlayerId: input.targetPlayerId,
        allied: input.allied,
        simulationLastError: simulationHealth.lastError ?? ""
      });
      return false;
    }

    const command: CommandEnvelope = {
      commandId: `social:${input.allied ? "ally" : "break"}:${input.playerId}:${input.targetPlayerId}:${crypto.randomUUID()}`,
      clientSeq: 0,
      issuedAt: Date.now(),
      type: "SYNC_ALLIANCE",
      sessionId: "system-runtime:social",
      playerId: input.playerId,
      payloadJson: JSON.stringify({ targetPlayerId: input.targetPlayerId, allied: input.allied })
    };
    try {
      await withTimeout(simulationClient.submitCommand(command), simulationSubmitTimeoutMs, "gateway sync alliance");
      markSimulationReady();
      return true;
    } catch (error) {
      handleSubmitError(error, { commandId: command.commandId, playerId: input.playerId });
      recordGatewayEvent("warn", "gateway_social_simulation_sync_failed", {
        commandId: command.commandId,
        playerId: input.playerId,
        targetPlayerId: input.targetPlayerId,
        allied: input.allied,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  };
};

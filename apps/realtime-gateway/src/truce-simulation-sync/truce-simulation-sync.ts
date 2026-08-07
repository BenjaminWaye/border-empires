import crypto from "node:crypto";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

// Truces don't have a break-notice grace period like alliances, so there's no
// "finalize" step — trucesByPair entries in social-state just age out via its
// own sweepExpired. syncExpiredTruces() below tracks which pairs we've told
// the simulation are truced so it can detect natural expirations (endsAt
// passing with nobody calling breakTruce) and sync the removal, closing the
// gap where the sim never learns a truce ended on its own.
export type TruceSimulationSyncDeps = {
  simulationClient: { submitCommand: (command: CommandEnvelope) => Promise<unknown> };
  simulationHealth: { connected: boolean; lastError?: string | undefined };
  socialState: { activeTrucePairs: () => Array<[string, string]> };
  simulationSubmitTimeoutMs: number;
  withTimeout: <T>(task: Promise<T>, timeoutMs: number, label: string) => Promise<T>;
  markSimulationReady: () => void;
  handleSubmitError: (error: unknown, ctx: { commandId: string; playerId: string }) => void;
  recordGatewayEvent: (level: "info" | "warn" | "error", event: string, payload?: Record<string, unknown>) => void;
};

export type TruceSimulationSync = {
  syncTruceToSimulation: (input: { playerId: string; targetPlayerId: string; truced: boolean }) => Promise<boolean>;
  syncExpiredTruces: () => Promise<void>;
};

const truceSimPairKey = (playerAId: string, playerBId: string): string =>
  playerAId < playerBId ? `${playerAId}:${playerBId}` : `${playerBId}:${playerAId}`;

export const createTruceSimulationSync = (deps: TruceSimulationSyncDeps): TruceSimulationSync => {
  const knownSimTrucePairs = new Set<string>();

  const syncTruceToSimulation: TruceSimulationSync["syncTruceToSimulation"] = async (input) => {
    if (!deps.simulationHealth.connected) {
      deps.recordGatewayEvent("warn", "gateway_social_simulation_sync_skipped", {
        playerId: input.playerId,
        targetPlayerId: input.targetPlayerId,
        truced: input.truced,
        simulationLastError: deps.simulationHealth.lastError ?? ""
      });
      return false;
    }
    const command: CommandEnvelope = {
      commandId: `social:${input.truced ? "truce" : "truce-end"}:${input.playerId}:${input.targetPlayerId}:${crypto.randomUUID()}`,
      clientSeq: 0,
      issuedAt: Date.now(),
      type: "SYNC_TRUCE",
      sessionId: "system-runtime:social",
      playerId: input.playerId,
      payloadJson: JSON.stringify({ targetPlayerId: input.targetPlayerId, truced: input.truced })
    };
    try {
      await deps.withTimeout(deps.simulationClient.submitCommand(command), deps.simulationSubmitTimeoutMs, "gateway sync truce");
      deps.markSimulationReady();
      const pairKey = truceSimPairKey(input.playerId, input.targetPlayerId);
      if (input.truced) knownSimTrucePairs.add(pairKey);
      else knownSimTrucePairs.delete(pairKey);
      return true;
    } catch (error) {
      deps.handleSubmitError(error, { commandId: command.commandId, playerId: input.playerId });
      deps.recordGatewayEvent("warn", "gateway_social_simulation_sync_failed", {
        commandId: command.commandId,
        playerId: input.playerId,
        targetPlayerId: input.targetPlayerId,
        truced: input.truced,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  };

  let truceExpirySyncRunning = false;
  const syncExpiredTruces = async (): Promise<void> => {
    if (truceExpirySyncRunning) return;
    truceExpirySyncRunning = true;
    try {
      const activePairs = deps.socialState.activeTrucePairs();
      const activeKeys = new Set(activePairs.map(([a, b]) => truceSimPairKey(a, b)));
      for (const [playerAId, playerBId] of activePairs) knownSimTrucePairs.add(truceSimPairKey(playerAId, playerBId));
      for (const pairKey of [...knownSimTrucePairs]) {
        if (activeKeys.has(pairKey)) continue;
        const [playerAId, playerBId] = pairKey.split(":");
        if (!playerAId || !playerBId) continue;
        await syncTruceToSimulation({ playerId: playerAId, targetPlayerId: playerBId, truced: false });
      }
    } finally {
      truceExpirySyncRunning = false;
    }
  };

  return { syncTruceToSimulation, syncExpiredTruces };
};

/**
 * Pure helpers over the gateway's pendingInputToStateByCommandId map —
 * extracted from gateway-app.ts (already over the file-line cap) so new
 * additions there stay net-neutral-or-negative.
 */
export type PendingInputToStateEvent = {
  at: number;
  level: "info" | "warn" | "error";
  event: string;
  payload: Record<string, unknown>;
};

export const buildPendingInputToStateEvents = (
  pendingInputToStateByCommandId: Map<string, number>,
  simulationHealth: { connected: boolean; lastError?: string | undefined }
): PendingInputToStateEvent[] =>
  [...pendingInputToStateByCommandId.entries()]
    .map(([commandId, submittedAt]) => {
      const ageMs = Date.now() - submittedAt;
      const level: "info" | "warn" = ageMs >= 5_000 ? "warn" : "info";
      return {
        at: submittedAt,
        level,
        event: "pending_input_to_state",
        payload: {
          commandId,
          ageMs,
          simulationConnected: simulationHealth.connected,
          simulationLastError: simulationHealth.lastError ?? ""
        }
      };
    })
    .sort((left, right) => left.at - right.at);

export const sweepStalePendingInputToState = (
  pendingInputToStateByCommandId: Map<string, number>,
  staleBeforeMs: number
): void => {
  for (const [commandId, submittedAt] of pendingInputToStateByCommandId.entries()) {
    if (submittedAt < staleBeforeMs) pendingInputToStateByCommandId.delete(commandId);
  }
};

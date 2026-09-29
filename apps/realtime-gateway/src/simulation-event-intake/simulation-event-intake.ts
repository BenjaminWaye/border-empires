// First step of gateway-app.ts's processSimulationEvent, extracted (that file
// is over the 500-line cap): logs the received event and, when it answers a
// command a player submitted over their socket, records input-to-state
// latency and clears the pending entry.
import type { SimulationClientEvent } from "../sim-client/sim-client.js";

export type SimulationEventIntakeDeps = {
  recordGatewayEvent: (level: "info" | "warn" | "error", event: string, payload: Record<string, unknown>) => void;
  pendingInputToStateByCommandId: Map<string, number>;
  observeInputToStateLatencyMs: (durationMs: number) => void;
  slowInputToStateWarnMs: number;
  simulationHealth: { connected: boolean; lastError?: string | undefined };
  now: () => number;
};

// Returns true when the event is the first sim response to a command the
// player submitted over their socket.
export const intakeSimulationEvent = (event: SimulationClientEvent, deps: SimulationEventIntakeDeps): boolean => {
  if (!event.commandId.startsWith("bootstrap:")) {
    deps.recordGatewayEvent("info", "gateway_simulation_event_received", {
      commandId: event.commandId,
      playerId: event.playerId,
      eventType: event.eventType,
      ...("actionType" in event && typeof event.actionType === "string" ? { actionType: event.actionType } : {}),
      ...("targetX" in event && typeof event.targetX === "number" ? { targetX: event.targetX } : {}),
      ...("targetY" in event && typeof event.targetY === "number" ? { targetY: event.targetY } : {}),
      ...("attackerWon" in event && typeof event.attackerWon === "boolean" ? { attackerWon: event.attackerWon } : {}),
      ...("tileDeltas" in event && Array.isArray(event.tileDeltas) ? { tileDeltaCount: event.tileDeltas.length } : {})
    });
  }
  const submittedAt = deps.pendingInputToStateByCommandId.get(event.commandId);
  if (typeof submittedAt !== "number") return false;
  const inputToStateDurationMs = deps.now() - submittedAt;
  deps.observeInputToStateLatencyMs(inputToStateDurationMs);
  deps.pendingInputToStateByCommandId.delete(event.commandId);
  if (inputToStateDurationMs >= deps.slowInputToStateWarnMs) {
    deps.recordGatewayEvent("warn", "gateway_input_to_state_slow", {
      commandId: event.commandId,
      playerId: event.playerId,
      eventType: event.eventType,
      durationMs: inputToStateDurationMs,
      simulationConnected: deps.simulationHealth.connected,
      simulationLastError: deps.simulationHealth.lastError ?? ""
    });
  }
  return true;
};

import { describe, expect, it } from "vitest";

import type { SimulationClientEvent } from "../sim-client/sim-client.js";
import { intakeSimulationEvent, type SimulationEventIntakeDeps } from "./simulation-event-intake.js";

const resolved = (commandId: string): SimulationClientEvent => ({ eventType: "COMMAND_RESOLVED", commandId, playerId: "p1" });

const setup = (slowInputToStateWarnMs = 1_000) => {
  const logged: Array<{ level: string; event: string }> = [];
  const latencies: number[] = [];
  const deps: SimulationEventIntakeDeps = {
    recordGatewayEvent: (level, event) => logged.push({ level, event }),
    pendingInputToStateByCommandId: new Map([["c1", 1_000]]),
    observeInputToStateLatencyMs: (ms) => latencies.push(ms),
    slowInputToStateWarnMs,
    simulationHealth: { connected: true },
    now: () => 1_250
  };
  return { deps, logged, latencies };
};

describe("intakeSimulationEvent", () => {
  it("flags the first response to a player-submitted command and records its latency once", () => {
    const { deps, latencies } = setup();
    expect(intakeSimulationEvent(resolved("c1"), deps)).toBe(true);
    expect(intakeSimulationEvent(resolved("c1"), deps)).toBe(false);
    expect(latencies).toEqual([250]);
  });

  it("warns on slow input-to-state and skips logging bootstrap events", () => {
    const { deps, logged } = setup(100);
    intakeSimulationEvent(resolved("c1"), deps);
    intakeSimulationEvent(resolved("bootstrap:p1"), deps);
    expect(logged).toEqual([
      { level: "info", event: "gateway_simulation_event_received" },
      { level: "warn", event: "gateway_input_to_state_slow" }
    ]);
  });
});

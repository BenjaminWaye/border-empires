import { describe, expect, it } from "vitest";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";

// A settlement whose completion timer never runs holds a development slot
// forever, and the client hides settlements well past resolvesAt -- so the
// player sees "3/3 slots used" with only one visible settle and a queue that
// never drains (prod, 2026-09-28).

const initialState = {
  tiles: [
    { x: 10, y: 10, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "FRONTIER" as const },
    {
      x: 10,
      y: 9,
      terrain: "LAND" as const,
      ownerId: "player-1",
      ownershipState: "SETTLED" as const,
      town: { name: "Home", type: "FARMING" as const, populationTier: "SETTLEMENT" as const }
    }
  ],
  activeLocks: []
};

const settleCommand: CommandEnvelope = {
  commandId: "settle-1",
  sessionId: "session-1",
  playerId: "player-1",
  clientSeq: 1,
  issuedAt: 1_000,
  type: "SETTLE",
  payloadJson: JSON.stringify({ x: 10, y: 10 })
};

const devSlotsFor = (runtime: SimulationRuntime) => runtime.exportPlayerDebugSnapshot().find((player) => player.id === "player-1")!;

describe("settlement development-slot leaks", () => {
  it("still arms the completion timer when an emit after the slot is taken throws", () => {
    const scheduledTasks: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      // Same shape as the service's tick callers: the throw is caught and logged, and the sim carries on.
      scheduleSoon: (task) => {
        try {
          task();
        } catch {
          // swallowed, like the territory-automation tick's catch
        }
      },
      scheduleAfter: (_delayMs, task) => {
        scheduledTasks.push(task);
      },
      initialState
    });
    let thrown = false;
    runtime.onEvent((event) => {
      if (event.eventType === "SETTLEMENT_STARTED" && !thrown) {
        thrown = true;
        throw new Error("emit failed");
      }
    });

    runtime.submitCommand(settleCommand);

    expect(thrown).toBe(true);
    expect(devSlotsFor(runtime).activeDevelopmentProcessCount).toBe(1);
    for (const task of scheduledTasks.splice(0)) task();
    expect(devSlotsFor(runtime).activeDevelopmentProcessCount).toBe(0);
    expect(devSlotsFor(runtime).pendingSettlementCount).toBe(0);
  });

  it("resolves a settlement whose timer never ran once it is overdue, freeing its slot", async () => {
    let nowMs = 1_000;
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      scheduleSoon: (task) => task(),
      // Drop every timer: simulates the completion timer being lost.
      scheduleAfter: () => undefined,
      initialState
    });

    runtime.submitCommand(settleCommand);
    expect(devSlotsFor(runtime).activeDevelopmentProcessCount).toBe(1);

    nowMs = 1_000 + 24 * 60 * 60 * 1000;
    expect(devSlotsFor(runtime).overduePendingSettlementCount).toBe(1);
    await runtime.tickTerritoryAutomation(nowMs);

    const after = devSlotsFor(runtime);
    expect(after.activeDevelopmentProcessCount).toBe(0);
    expect(after.pendingSettlementCount).toBe(0);
    expect(after.overdueSettlementsResolved).toBe(1);
  });

  it("does not touch a settlement that is not yet overdue", async () => {
    let nowMs = 1_000;
    const runtime = new SimulationRuntime({
      now: () => nowMs,
      scheduleSoon: (task) => task(),
      scheduleAfter: () => undefined,
      initialState
    });

    runtime.submitCommand(settleCommand);
    nowMs = 1_001;
    await runtime.tickTerritoryAutomation(nowMs);

    const after = devSlotsFor(runtime);
    expect(after.activeDevelopmentProcessCount).toBe(1);
    expect(after.overdueSettlementsResolved).toBe(0);
  });
});

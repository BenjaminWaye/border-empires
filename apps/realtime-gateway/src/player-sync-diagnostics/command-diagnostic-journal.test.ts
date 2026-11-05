import { afterEach, describe, expect, it, vi } from "vitest";
import { createCommandDiagnosticJournal } from "./command-diagnostic-journal.js";

afterEach(() => vi.useRealTimers());
describe("command diagnostic journal", () => {
  it("retains only opted-in human commands, caps commands/events, reports eviction and expires old traces", () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    const journal = createCommandDiagnosticJournal(() => ({ eventLoopMaxMs: 123, backlogPendingCount: 4 }));
    const add = (commandId: string, event: string, stage?: string) => journal.record({ at: Date.now(), level: "info", event, payload: { commandId, playerId: "p1", stage } });
    add("ai-untracked", "gateway_simulation_event_received");
    expect(journal.snapshot("p1").events).toHaveLength(0);
    for (let i = 0; i < 201; i += 1) add(`c${i}`, "gateway_frontier_stage", "received");
    for (let i = 0; i < 25; i += 1) add("c200", "gateway_simulation_event_received");
    const result = journal.snapshot("p1");
    expect(result.retention).toMatchObject({ commands: 200, commandsEvicted: 1, eventsEvicted: 2 });
    expect(result.events.find((e) => e.payload.commandId === "c1")?.payload).toMatchObject({ eventLoopMaxMs: 123, backlogPendingCount: 4 });
    expect(journal.snapshot("p2").events).toHaveLength(0);
    vi.advanceTimersByTime(30 * 60_000 + 1);
    expect(journal.snapshot("p1").retention).toMatchObject({ commands: 0, commandsEvicted: 201 });
  });
});

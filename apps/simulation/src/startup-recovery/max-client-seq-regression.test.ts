import { describe, expect, it } from "vitest";

import { InMemorySimulationCommandStore } from "../command-store/command-store.js";
import { InMemorySimulationEventStore } from "../event-store/event-store.js";
import { loadSimulationStartupRecovery } from "./startup-recovery.js";

describe("maxClientSeqByPlayer", () => {
  it("seeds maxClientSeqByPlayer from ALL commands including resolved, not just recoverable ones", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();

    await commandStore.persistQueuedCommand(
      {
        commandId: "cmd-resolved-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: "{}"
      },
      1_000
    );
    await commandStore.markAccepted("cmd-resolved-1", 1_100);
    await commandStore.markResolved("cmd-resolved-1", 1_200);

    await commandStore.persistQueuedCommand(
      {
        commandId: "cmd-resolved-2",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 5,
        issuedAt: 1_300,
        type: "EXPAND",
        payloadJson: "{}"
      },
      1_300
    );
    await commandStore.markAccepted("cmd-resolved-2", 1_350);
    await commandStore.markResolved("cmd-resolved-2", 1_400);

    const startupRecovery = await loadSimulationStartupRecovery({
      commandStore,
      eventStore
    });

    expect(startupRecovery.recoveredCommandCount).toBe(0);
    expect(startupRecovery.maxClientSeqByPlayer["player-1"]).toBe(5);
  });
});

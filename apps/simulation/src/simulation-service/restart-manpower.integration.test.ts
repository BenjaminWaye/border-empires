import { describe, expect, it } from "vitest";

import { InMemorySimulationCommandStore } from "../command-store/command-store.js";
import { InMemorySimulationEventStore } from "../event-store/event-store.js";
import { InMemorySimulationSnapshotStore } from "../snapshot-store/snapshot-store.js";
import { createSimulationService } from "./simulation-service.js";

const PLAYER_ID = "player-1";
const FIXED_NOW_MS = 1_000;

const bootSim = (stores: {
  commandStore: InMemorySimulationCommandStore;
  eventStore: InMemorySimulationEventStore;
  snapshotStore: InMemorySimulationSnapshotStore;
}) =>
  createSimulationService({
    ...stores,
    // Periodic checkpoints effectively off: only the shutdown checkpoint can
    // carry the post-spend manpower across the restart.
    checkpointEveryEvents: 1_000_000_000,
    runtimeOptions: { now: () => FIXED_NOW_MS },
    seedProfile: "default",
    enableAiAutopilot: false,
    enableSystemAutopilot: false,
    allowSeedRecoveryFallback: true,
    port: 0
  });

const manpowerOf = (state: { players: Array<{ id: string; manpower: number }> }): number | undefined =>
  state.players.find((player) => player.id === PLAYER_ID)?.manpower;

describe("manpower across a graceful restart", () => {
  it("keeps manpower spent since the last periodic checkpoint spent (no refund on deploy)", async () => {
    const stores = {
      commandStore: new InMemorySimulationCommandStore(),
      eventStore: new InMemorySimulationEventStore(),
      snapshotStore: new InMemorySimulationSnapshotStore()
    };
    const before = await bootSim(stores);
    const startingManpower = manpowerOf(before.runtime.exportState());
    before.runtime.submitCommand({
      commandId: "restart-manpower-expand",
      sessionId: "session-1",
      playerId: PLAYER_ID,
      clientSeq: 1,
      issuedAt: FIXED_NOW_MS,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const spentManpower = manpowerOf(before.runtime.exportState());
    expect(spentManpower).toBeLessThan(startingManpower!);
    await before.close();

    const after = await bootSim(stores);
    const restartedManpower = manpowerOf(after.runtime.exportState());
    await after.close();

    expect(restartedManpower).toBe(spentManpower);
  });
});

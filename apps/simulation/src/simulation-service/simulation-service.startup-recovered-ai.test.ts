import { describe, expect, it } from "vitest";
import { InMemorySimulationCommandStore } from "../command-store/command-store.js";
import { InMemorySimulationEventStore } from "../event-store/event-store.js";
import { InMemorySimulationSnapshotStore, buildSimulationSnapshotSections } from "../snapshot-store/snapshot-store.js";
import { createSeedWorld } from "../seed-state/seed-state.js";
import { createSimulationService } from "./simulation-service.js";
import { InMemorySeasonSummaryStore } from "../season-summary-store.js";

describe("simulation service recovered AI roster", () => {
  it("uses recovered player identities for AI autopilot instead of seed-profile fallbacks", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();
    // Recovery roster selection is independent of terrain generation. The
    // small fixture keeps this test focused on ten recovered vs twenty seed AIs.
    const seed = createSeedWorld("stress-10ai");
    await snapshotStore.saveSnapshot({
      lastAppliedEventId: 0,
      snapshotSections: buildSimulationSnapshotSections({
        initialState: {
          tiles: [...seed.tiles.values()],
          players: [...seed.players.values()].map((player) => ({ id: player.id, isAi: player.isAi })),
          activeLocks: []
        },
        commands: [],
        eventsByCommandId: new Map()
      }),
      createdAt: 1_000
    });

    const service = await createSimulationService({
      seedProfile: "stress-20ai",
      requireDurableStartupState: true,
      commandStore,
      eventStore,
      snapshotStore,
      seasonSummaryStore: new InMemorySeasonSummaryStore(),
      enableAiAutopilot: true,
      log: {
        info: () => undefined,
        error: () => undefined,
        warn: () => undefined
      }
    });

    try {
      expect(service.renderMetrics()).toContain("sim_ai_autopilot_enabled 1");
      expect(service.renderMetrics()).toContain("sim_ai_autopilot_player_count 10");
    } finally {
      await service.close();
    }
  });

});

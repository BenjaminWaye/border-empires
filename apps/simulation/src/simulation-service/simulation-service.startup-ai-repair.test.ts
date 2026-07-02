import { describe, expect, it } from "vitest";

import { InMemorySimulationCommandStore } from "../command-store/command-store.js";
import { InMemorySimulationEventStore } from "../event-store/event-store.js";
import { InMemorySimulationSnapshotStore, buildSimulationSnapshotSections } from "../snapshot-store/snapshot-store.js";
import { createSimulationService } from "./simulation-service.js";
import { InMemorySeasonSummaryStore } from "../season-summary-store.js";

// Regression coverage for the startup zero-gross-income repair pass and,
// specifically, the "AI 6"-"AI 20" frozen-empire bug: an "ai-<n>" record
// that is missing from the recovered player list (but still owns territory)
// must both (a) come back out of repair flagged isAi: true, not human, and
// (b) be fed into the autopilot's active-player roster on that same
// startup. Before that fix, case (a) alone was not enough — the repaired id
// never reached the autopilot's identity map, so the AI record stayed
// permanently frozen until a manual fix.
describe("simulation service startup recovery — zero-gross-income repair", () => {
  it("persists startup zero-gross settlement repair events after handlers attach", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();
    await snapshotStore.saveSnapshot({
      lastAppliedEventId: 0,
      snapshotSections: buildSimulationSnapshotSections({
        initialState: {
          tiles: [
            {
              x: 99,
              y: 99,
              terrain: "LAND",
              ownerId: "stranded-player",
              ownershipState: "SETTLED",
              town: {
                name: "Stranded Town",
                type: "FARMING",
                populationTier: "TOWN"
              }
            }
          ],
          activeLocks: []
        },
        commands: [],
        eventsByCommandId: new Map()
      }),
      createdAt: 1_000
    });

    const service = await createSimulationService({
      seedProfile: "season-20ai",
      requireDurableStartupState: true,
      commandStore,
      eventStore,
      snapshotStore,
      seasonSummaryStore: new InMemorySeasonSummaryStore(),
      log: {
        info: () => undefined,
        error: () => undefined
      }
    });

    const tiles = service.runtime.exportState().tiles;
    expect(tiles).toContainEqual(
      expect.objectContaining({
        x: 99,
        y: 99,
        ownerId: "stranded-player",
        townName: "Stranded Town",
        townPopulationTier: "TOWN"
      })
    );
    expect(
      tiles.some(
        (tile) =>
          tile.ownerId === "stranded-player" &&
          tile.townPopulationTier === "SETTLEMENT" &&
          !(tile.x === 99 && tile.y === 99)
      )
    ).toBe(true);

    await service.close();
    const persistedRepairEvents = (await eventStore.loadAllEvents()).filter((event) =>
      event.commandId.startsWith("startup-gross-income-settlement:stranded-player")
    );
    expect(persistedRepairEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["TILE_YIELD_ANCHOR_UPDATED", "TILE_DELTA_BATCH"])
    );
  });

  it("feeds an ai-<n> id repaired by the zero-gross-income startup pass into the AI autopilot roster", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();
    await snapshotStore.saveSnapshot({
      lastAppliedEventId: 0,
      snapshotSections: buildSimulationSnapshotSections({
        initialState: {
          tiles: [
            {
              x: 42,
              y: 42,
              terrain: "LAND",
              ownerId: "ai-6",
              ownershipState: "SETTLED",
              town: {
                name: "ai-6",
                type: "FARMING",
                populationTier: "SETTLEMENT"
              }
            }
          ],
          activeLocks: []
        },
        commands: [],
        eventsByCommandId: new Map()
      }),
      createdAt: 1_000
    });

    const service = await createSimulationService({
      // "default" seed profile only ever contains player-1/player-2, never
      // an "ai-6" id, so if the autopilot roster reports ai-6 it can only
      // have arrived there via the repair-pass fix, not a seed fallback.
      seedProfile: "default",
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

    // player-2 (seed default AI) + the repaired ai-6.
    expect(service.renderMetrics()).toContain("sim_ai_autopilot_player_count 2");

    await service.close();
  });
});

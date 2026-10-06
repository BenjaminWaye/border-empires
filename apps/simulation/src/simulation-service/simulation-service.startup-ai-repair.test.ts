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
  // A stranded human with zero income and no AFC used to get an AFC dropped on
  // neutral land here. They now rebuild it themselves for free, so the repair
  // stands down. (Persisting startup AFC grants for AI is covered below.)
  it("does not drop an AFC on neutral land for a stranded AFC-less human at startup", async () => {
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
    expect(tiles.some((tile) => tile.ownerId === "stranded-player" && Boolean(tile.afcJson))).toBe(false);

    await service.close();
    const persistedRepairEvents = (await eventStore.loadAllEvents()).filter((event) =>
      event.commandId.startsWith("startup-gross-income-settlement:stranded-player")
    );
    expect(persistedRepairEvents).toEqual([]);
    // seedProfile: "season-20ai" bootstraps a full 20-AI world inline during
    // createSimulationService — real, variable-cost work (unlike the
    // "default" profile the sibling test below uses). This deterministic
    // fixed-seed bootstrap alone measures ~22s (see seed-state.test.ts),
    // which after rebalancing worldgen-coastline-style.ts's octave weights
    // (see that file) leaves only ~8s of headroom against the previous
    // 30s budget -- widened for margin, not because this got slower itself.
  }, 60_000);

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


describe("simulation startup — AFCs for AI empires that never log in", () => {
  it("persists an AFC grant for an existing AI with a productive settlement", async () => {
    const eventStore = new InMemorySimulationEventStore();
    const snapshotStore = new InMemorySimulationSnapshotStore();
    const tiles: Array<{ x: number; y: number; terrain: "LAND" }> = [];
    for (let x = 0; x < 40; x++) {
      for (let y = 0; y < 40; y++) tiles.push({ x, y, terrain: "LAND" });
    }
    await snapshotStore.saveSnapshot({
      lastAppliedEventId: 0,
      snapshotSections: buildSimulationSnapshotSections({
        initialState: {
          tiles: [...tiles, {
            x: 15, y: 15, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED",
            town: { name: "AI Home", type: "FARMING", populationTier: "SETTLEMENT" }
          }],
          players: [{ id: "ai-1", isAi: true, points: 1000, manpower: 1000 }],
          activeLocks: []
        },
        commands: [], eventsByCommandId: new Map()
      }),
      createdAt: 1000
    });
    const service = await createSimulationService({
      seedProfile: "default", requireDurableStartupState: true,
      commandStore: new InMemorySimulationCommandStore(), eventStore, snapshotStore,
      seasonSummaryStore: new InMemorySeasonSummaryStore(),
      log: { info: () => undefined, error: () => undefined }
    });
    try {
      const ownedAfcs = service.runtime.exportState().tiles.filter((tile) => tile.ownerId === "ai-1" && tile.afcJson);
      expect(ownedAfcs).toHaveLength(1);
      expect(JSON.parse(ownedAfcs[0]!.afcJson!)).toMatchObject({ ownerId: "ai-1", status: "active" });
      expect(service.runtime.exportState().tiles.find((tile) => tile.x === 15 && tile.y === 15)?.townName).toBe("AI Home");
    } finally {
      await service.close();
    }
    expect((await eventStore.loadAllEvents()).some((event) => event.commandId.startsWith("afc-migration:ai-1:"))).toBe(true);
  });
});

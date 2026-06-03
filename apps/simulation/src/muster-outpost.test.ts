import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import { SimulationRuntime } from "./runtime.js";
import { SWEEP_BUDGET_CAP } from "@border-empires/shared";

const makePlayer = (id: string) => ({
  id,
  isAi: false,
  points: 10_000,
  manpower: 150,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

const buildRuntime = () =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", makePlayer("player-1")],
      ["player-2", makePlayer("player-2")]
    ]),
    initialState: {
      tiles: [
        // Player-1 owns a settled tile with a fully-charged, sweep-active siege outpost.
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          siegeOutpost: {
            ownerId: "player-1",
            status: "active",
            variant: "SIEGE_OUTPOST",
            sweepBudget: SWEEP_BUDGET_CAP,
            sweepActive: true,
            sweepBudgetUpdatedAt: 1_000
          }
        },
        // Adjacent enemy frontier tile — the outpost would normally auto-capture this.
        { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
      ],
      activeLocks: []
    }
  });

describe("Phase 6: outpost sweep gate", () => {
  it("does NOT auto-capture adjacent enemy tile when MUSTER_SYSTEM_ENABLED is true", () => {
    const runtime = buildRuntime();
    // Tick the territory automation several times — enough for a sweep attack to fire if enabled.
    for (let i = 0; i < 10; i++) {
      runtime.tickTerritoryAutomation(1_000 + i * 5_000);
    }
    const enemy = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 11);
    expect(enemy?.ownerId).toBe("player-2");
  });
});

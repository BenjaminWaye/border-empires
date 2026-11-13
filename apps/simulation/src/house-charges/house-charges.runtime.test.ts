import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildChargeWorld } from "./house-charges.test-helpers.js";

// End-to-end through the real runtime: the side ticker deals charges to a
// landed House, and they survive a snapshot -> cold boot round trip.
const humanPlayer = (id: string) => ({
  id,
  isAi: false,
  points: 1_000,
  manpower: 1_000,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

describe("House Charges in the runtime", () => {
  it("deals charges from the side ticker and keeps them across a snapshot round trip", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["p1", humanPlayer("p1")]]),
      seedTiles: new Map(),
      initialState: { tiles: [...buildChargeWorld().values()], activeLocks: [] }
    });
    runtime.tickSideTickers(1_000);
    const dealt = runtime.exportState().players.find((player) => player.id === "p1")?.houseCharges;
    expect(dealt?.offered.length).toBe(3);
    expect(dealt?.keptIds).toHaveLength(2);

    const sections = runtime.exportSnapshotSections();
    const restarted = new SimulationRuntime({ now: () => 2_000, seedTiles: new Map(), initialState: sections.initialState });
    expect(restarted.exportState().players.find((player) => player.id === "p1")?.houseCharges).toEqual(dealt);
  });
});

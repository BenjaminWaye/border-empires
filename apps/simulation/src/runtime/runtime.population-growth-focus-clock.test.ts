// Town focus applies right after the growth tick (town-focus-promotion.ts). A town skipped by that tick keeps an
// old growth clock and is paid the whole stall on its first growing tick, so a focus picked just before a stall
// ends would be paid for hours it was not in force. The tick restarts the clock for a town with a pending focus.
import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";

const T0 = 1_700_000_000_000;
const HOUR = 60 * 60_000;
const player = {
  id: "p1", isAi: false, points: 500, manpower: 100, techIds: new Set<string>(), domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 5 }, techRootId: "rewrite-local", allies: new Set<string>(),
  strategicResources: { FOOD: 999_999, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
};
const food = [11, 12].map((x) => ({ x, y: 10, terrain: "LAND" as const, ownerId: "p1", ownershipState: "SETTLED" as const, resource: "FISH" as const }));
const shockedTown = (pendingFocus?: "GROWTH") => ({
  x: 10, y: 10, terrain: "LAND" as const, ownerId: "p1", ownershipState: "SETTLED" as const,
  town: {
    type: "FARMING" as const, populationTier: "TOWN" as const, population: 50_000, maxPopulation: 5_000_000, isFed: true,
    captureShockUntil: T0 + 30_000, ...(pendingFocus ? { pendingFocus, pendingFocusAt: T0 } : {})
  }
});
const runtimeWith = (tile: ReturnType<typeof shockedTown>): { runtime: SimulationRuntime; clock: Map<string, number> } => {
  const runtime = new SimulationRuntime({ now: () => T0, initialPlayers: new Map([["p1", player]]), initialState: { tiles: [tile, ...food], activeLocks: [] } });
  // The town last grew three hours ago and has been stalled since.
  const clock = runtime["townLastGrowthTickAtByKey"] as Map<string, number>;
  clock.set("10,10", T0 - 3 * HOUR);
  return { runtime, clock };
};

describe("population growth clock and town focus", () => {
  it("restarts a stalled town's growth clock on the tick its new focus applies", () => {
    const { runtime, clock } = runtimeWith(shockedTown("GROWTH"));
    runtime.tickPopulationGrowth(T0);
    expect(clock.get("10,10")).toBe(T0);
    const town = JSON.parse(runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10)!.townJson!) as { focus?: string };
    expect(town.focus).toBe("GROWTH");
  });

  it("leaves a stalled town's clock alone when no focus change is pending", () => {
    const { runtime, clock } = runtimeWith(shockedTown());
    runtime.tickPopulationGrowth(T0);
    expect(clock.get("10,10")).toBe(T0 - 3 * HOUR);
  });
});

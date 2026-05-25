import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";

// Regression: passive defensive fire from forts and siege/light outposts
// (sweep) creates playerId-scoped combat locks via territory-automation,
// arriving every ~3 s as long as a valid target is in range. Before this
// fix, those locks made the AI strategic planner see `active_lock` every
// tick and emit a noop forever, starving the AI of all EXPAND/SETTLE/ATTACK
// commands. Symptom in prod: ai-2 stuck on `active_lock` in
// sim_ai_noop_recent indefinitely. Player-issued frontier locks must still
// gate the planner.
describe("planner active-lock gating", () => {
  const seedPlayer = (id: string) => ({
    id,
    isAi: id.startsWith("ai-"),
    points: 1_000,
    manpower: 500,
    techIds: new Set<string>(),
    domainIds: new Set<string>(),
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    techRootId: "rewrite-local",
    allies: new Set<string>(),
    strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 }
  });

  const buildRuntime = (commandId: string): SimulationRuntime =>
    new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([["ai-2", seedPlayer("ai-2")]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "ai-2", ownershipState: "SETTLED" },
          { x: 11, y: 10, terrain: "LAND", ownerId: "ai-2", ownershipState: "FRONTIER" }
        ],
        activeLocks: [
          {
            commandId,
            playerId: "ai-2",
            actionType: "ATTACK",
            originX: 10,
            originY: 10,
            targetX: 11,
            targetY: 10,
            originKey: "10,10",
            targetKey: "11,10",
            // Far enough in the future that the setTimeout has not fired.
            resolvesAt: 120_000
          }
        ]
      }
    });

  it("ignores territory-auto locks when reporting hasActiveLock to the planner", () => {
    const runtime = buildRuntime("territory-auto:fort:ai-2:11,10:60000:1");
    const [view] = runtime.exportPlannerPlayerViews(["ai-2"]);
    expect(view).toBeDefined();
    expect(view?.hasActiveLock).toBe(false);
  });

  it("still gates the planner on player-issued frontier locks", () => {
    const runtime = buildRuntime("player-issued-attack-1");
    const [view] = runtime.exportPlannerPlayerViews(["ai-2"]);
    expect(view).toBeDefined();
    expect(view?.hasActiveLock).toBe(true);
  });
});

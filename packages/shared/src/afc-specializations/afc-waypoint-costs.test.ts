import { describe, expect, it } from "vitest";
import { planWaypoint } from "../waypoint-planner/waypoint-planner.js";
import type { WaypointPlannerState } from "../waypoint-planner/waypoint-planner-types.js";
import { requiredMusterForFort } from "../structure-costs/structure-costs.js";

describe("AFC waypoint commitment costs", () => {
  it("plans Sapper and Defensive Depth using the same fort baseline as normal attacks", () => {
    const state: WaypointPlannerState = { me: "p", domainIds: ["afc-vanguard-4"], dockPairs: [], allies: [], activeTruces: [], tiles: new Map([
      ["0,0", { x: 0, y: 0, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED" }],
      ["1,0", { x: 1, y: 0, terrain: "LAND", ownerId: "e", ownershipState: "SETTLED", fort: { status: "active", variant: "FORT", attackCommitmentMult: 2 } }]
    ]) };
    const plan = planWaypoint({ x: 1, y: 0 }, { state, keyFor: (x, y) => `${x},${y}`, isInReach: () => true });
    expect(plan.steps[0]?.manpowerCost).toBe(requiredMusterForFort("FORT"));
    state.domainIds = [];
    expect(planWaypoint({ x: 1, y: 0 }, { state, keyFor: (x, y) => `${x},${y}`, isInReach: () => true }).steps[0]?.manpowerCost).toBe(requiredMusterForFort("FORT") * 2);
  });
});

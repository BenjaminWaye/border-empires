import { describe, expect, it } from "vitest";
import { planRelayBeaconWithFoodWait } from "./relay-beacon-food-wait.js";
import type { StructurePlannerPlayer } from "./structure-command-planner.js";

const player: StructurePlannerPlayer = { id: "ai-1", points: 1_000, manpower: 1_000, techIds: [], slotSupplyByResource: { FOOD: 10 }, slotDemandByResource: { FOOD: 10 } };

describe("planRelayBeaconWithFoodWait", () => {
  it("never reports a beacon waiting on FOOD while a core threat would veto building it", () => {
    const plan = planRelayBeaconWithFoodWait(player, [], new Map(), [], undefined, { spacing: 0 });
    expect(plan.waitingOnFood({ frontPosture: "BREAK", pressureThreatensCore: true })).toBe(false);
  });

  it("reports nothing waiting when no site exists even with a spare FOOD slot", () => {
    const plan = planRelayBeaconWithFoodWait(player, [], new Map(), [], undefined, { spacing: 0 });
    expect(plan.build).toBeUndefined();
    expect(plan.waitingOnFood({ frontPosture: "BREAK", pressureThreatensCore: false })).toBe(false);
  });
});

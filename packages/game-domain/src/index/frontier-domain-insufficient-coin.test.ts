import { describe, expect, it } from "vitest";
import { validateFrontierCommand } from "./index.js";

// The client matches these exact messages to pick its "not enough coin"
// alert, so the currency must be spelled "coin", not "gold".
const baseInput = {
  now: 1_000,
  actor: { id: "p1", isAi: false, points: 5, manpower: 100, techIds: new Set<string>(), allies: new Set<string>() },
  from: { x: 10, y: 10, terrain: "LAND" as const, ownerId: "p1", ownershipState: "FRONTIER" as const },
  actionGoldCost: 10,
  isAdjacent: true,
  isDockCrossing: false,
  isBridgeCrossing: false,
  targetShielded: false,
  crossingBlockedByAetherWall: false,
  defenderIsAlliedOrTruced: false,
  originMuster: 100
};

describe("frontier validation insufficient coin messages", () => {
  it("names coin when an attack is unaffordable", () => {
    const result = validateFrontierCommand({
      ...baseInput,
      actionType: "ATTACK",
      to: { x: 10, y: 11, terrain: "LAND", ownerId: "p2", ownershipState: "FRONTIER" }
    });
    expect(result).toMatchObject({ ok: false, code: "INSUFFICIENT_GOLD", message: "insufficient coin for attack" });
  });

  it("names coin when a frontier claim is unaffordable", () => {
    const result = validateFrontierCommand({
      ...baseInput,
      actionType: "EXPAND",
      to: { x: 11, y: 11, terrain: "LAND" }
    });
    expect(result).toMatchObject({ ok: false, code: "INSUFFICIENT_GOLD", message: "insufficient coin for frontier claim" });
  });
});

import { describe, expect, it } from "vitest";
import { FRONTIER_CLAIM_MS } from "@border-empires/shared";
import { validateFrontierCommand } from "./index.js";

describe("game domain frontier validation", () => {
  it("accepts a valid attack without runtime dependencies", () => {
    const result = validateFrontierCommand({
      now: 1_000,
      actor: {
        id: "p1",
        isAi: false,
        points: 100,
        manpower: 100,
        techIds: new Set<string>(),
        allies: new Set<string>()
      },
      actionType: "ATTACK",
      from: { x: 10, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" },
      to: { x: 10, y: 11, terrain: "LAND", ownerId: "p2", ownershipState: "FRONTIER" },
      actionGoldCost: 10,
      breakthroughGoldCost: 30,
      breakthroughRequiredTechId: "breach-doctrine",
      isAdjacent: true,
      isDockCrossing: false,
      isBridgeCrossing: false,
      targetShielded: false,
      defenderIsAlliedOrTruced: false
    });

    expect(result).toMatchObject({
      ok: true,
      origin: { x: 10, y: 10 },
      target: { x: 10, y: 11 }
    });
  });

  it("uses frontier claim timing for expand", () => {
    const result = validateFrontierCommand({
      now: 1_000,
      actor: {
        id: "p1",
        isAi: false,
        points: 100,
        manpower: 100,
        techIds: new Set<string>(),
        allies: new Set<string>()
      },
      actionType: "EXPAND",
      from: { x: 10, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" },
      to: { x: 11, y: 11, terrain: "LAND" },
      actionGoldCost: 1,
      breakthroughGoldCost: 30,
      breakthroughRequiredTechId: "breach-doctrine",
      isAdjacent: true,
      isDockCrossing: false,
      isBridgeCrossing: false,
      targetShielded: false,
      defenderIsAlliedOrTruced: false
    });

    expect(result).toMatchObject({
      ok: true,
      resolvesAt: 1_000 + FRONTIER_CLAIM_MS
    });
  });

  it("returns LOCKED instead of ATTACK_COOLDOWN when origin lock belongs to another player", () => {
    const result = validateFrontierCommand({
      now: 1_000,
      actor: {
        id: "p1",
        isAi: false,
        points: 100,
        manpower: 100,
        techIds: new Set<string>(),
        allies: new Set<string>()
      },
      actionType: "ATTACK",
      from: { x: 10, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" },
      to: { x: 10, y: 11, terrain: "LAND", ownerId: "p2", ownershipState: "FRONTIER" },
      originLockedUntil: 1_500,
      originLockOwnerId: "p2",
      actionGoldCost: 10,
      breakthroughGoldCost: 30,
      breakthroughRequiredTechId: "breach-doctrine",
      isAdjacent: true,
      isDockCrossing: false,
      isBridgeCrossing: false,
      targetShielded: false,
      defenderIsAlliedOrTruced: false
    });

    expect(result).toEqual({
      ok: false,
      code: "LOCKED",
      message: "tile locked in combat"
    });
  });
});

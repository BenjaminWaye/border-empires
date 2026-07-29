import { describe, expect, it } from "vitest";
import { EXPAND_MANPOWER_COST, FRONTIER_CLAIM_MS } from "@border-empires/shared";
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

  // Manpower-economy rewrite (docs/manpower-economy-rewrite-plan.md §4.2): EXPAND
  // now costs EXPAND_MANPOWER_COST manpower — it is no longer free.
  it("allows EXPAND onto neutral land when manpower covers EXPAND_MANPOWER_COST", () => {
    const result = validateFrontierCommand({
      now: 1_000,
      actor: {
        id: "p1",
        isAi: false,
        points: 100,
        manpower: EXPAND_MANPOWER_COST,
        techIds: new Set<string>(),
        allies: new Set<string>()
      },
      actionType: "EXPAND",
      from: { x: 10, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" },
      to: { x: 11, y: 11, terrain: "LAND" },
      actionGoldCost: 1,
      isAdjacent: true,
      isDockCrossing: false,
      isBridgeCrossing: false,
      targetShielded: false,
      defenderIsAlliedOrTruced: false
    });

    expect(result).toMatchObject({ ok: true, manpowerMin: EXPAND_MANPOWER_COST, manpowerCost: EXPAND_MANPOWER_COST });
  });

  it("rejects EXPAND with INSUFFICIENT_MANPOWER when below EXPAND_MANPOWER_COST", () => {
    const result = validateFrontierCommand({
      now: 1_000,
      actor: {
        id: "p1",
        isAi: false,
        points: 100,
        manpower: EXPAND_MANPOWER_COST - 1,
        techIds: new Set<string>(),
        allies: new Set<string>()
      },
      actionType: "EXPAND",
      from: { x: 10, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" },
      to: { x: 11, y: 11, terrain: "LAND" },
      actionGoldCost: 1,
      isAdjacent: true,
      isDockCrossing: false,
      isBridgeCrossing: false,
      targetShielded: false,
      defenderIsAlliedOrTruced: false
    });

    expect(result).toMatchObject({ ok: false, code: "INSUFFICIENT_MANPOWER", message: expect.stringContaining("claim frontier") });
  });

  it("rejects ATTACK when manpower is below the attack minimum", () => {
    const result = validateFrontierCommand({
      now: 1_000,
      actor: {
        id: "p1",
        isAi: false,
        points: 100,
        manpower: 10,
        techIds: new Set<string>(),
        allies: new Set<string>()
      },
      actionType: "ATTACK",
      from: { x: 10, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" },
      to: { x: 10, y: 11, terrain: "LAND", ownerId: "p2", ownershipState: "FRONTIER" },
      actionGoldCost: 10,
      isAdjacent: true,
      isDockCrossing: false,
      isBridgeCrossing: false,
      targetShielded: false,
      defenderIsAlliedOrTruced: false
    });

    expect(result).toMatchObject({ ok: false, code: "INSUFFICIENT_MANPOWER" });
  });

  it("scales attack manpower by fortification strength", () => {
    const cases = [
      {
        label: "wooden fort",
        manpower: 90,
        to: {
          x: 10,
          y: 11,
          terrain: "LAND" as const,
          ownerId: "p2",
          ownershipState: "FRONTIER" as const,
          economicStructure: { ownerId: "p2", type: "WOODEN_FORT" as const, status: "active" as const }
        }
      },
      {
        label: "active fort",
        manpower: 300,
        to: {
          x: 10,
          y: 11,
          terrain: "LAND" as const,
          ownerId: "p2",
          ownershipState: "FRONTIER" as const,
          fort: { ownerId: "p2", status: "active" as const }
        }
      },
      {
        label: "iron bastion",
        manpower: 600,
        to: {
          x: 10,
          y: 11,
          terrain: "LAND" as const,
          ownerId: "p2",
          ownershipState: "FRONTIER" as const,
          fort: { ownerId: "p2", status: "active" as const, variant: "IRON_BASTION" as const }
        }
      },
      {
        label: "thunder bastion",
        manpower: 1_200,
        to: {
          x: 10,
          y: 11,
          terrain: "LAND" as const,
          ownerId: "p2",
          ownershipState: "FRONTIER" as const,
          fort: { ownerId: "p2", status: "active" as const, variant: "THUNDER_BASTION" as const }
        }
      }
    ];

    for (const testCase of cases) {
      const result = validateFrontierCommand({
        now: 1_000,
        actor: {
          id: "p1",
          isAi: false,
          points: 100,
          manpower: testCase.manpower,
          techIds: new Set<string>(),
          allies: new Set<string>()
        },
        actionType: "ATTACK",
        from: { x: 10, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" },
        to: testCase.to,
        actionGoldCost: 10,
        isAdjacent: true,
        isDockCrossing: false,
        isBridgeCrossing: false,
        targetShielded: false,
        defenderIsAlliedOrTruced: false
      });

      expect(result, testCase.label).toMatchObject({
        ok: true,
        manpowerMin: testCase.manpower,
        manpowerCost: testCase.manpower
      });
    }
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

  it("uses expandClaimDurationMs override for EXPAND when provided", () => {
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
      isAdjacent: true,
      isDockCrossing: false,
      isBridgeCrossing: false,
      targetShielded: false,
      defenderIsAlliedOrTruced: false,
      expandClaimDurationMs: FRONTIER_CLAIM_MS * 4
    });

    expect(result).toMatchObject({
      ok: true,
      resolvesAt: 1_000 + FRONTIER_CLAIM_MS * 4
    });
  });

  it("allows EXPAND from an origin lock owned by the same player", () => {
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
      to: { x: 10, y: 11, terrain: "LAND" },
      originLockedUntil: 1_500,
      originLockOwnerId: "p1",
      actionGoldCost: 10,
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

  it("accepts a non-adjacent expand when isBridgeCrossing is true", () => {
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
      from: { x: 0, y: 0, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" },
      to: { x: 0, y: 5, terrain: "LAND" },
      actionGoldCost: 10,
      isAdjacent: false,
      isDockCrossing: false,
      isBridgeCrossing: true,
      targetShielded: false,
      defenderIsAlliedOrTruced: false
    });

    expect(result).toMatchObject({
      ok: true,
      origin: { x: 0, y: 0 },
      target: { x: 0, y: 5 }
    });
  });

  it("rejects a non-adjacent expand when isBridgeCrossing is false", () => {
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
      from: { x: 0, y: 0, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" },
      to: { x: 0, y: 5, terrain: "LAND" },
      actionGoldCost: 10,
      isAdjacent: false,
      isDockCrossing: false,
      isBridgeCrossing: false,
      targetShielded: false,
      defenderIsAlliedOrTruced: false
    });

    expect(result).toMatchObject({
      ok: false,
      code: "NOT_ADJACENT"
    });
  });
});

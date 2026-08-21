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
      defenderIsAlliedOrTruced: false,
      originMuster: 100
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

  it("rejects ATTACK when the origin tile's mustered manpower is below the requirement", () => {
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
      defenderIsAlliedOrTruced: false,
      originMuster: 10
    });

    expect(result).toMatchObject({ ok: false, code: "INSUFFICIENT_MUSTER" });
  });

  // Fort-based attack-cost scaling no longer lives here — under the muster
  // system, the caller (SimulationRuntime.requiredMusterForTarget) computes
  // the required muster from the target's *actual* live garrison count, not
  // a static per-fort-tier table, and passes the result in as `requiredMuster`.
  // That scaling behavior is covered by
  // apps/simulation/src/runtime-muster-tick/muster-fort-garrison.test.ts.
  // This test just confirms validateFrontierCommand still honors whatever
  // requiredMuster it's given for manpowerMin/manpowerCost.
  it("honors an explicit requiredMuster for manpowerMin/manpowerCost", () => {
    const result = validateFrontierCommand({
      now: 1_000,
      actor: {
        id: "p1",
        isAi: false,
        points: 100,
        manpower: 1_200,
        techIds: new Set<string>(),
        allies: new Set<string>()
      },
      actionType: "ATTACK",
      from: { x: 10, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" },
      to: {
        x: 10,
        y: 11,
        terrain: "LAND",
        ownerId: "p2",
        ownershipState: "FRONTIER",
        fort: { ownerId: "p2", status: "active", variant: "THUNDER_BASTION" }
      },
      actionGoldCost: 10,
      isAdjacent: true,
      isDockCrossing: false,
      isBridgeCrossing: false,
      targetShielded: false,
      defenderIsAlliedOrTruced: false,
      originMuster: 1_200,
      requiredMuster: 1_200
    });

    expect(result).toMatchObject({
      ok: true,
      manpowerMin: 1_200,
      manpowerCost: 1_200
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

  describe("fixed-border reach (isInReach)", () => {
    const actor = {
      id: "p1",
      isAi: false,
      points: 100,
      manpower: 100,
      techIds: new Set<string>(),
      allies: new Set<string>()
    };

    // EXPAND is no longer reach-gated (only SETTLE and outpost-family builds
    // still are — see runtime.ts's SETTLE gate and
    // runtime-structure-command-handlers.ts's OUT_OF_REACH build gate), so
    // these three now assert success even with isInReach: false.
    it("allows EXPAND out of reach via plain adjacency", () => {
      const result = validateFrontierCommand({
        now: 1_000,
        actor,
        actionType: "EXPAND",
        from: { x: 10, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" },
        to: { x: 11, y: 11, terrain: "LAND" },
        actionGoldCost: 1,
        isAdjacent: true,
        isDockCrossing: false,
        isBridgeCrossing: false,
        targetShielded: false,
        defenderIsAlliedOrTruced: false,
        isInReach: false
      });

      expect(result).toMatchObject({ ok: true });
    });

    it("allows EXPAND out of reach via a dock crossing", () => {
      const result = validateFrontierCommand({
        now: 1_000,
        actor,
        actionType: "EXPAND",
        from: { x: 10, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" },
        to: { x: 20, y: 20, terrain: "LAND" },
        actionGoldCost: 1,
        isAdjacent: false,
        isDockCrossing: true,
        isBridgeCrossing: false,
        targetShielded: false,
        defenderIsAlliedOrTruced: false,
        isInReach: false
      });

      expect(result).toMatchObject({ ok: true });
    });

    it("allows EXPAND out of reach via an aether bridge", () => {
      const result = validateFrontierCommand({
        now: 1_000,
        actor,
        actionType: "EXPAND",
        from: { x: 10, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" },
        to: { x: 30, y: 30, terrain: "LAND" },
        actionGoldCost: 1,
        isAdjacent: false,
        isDockCrossing: false,
        isBridgeCrossing: true,
        targetShielded: false,
        defenderIsAlliedOrTruced: false,
        isInReach: false
      });

      expect(result).toMatchObject({ ok: true });
    });

    it("allows EXPAND when the target is in reach", () => {
      const result = validateFrontierCommand({
        now: 1_000,
        actor,
        actionType: "EXPAND",
        from: { x: 10, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" },
        to: { x: 11, y: 11, terrain: "LAND" },
        actionGoldCost: 1,
        isAdjacent: true,
        isDockCrossing: false,
        isBridgeCrossing: false,
        targetShielded: false,
        defenderIsAlliedOrTruced: false,
        isInReach: true
      });

      expect(result).toMatchObject({ ok: true });
    });

    it("does not gate ATTACK on isInReach even when explicitly false", () => {
      const result = validateFrontierCommand({
        now: 1_000,
        actor,
        actionType: "ATTACK",
        from: { x: 10, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" },
        to: { x: 10, y: 11, terrain: "LAND", ownerId: "p2", ownershipState: "FRONTIER" },
        actionGoldCost: 10,
        isAdjacent: true,
        isDockCrossing: false,
        isBridgeCrossing: false,
        targetShielded: false,
        defenderIsAlliedOrTruced: false,
        originMuster: 100,
        isInReach: false
      });

      expect(result).toMatchObject({ ok: true });
    });
  });
});

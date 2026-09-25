import { describe, expect, it } from "vitest";
import { validateFrontierCommand } from "./index.js";

// docs/replenishment-update-plan.md D6: a manual attack's commitManpower,
// when it clears the origin's available muster, raises manpowerCost above
// the floor for the odds formula (commitOddsMultiplier, frontier-combat.ts)
// and the fixed-loss-equals-commitment rule (runtime-combat-support.ts) to
// use downstream. Extracted from frontier-domain.test.ts to respect its
// line cap.
describe("commitManpower (D6 commitment choice)", () => {
  const baseInput = {
    now: 1_000,
    actor: { id: "p1", isAi: false, points: 100, manpower: 1_000, techIds: new Set<string>(), allies: new Set<string>() },
    actionType: "ATTACK" as const,
    from: { x: 10, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" as const },
    to: { x: 10, y: 11, terrain: "LAND", ownerId: "p2", ownershipState: "SETTLED" as const },
    actionGoldCost: 10,
    isAdjacent: true,
    isDockCrossing: false,
    isBridgeCrossing: false,
    targetShielded: false,
    crossingBlockedByAetherWall: false,
    defenderIsAlliedOrTruced: false,
    requiredMuster: 60
  };

  it("uses the requested commitment as manpowerCost when the origin can afford it", () => {
    const result = validateFrontierCommand({ ...baseInput, originMuster: 200, commitManpower: 150 });
    expect(result).toMatchObject({ ok: true, manpowerCost: 150, manpowerMin: 150 });
  });

  it("clamps a below-floor commitment up to the required floor", () => {
    const result = validateFrontierCommand({ ...baseInput, originMuster: 200, commitManpower: 10 });
    expect(result).toMatchObject({ ok: true, manpowerCost: 60 });
  });

  it("rejects when the origin can't fund the requested commitment", () => {
    const result = validateFrontierCommand({ ...baseInput, originMuster: 100, commitManpower: 150 });
    expect(result).toMatchObject({ ok: false, code: "INSUFFICIENT_MUSTER" });
  });

  it("falls back to the floor when no commitment is requested", () => {
    const result = validateFrontierCommand({ ...baseInput, originMuster: 200 });
    expect(result).toMatchObject({ ok: true, manpowerCost: 60 });
  });

  it("ignores commitManpower for a barbarian raid target", () => {
    const result = validateFrontierCommand({
      ...baseInput,
      to: { ...baseInput.to, ownerId: "barbarian-1" },
      originMuster: 200,
      commitManpower: 150
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.manpowerCost).not.toBe(150);
  });
});

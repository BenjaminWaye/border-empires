import { describe, expect, it } from "vitest";

import { COMBAT_GROUP_MAX_GAP_MS, combatCardsWithGroups } from "./personal-activity-combat-groups.js";
import { testCombat } from "./personal-activity-test-fixtures.js";

describe("combatCardsWithGroups", () => {
  it("folds a burst of attacks on one rival into a single group card", () => {
    const losses = [
      testCombat({ at: 1_000, x: 10 }),
      testCombat({ at: 2_000, x: 11 }),
      testCombat({ at: 3_000, x: 12, attackerWon: true, pillagedGold: 7 })
    ];
    expect(combatCardsWithGroups("me", losses, new Set([losses[0]!]))).toEqual([
      {
        kind: "COMBAT_GROUP",
        id: "combat-group:ATTACKER:maren:1000:10:10",
        occurredAt: 3_000,
        role: "ATTACKER",
        counterpartyPlayerId: "maren",
        attempts: 3,
        captures: 1,
        originsSeized: 1,
        manpowerLoss: 150,
        pillagedGold: 7,
        defenderGoldLoss: 0,
        x: 12,
        y: 10
      }
    ]);
  });

  it("keeps a lone fight as a detailed combat card", () => {
    const cards = combatCardsWithGroups("me", [testCombat({ defenseVariant: "PALISADE" })], new Set());
    expect(cards).toEqual([expect.objectContaining({ kind: "COMBAT", defenseVariant: "PALISADE" })]);
  });

  it("splits by side, rival, area and long lulls", () => {
    const cards = combatCardsWithGroups("me", [
      testCombat({ at: 1_000 }),
      testCombat({ at: 2_000 }),
      testCombat({ at: 2_000 + COMBAT_GROUP_MAX_GAP_MS + 1 }),
      testCombat({ at: 1_500, defenderId: "hugo" }),
      testCombat({ at: 1_600, attackerId: "maren", defenderId: "me" }),
      testCombat({ at: 1_700, x: 40 }),
      // Neighbouring tiles across what used to be a map-square boundary still group.
      testCombat({ at: 1_800, x: 41, defenderId: "kara" }),
      testCombat({ at: 1_900, x: 42, defenderId: "kara" })
    ], new Set());
    expect(cards.map((card) => card.kind).sort()).toEqual(["COMBAT", "COMBAT", "COMBAT", "COMBAT", "COMBAT_GROUP", "COMBAT_GROUP"]);
    expect(cards.find((card) => card.kind === "COMBAT_GROUP" && card.counterpartyPlayerId === "maren")).toMatchObject({ attempts: 2, counterpartyPlayerId: "maren", role: "ATTACKER" });
  });

  it("groups a rival's raids on different tiles from the defender's side", () => {
    const cards = combatCardsWithGroups("me", [
      testCombat({ attackerId: "kara", defenderId: "me", x: 10 }),
      testCombat({ attackerId: "kara", defenderId: "me", x: 12, at: 2_000, attackerWon: true })
    ], new Set());
    expect(cards).toEqual([expect.objectContaining({ kind: "COMBAT_GROUP", role: "DEFENDER", counterpartyPlayerId: "kara", attempts: 2, captures: 1 })]);
  });
});

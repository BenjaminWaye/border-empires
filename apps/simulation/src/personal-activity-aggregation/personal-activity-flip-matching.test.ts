import { describe, expect, it } from "vitest";

import { aggregatePersonalActivity } from "./personal-activity-aggregation.js";
import { COMBAT_FLIP_MATCH_WINDOW_MS, matchCombatToFlips } from "./personal-activity-flip-matching.js";
import { testCombat, testFlip } from "./personal-activity-test-fixtures.js";

const MINUTE = 60_000;

describe("matchCombatToFlips", () => {
  it("matches a capture to the flip that lands minutes after the attack was launched", () => {
    const capture = testCombat({ attackerId: "hugo", defenderId: "me", attackerWon: true, at: 0 });
    const flip = testFlip({ fromOwner: "me", toOwner: "hugo", at: 2 * MINUTE });
    expect(matchCombatToFlips([capture], [flip], 3 * MINUTE).consumedFlips.has(flip)).toBe(true);
  });

  it("matches a failed attack to the defender seizing its launch tile", () => {
    const repelled = testCombat({ attackerId: "maren", defenderId: "me", originX: 11, originY: 10 });
    const seized = testFlip({ x: 11, y: 10, fromOwner: "maren", toOwner: "me", at: 1_500 });
    const matches = matchCombatToFlips([repelled], [seized], 2_000);
    expect(matches.consumedFlips.has(seized)).toBe(true);
    expect(matches.originSeized.has(matches.combat[0]!)).toBe(true);
  });

  it("falls back to an adjacent tile for entries logged without an origin", () => {
    const repelled = testCombat({ attackerId: "maren", defenderId: "me" });
    expect(matchCombatToFlips([repelled], [testFlip({ x: 11, y: 11, fromOwner: "maren", toOwner: "me" })], 2_000).originSeized.size).toBe(1);
    expect(matchCombatToFlips([repelled], [testFlip({ x: 13, y: 10, fromOwner: "maren", toOwner: "me" })], 2_000).originSeized.size).toBe(0);
  });

  it("does not match flips outside the window, before the attack, or between the wrong owners", () => {
    const capture = testCombat({ attackerWon: true, at: 10 * MINUTE });
    const flips = [
      testFlip({ at: 10 * MINUTE + COMBAT_FLIP_MATCH_WINDOW_MS + 1 }),
      testFlip({ at: 10 * MINUTE - 1 }),
      testFlip({ fromOwner: "kara", at: 11 * MINUTE })
    ];
    expect(matchCombatToFlips([capture], flips, 10 * MINUTE).consumedFlips.size).toBe(0);
  });

  it("matches each flip to at most one combat", () => {
    const flip = testFlip({ at: 2_000 });
    const matches = matchCombatToFlips([testCombat({ attackerWon: true, at: 1_000 }), testCombat({ attackerWon: true, at: 1_500 })], [flip], 2_000);
    expect(matches.consumedFlips.size).toBe(1);
  });
});

describe("matchCombatToFlips outcome confirmation", () => {
  it("turns a launch-time win with no capture flip into a repelled attack once it has had time to land", () => {
    const reversed = testCombat({ attackerWon: true, pillagedGold: 30, defenderGoldLoss: 30, at: 0 });
    const matches = matchCombatToFlips([reversed], [], COMBAT_FLIP_MATCH_WINDOW_MS);
    expect(matches.combat[0]).toMatchObject({ attackerWon: false, pillagedGold: 0, defenderGoldLoss: 0 });
  });

  it("keeps a win whose flip may still be in flight", () => {
    const matches = matchCombatToFlips([testCombat({ attackerWon: true, at: 0 })], [], 10_000);
    expect(matches.combat[0]?.attackerWon).toBe(true);
  });

  it("credits a counter-attack's capture to that capture, not to an earlier failed attack's seized origin", () => {
    // Maren's attack from (11,10) fails without costing her the tile; then I take (11,10) myself.
    const failed = testCombat({ attackerId: "maren", defenderId: "me", originX: 11, originY: 10, at: 0 });
    const counter = testCombat({ attackerId: "me", defenderId: "maren", attackerWon: true, x: 11, y: 10, at: 60_000 });
    const flip = testFlip({ x: 11, y: 10, fromOwner: "maren", toOwner: "me", at: 90_000 });
    const matches = matchCombatToFlips([failed, counter], [flip], 100_000);
    expect(matches.originSeized.size).toBe(0);
    expect(matches.consumedFlips.has(flip)).toBe(true);
    expect(matches.combat.find((loss) => loss.attackerId === "me")?.attackerWon).toBe(true);
  });
});

describe("aggregatePersonalActivity duplicate rows", () => {
  it("shows a capture once and folds a seized launch tile into the repelled attack", () => {
    const timeline = aggregatePersonalActivity("me", { from: 0, to: 60 * MINUTE }, [
      testFlip({ x: 3, y: 3, fromOwner: "me", toOwner: "hugo", at: 39 * MINUTE }),
      testFlip({ x: 21, y: 20, fromOwner: "maren", toOwner: "me", at: 53 * MINUTE + 1 })
    ], [
      testCombat({ attackerId: "hugo", defenderId: "me", attackerWon: true, x: 3, y: 3, at: 37 * MINUTE }),
      testCombat({ attackerId: "maren", defenderId: "me", x: 20, y: 20, originX: 21, originY: 20, at: 53 * MINUTE })
    ]);
    expect(timeline.cards.map((card) => card.kind)).toEqual(["COMBAT", "COMBAT"]);
    expect(timeline.cards[0]).toMatchObject({ attackerId: "maren", originSeized: true });
    // Headline counts still include every flip.
    expect(timeline.summary).toMatchObject({ tilesClaimed: 1, tilesLost: 1 });
  });
});

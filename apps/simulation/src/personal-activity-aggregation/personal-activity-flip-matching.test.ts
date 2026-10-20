import { describe, expect, it } from "vitest";

import { aggregatePersonalActivity } from "./personal-activity-aggregation.js";
import { COMBAT_FLIP_MATCH_WINDOW_MS, matchCombatToFlips } from "./personal-activity-flip-matching.js";
import { testCombat, testFlip } from "./personal-activity-test-fixtures.js";

const MINUTE = 60_000;

describe("matchCombatToFlips", () => {
  it("matches a capture to the flip that lands minutes after the attack was launched", () => {
    const capture = testCombat({ attackerId: "hugo", defenderId: "me", attackerWon: true, at: 0 });
    const flip = testFlip({ fromOwner: "me", toOwner: "hugo", at: 2 * MINUTE });
    expect(matchCombatToFlips([capture], [flip]).consumedFlips.has(flip)).toBe(true);
  });

  it("matches a failed attack to the defender seizing its launch tile", () => {
    const repelled = testCombat({ attackerId: "maren", defenderId: "me", originX: 11, originY: 10 });
    const seized = testFlip({ x: 11, y: 10, fromOwner: "maren", toOwner: "me", at: 1_500 });
    const matches = matchCombatToFlips([repelled], [seized]);
    expect(matches.consumedFlips.has(seized)).toBe(true);
    expect(matches.originSeized.has(repelled)).toBe(true);
  });

  it("falls back to an adjacent tile for entries logged without an origin", () => {
    const repelled = testCombat({ attackerId: "maren", defenderId: "me" });
    expect(matchCombatToFlips([repelled], [testFlip({ x: 11, y: 11, fromOwner: "maren", toOwner: "me" })]).originSeized.size).toBe(1);
    expect(matchCombatToFlips([repelled], [testFlip({ x: 13, y: 10, fromOwner: "maren", toOwner: "me" })]).originSeized.size).toBe(0);
  });

  it("does not match flips outside the window, before the attack, or between the wrong owners", () => {
    const capture = testCombat({ attackerWon: true, at: 10 * MINUTE });
    const flips = [
      testFlip({ at: 10 * MINUTE + COMBAT_FLIP_MATCH_WINDOW_MS + 1 }),
      testFlip({ at: 10 * MINUTE - 1 }),
      testFlip({ fromOwner: "kara", at: 11 * MINUTE })
    ];
    expect(matchCombatToFlips([capture], flips).consumedFlips.size).toBe(0);
  });

  it("matches each flip to at most one combat", () => {
    const flip = testFlip({ at: 2_000 });
    const matches = matchCombatToFlips([testCombat({ attackerWon: true, at: 1_000 }), testCombat({ attackerWon: true, at: 1_500 })], [flip]);
    expect(matches.consumedFlips.size).toBe(1);
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

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

describe("matchCombatToFlips known captures", () => {
  // The 2026-10-23 prod case: a restart kept the TOWN_LOST note but dropped
  // the town tile's flip, so Kara's winning assault read as repelled and the
  // siege card said "Your Palisade is holding".
  const townLost = (overrides: Partial<{ attackerId: string; at: number; x: number }> = {}) =>
    ({ x: 10, y: 10, at: 2 * MINUTE, defenderId: "me", attackerId: "kara", ...overrides });

  it("keeps a win with no flip when a town-lost note records the capture", () => {
    const win = testCombat({ attackerId: "kara", defenderId: "me", attackerWon: true, at: 0 });
    expect(matchCombatToFlips([win], [], COMBAT_FLIP_MATCH_WINDOW_MS, [townLost()]).combat[0]?.attackerWon).toBe(true);
  });

  it("still reverses a win when the town-lost note is for another tile or captor", () => {
    const win = testCombat({ attackerId: "kara", defenderId: "me", attackerWon: true, at: 0 });
    expect(matchCombatToFlips([win], [], COMBAT_FLIP_MATCH_WINDOW_MS, [townLost({ x: 11 })]).combat[0]?.attackerWon).toBe(false);
    expect(matchCombatToFlips([win], [], COMBAT_FLIP_MATCH_WINDOW_MS, [townLost({ attackerId: "maren" })]).combat[0]?.attackerWon).toBe(false);
  });

  it("shows a dock-lost note and treats it as proof of the capture", () => {
    const timeline = aggregatePersonalActivity("me", { from: 0, to: 60 * MINUTE }, [], [
      testCombat({ attackerId: "kara", defenderId: "me", at: 0 }),
      testCombat({ attackerId: "kara", defenderId: "me", attackerWon: true, at: MINUTE })
    ], [{ id: "dock-lost:1", kind: "DOCK_LOST", playerId: "me", occurredAt: 2 * MINUTE, x: 10, y: 10, counterpartyPlayerId: "kara" }]);
    expect(timeline.cards.find((card) => card.kind === "DOCK_LOST")).toMatchObject({ counterpartyPlayerId: "kara", x: 10, y: 10 });
    expect(timeline.cards.find((card) => card.kind === "SIEGE")).toMatchObject({ outcome: "FELL", capturedBy: "kara" });
  });

  it("does not let a town note confirm a second win once a flip told the capture", () => {
    // A win reversed on landing, then the real capture: the flip and the note
    // both describe one capture, so exactly one win survives.
    const reversed = testCombat({ attackerId: "kara", defenderId: "me", attackerWon: true, pillagedGold: 20, defenderGoldLoss: 20, at: 0 });
    const real = testCombat({ attackerId: "kara", defenderId: "me", attackerWon: true, pillagedGold: 20, defenderGoldLoss: 20, at: 30_000 });
    const flip = testFlip({ fromOwner: "me", toOwner: "kara", at: 90_000 });
    const matches = matchCombatToFlips([reversed, real], [flip], 10 * COMBAT_FLIP_MATCH_WINDOW_MS, [townLost({ at: 90_000 })]);
    expect(matches.combat.filter((loss) => loss.attackerWon)).toHaveLength(1);
  });

  it("counts a coastal town's town and dock notes as one capture", () => {
    const notes = [
      { id: "town-lost:1", kind: "TOWN_LOST" as const, playerId: "me", occurredAt: 2 * MINUTE, x: 10, y: 10, counterpartyPlayerId: "kara", townTier: "CITY" as const, townSurvived: true, populationBefore: 2, populationAfter: 1, capturedStructureTypes: [] },
      { id: "dock-lost:1", kind: "DOCK_LOST" as const, playerId: "me", occurredAt: 2 * MINUTE, x: 10, y: 10, counterpartyPlayerId: "kara" }
    ];
    const timeline = aggregatePersonalActivity("me", { from: 0, to: 60 * MINUTE }, [], [
      testCombat({ attackerId: "kara", defenderId: "me", attackerWon: true, at: 0 }),
      testCombat({ attackerId: "kara", defenderId: "me", attackerWon: true, at: MINUTE })
    ], notes);
    // One win confirmed, the other read as repelled -- not two captures.
    expect(timeline.rivals.find((rival) => rival.playerId === "kara")).toMatchObject({ attacksRepelled: 1 });
  });

  it("names a dock captured with its flip once in the summary, on its own note, and not on the combat card", () => {
    const timeline = aggregatePersonalActivity("me", { from: 0, to: 60 * MINUTE }, [
      testFlip({ fromOwner: "me", toOwner: "kara", at: MINUTE })
    ], [
      testCombat({ attackerId: "kara", defenderId: "me", attackerWon: true, at: 0 })
    ], [{ id: "dock-lost:1", kind: "DOCK_LOST", playerId: "me", occurredAt: MINUTE, x: 10, y: 10, counterpartyPlayerId: "kara" }]);
    expect(timeline.summary.featuresLost).toEqual([{ kind: "DOCK", count: 1 }]);
    expect(timeline.cards.map((card) => card.kind).sort()).toEqual(["COMBAT", "DOCK_LOST"]);
    expect(timeline.cards.find((card) => card.kind === "COMBAT")).not.toHaveProperty("capturedFeatures");
  });

  it("reports the siege as fallen to the captor", () => {
    const timeline = aggregatePersonalActivity("me", { from: 0, to: 60 * MINUTE }, [], [
      testCombat({ attackerId: "kara", defenderId: "me", at: 0 }),
      testCombat({ attackerId: "kara", defenderId: "me", attackerWon: true, at: MINUTE })
    ], [{
      id: "town-lost:1", kind: "TOWN_LOST", playerId: "me", occurredAt: 2 * MINUTE, x: 10, y: 10, counterpartyPlayerId: "kara",
      townTier: "CITY", townSurvived: true, populationBefore: 50_000, populationAfter: 25_000, capturedStructureTypes: []
    }]);
    expect(timeline.cards.find((card) => card.kind === "SIEGE")).toMatchObject({ outcome: "FELL", capturedBy: "kara", assaultsRepelled: 1 });
  });
});

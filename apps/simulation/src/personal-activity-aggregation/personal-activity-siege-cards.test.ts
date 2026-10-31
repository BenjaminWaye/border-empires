import { describe, expect, it } from "vitest";

import type { CombatManpowerLoss } from "../combat-manpower-log/combat-manpower-log.js";
import type { TerritoryFlip } from "../territory-flip-log/territory-flip-log.js";
import { aggregatePersonalActivity } from "./personal-activity-aggregation.js";
import { SIEGE_MAX_GAP_MS, siegeCardsForDefender } from "./personal-activity-siege-cards.js";
import { testFlip } from "./personal-activity-test-fixtures.js";

const assault = (overrides: Partial<CombatManpowerLoss> = {}): CombatManpowerLoss => ({
  attackerId: "kael",
  defenderId: "me",
  attackerWon: false,
  manpowerLoss: 50,
  x: 4,
  y: 7,
  at: 1_000,
  pillagedGold: 0,
  defenderGoldLoss: 0,
  targetWasSettled: true,
  defenseVariant: "PALISADE",
  ...overrides
});

describe("siegeCardsForDefender", () => {
  it("folds repelled assaults and the breaking one into a single FELL siege", () => {
    const { cards, consumed } = siegeCardsForDefender("me", [
      assault({ at: 1_000 }),
      assault({ at: 2_000, attackerId: "vess", manpowerLoss: 70 }),
      assault({ at: 3_000 }),
      assault({ at: 4_000, attackerWon: true, manpowerLoss: 80, defenseVariant: "FORT" })
    ]);
    expect(cards).toEqual([
      {
        kind: "SIEGE",
        id: "siege:4:7:1000",
        occurredAt: 4_000,
        startedAt: 1_000,
        x: 4,
        y: 7,
        outcome: "FELL",
        assaultsRepelled: 3,
        originsSeized: 0,
        attackerIds: ["kael", "vess"],
        manpowerSpentAgainst: 250,
        defenseVariant: "FORT",
        capturedBy: "kael"
      }
    ]);
    expect(consumed.size).toBe(4);
  });

  it("reports a siege with no capture yet as HOLDING", () => {
    const { cards } = siegeCardsForDefender("me", [assault({ at: 1_000 }), assault({ at: 2_000 })]);
    expect(cards[0]).toMatchObject({ outcome: "HOLDING", assaultsRepelled: 2, manpowerSpentAgainst: 100 });
    expect(cards[0]?.capturedBy).toBeUndefined();
  });

  it("leaves a lone assault as a plain combat card", () => {
    const { cards, consumed } = siegeCardsForDefender("me", [assault({ attackerWon: true })]);
    expect(cards).toEqual([]);
    expect(consumed.size).toBe(0);
  });

  it("starts a fresh siege after a capture or a long lull, and keeps tiles separate", () => {
    const { cards } = siegeCardsForDefender("me", [
      assault({ at: 1_000 }),
      assault({ at: 2_000, attackerWon: true }),
      // Retaken, then attacked again: a new siege.
      assault({ at: 3_000 }),
      assault({ at: 4_000 }),
      // Long lull on the same tile: separate story, and too short to be a siege.
      assault({ at: 4_000 + SIEGE_MAX_GAP_MS + 1 }),
      // A different tile, interleaved in time.
      assault({ x: 9, y: 9, at: 1_500 }),
      assault({ x: 9, y: 9, at: 2_500 })
    ]);
    expect(cards.map((card) => [card.id, card.outcome, card.assaultsRepelled])).toEqual([
      ["siege:4:7:1000", "FELL", 1],
      ["siege:4:7:3000", "HOLDING", 2],
      ["siege:9:9:1500", "HOLDING", 2]
    ]);
  });

  it("ignores assaults where the player was the attacker", () => {
    const { cards } = siegeCardsForDefender("me", [assault({ attackerId: "me", defenderId: "kael" }), assault({ attackerId: "me", defenderId: "kael", at: 2_000 })]);
    expect(cards).toEqual([]);
  });
});

describe("aggregatePersonalActivity sieges", () => {
  it("counts launch tiles seized during a siege instead of dropping them", () => {
    const timeline = aggregatePersonalActivity("me", { from: 0, to: 10_000 }, [
      { tileId: "11,7", x: 11, y: 7, fromOwner: "kael", toOwner: "me", at: 2_010 }
    ], [assault({ at: 1_000 }), assault({ at: 2_000, originX: 11, originY: 7 })]);
    expect(timeline.cards).toEqual([expect.objectContaining({ kind: "SIEGE", outcome: "HOLDING", originsSeized: 1 })]);
  });

  it("does not report a fall when the breaking assault never captured the tile", () => {
    // Regression: the third assault rolled a win at launch, but a fort ward
    // reversed it on landing, so no ownership flip was ever logged.
    const HOUR = 60 * 60_000;
    const timeline = aggregatePersonalActivity("me", { from: 0, to: 2 * HOUR }, [], [
      assault({ at: 1_000 }),
      assault({ at: 2_000 }),
      assault({ at: 3_000, attackerWon: true, defenseVariant: "FORT" })
    ]);
    expect(timeline.cards).toEqual([expect.objectContaining({ kind: "SIEGE", outcome: "HOLDING", assaultsRepelled: 3 })]);
    expect(timeline.rivals).toEqual([expect.objectContaining({ playerId: "kael", attacksRepelled: 3 })]);
  });


  it("replaces the per-assault combat cards with one siege card", () => {
    const timeline = aggregatePersonalActivity("me", { from: 0, to: 10_000 }, [], [
      assault({ at: 1_000 }),
      assault({ at: 2_000 }),
      assault({ at: 3_000, attackerWon: true }),
      // Unrelated single assault elsewhere stays a COMBAT card.
      assault({ x: 1, y: 1, at: 5_000 })
    ]);
    expect(timeline.cards.map((card) => card.kind)).toEqual(["COMBAT", "SIEGE"]);
  });
});

// Regression: a Palisade that was taken without one of the siege's own logged
// assaults winning (a Breakthrough bonus capture, a barbarian take, or a win
// whose record is missing) still read "Your Palisade is holding".
describe("siegeCardsForDefender closes on a tile loss no assault made", () => {
  const lostTo = (toOwner: string, at: number): TerritoryFlip =>
    testFlip({ x: 4, y: 7, tileId: "4,7", fromOwner: "me", toOwner, at, features: [{ kind: "STRUCTURE", structureType: "PALISADE" }] });

  it("marks the siege fallen to whoever took the tile", () => {
    const fall = lostTo("kara", 3_000);
    const { cards, consumedFlips } = siegeCardsForDefender("me", [
      assault({ attackerId: "kara", at: 1_000, manpowerLoss: 150 }),
      assault({ attackerId: "kara", at: 2_000, manpowerLoss: 150 })
    ], new Set(), undefined, [fall]);
    expect(cards[0]).toMatchObject({ outcome: "FELL", capturedBy: "kara", assaultsRepelled: 2, manpowerSpentAgainst: 300, occurredAt: 3_000 });
    expect(consumedFlips.has(fall)).toBe(true);
  });

  it("stays holding when the tile was lost after the next assault or past the siege gap", () => {
    const repelled = [assault({ at: 1_000 }), assault({ at: 2_000 })];
    expect(siegeCardsForDefender("me", repelled, new Set(), undefined, [lostTo("kara", 2_000 + SIEGE_MAX_GAP_MS + 1)]).cards[0]?.outcome).toBe("HOLDING");
    const withLaterAssault = [...repelled, assault({ at: 2_000 + SIEGE_MAX_GAP_MS + 10 })];
    expect(siegeCardsForDefender("me", withLaterAssault, new Set(), undefined, [lostTo("kara", 2_000 + SIEGE_MAX_GAP_MS + 20)]).cards[0]?.outcome).toBe("HOLDING");
  });

  it("ends the siege at a loss between assaults, even if the tile was retaken before the next one", () => {
    const fall = lostTo("kara", 2_500);
    const { cards } = siegeCardsForDefender("me", [
      assault({ attackerId: "kara", at: 1_000 }),
      assault({ attackerId: "kara", at: 2_000 }),
      assault({ attackerId: "kara", at: 3_000 })
    ], new Set(), undefined, [fall]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ outcome: "FELL", capturedBy: "kara", assaultsRepelled: 2, occurredAt: 2_500 });
  });

  it("does not close on a loss to no one, and leaves a lone attack's loss on its own row", () => {
    const toNeutral = testFlip({ x: 4, y: 7, tileId: "4,7", fromOwner: "me", toOwner: undefined, at: 3_000 });
    expect(siegeCardsForDefender("me", [assault({ at: 1_000 }), assault({ at: 2_000 })], new Set(), undefined, [toNeutral]).cards[0]?.outcome).toBe("HOLDING");
    const loss = lostTo("kara", 2_000);
    const lone = siegeCardsForDefender("me", [assault({ at: 1_000 })], new Set(), undefined, [loss]);
    expect(lone.cards).toHaveLength(0);
    expect(lone.consumedFlips.has(loss)).toBe(false);
  });

  it("ends the siege when the tile is lost as the launch tile of my own failed counter-attack", () => {
    const seized = testFlip({ x: 4, y: 7, tileId: "4,7", fromOwner: "me", toOwner: "kara", at: 3_500 });
    const timeline = aggregatePersonalActivity("me", { from: 0, to: 60 * 60_000 }, [seized], [
      assault({ attackerId: "kara", at: 1_000 }),
      assault({ attackerId: "kara", at: 2_000 }),
      assault({ attackerId: "me", defenderId: "kara", x: 5, y: 7, originX: 4, originY: 7, at: 3_000 })
    ]);
    expect(timeline.cards.find((card) => card.kind === "SIEGE")).toMatchObject({ outcome: "FELL", capturedBy: "kara" });
    expect(timeline.cards.find((card) => card.kind === "COMBAT")).toMatchObject({ attackerId: "me", originSeized: true });
  });

  it("shows the fall once: no separate tile-lost row, but the headline still counts the tile", () => {
    const timeline = aggregatePersonalActivity("me", { from: 0, to: 60 * 60_000 }, [lostTo("kara", 3_000)], [
      assault({ attackerId: "kara", at: 1_000 }),
      assault({ attackerId: "kara", at: 2_000 })
    ]);
    expect(timeline.cards.map((card) => card.kind)).toEqual(["SIEGE"]);
    expect(timeline.cards[0]).toMatchObject({ outcome: "FELL", capturedBy: "kara", capturedFeatures: [{ kind: "STRUCTURE", structureType: "PALISADE", count: 1 }] });
    expect(timeline.summary.tilesLost).toBe(1);
  });
});

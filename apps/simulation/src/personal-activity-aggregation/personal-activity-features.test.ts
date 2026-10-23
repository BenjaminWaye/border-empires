import type { PersonalActivityCard } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";

import { aggregatePersonalActivity } from "./personal-activity-aggregation.js";
import { countTileFeatures } from "./personal-activity-features.js";
import { testCombat, testFlip } from "./personal-activity-test-fixtures.js";

describe("countTileFeatures", () => {
  it("counts repeated kinds into one entry", () => {
    expect(countTileFeatures([
      { kind: "STRUCTURE", structureType: "PALISADE" },
      { kind: "DOCK" },
      { kind: "STRUCTURE", structureType: "PALISADE" }
    ])).toEqual([{ kind: "STRUCTURE", structureType: "PALISADE", count: 2 }, { kind: "DOCK", count: 1 }]);
  });
});

describe("personal timeline names what fell with the land", () => {
  // The reported case: Maren's push near (212, 187) took a Palisade tile and a
  // Dock tile in fights, plus a wonder tile with no matching combat entry, and
  // the timeline only ever said "2 tiles lost" / "−1 tile lost".
  const palisade = [{ kind: "STRUCTURE" as const, structureType: "PALISADE" }];
  const dock = [{ kind: "DOCK" as const }];
  const wonder = [{ kind: "NATURAL_WONDER" as const, wonderType: "FOUNDRY_HEART" as const }];
  const combat = [
    testCombat({ attackerId: "maren", defenderId: "me", attackerWon: true, x: 211, y: 186, at: 1_000, defenseVariant: "PALISADE" }),
    testCombat({ attackerId: "maren", defenderId: "me", attackerWon: true, x: 212, y: 187, at: 2_000 }),
    testCombat({ attackerId: "maren", defenderId: "me", attackerWon: false, x: 213, y: 187, at: 3_000 })
  ];
  const flips = [
    testFlip({ tileId: "211,186", x: 211, y: 186, fromOwner: "me", toOwner: "maren", at: 1_100, features: palisade }),
    testFlip({ tileId: "212,187", x: 212, y: 187, fromOwner: "me", toOwner: "maren", at: 2_100, features: dock }),
    testFlip({ tileId: "214,190", x: 214, y: 190, fromOwner: "me", toOwner: "maren", at: 2_200, features: wonder })
  ];
  const timeline = aggregatePersonalActivity("me", { from: 0, to: 60 * 60_000 }, flips, combat);
  const cardOfKind = <K extends PersonalActivityCard["kind"]>(kind: K): Extract<PersonalActivityCard, { kind: K }> =>
    timeline.cards.find((card): card is Extract<PersonalActivityCard, { kind: K }> => card.kind === kind)!;

  it("puts every lost structure in the summary, whichever card told the capture", () => {
    expect(timeline.summary.tilesLost).toBe(3);
    expect(timeline.summary.featuresLost).toEqual([
      { kind: "STRUCTURE", structureType: "PALISADE", count: 1 },
      { kind: "DOCK", count: 1 },
      { kind: "NATURAL_WONDER", wonderType: "FOUNDRY_HEART", count: 1 }
    ]);
    expect(timeline.summary.featuresCaptured).toBeUndefined();
  });

  it("names captured structures on the combat group and leftover flips on the territory card", () => {
    expect(cardOfKind("COMBAT_GROUP").capturedFeatures).toEqual([
      { kind: "STRUCTURE", structureType: "PALISADE", count: 1 },
      { kind: "DOCK", count: 1 }
    ]);
    expect(cardOfKind("TERRITORY_FLIP_GROUP").features).toEqual([{ kind: "NATURAL_WONDER", wonderType: "FOUNDRY_HEART", count: 1 }]);
  });

  it("names what a siege's breaking assault took", () => {
    const sieged = aggregatePersonalActivity("me", { from: 0, to: 60 * 60_000 }, [flips[0]!], [
      testCombat({ attackerId: "maren", defenderId: "me", attackerWon: false, x: 211, y: 186, at: 500, defenseVariant: "PALISADE" }),
      combat[0]!
    ]);
    const siege = sieged.cards.find((card) => card.kind === "SIEGE");
    expect(siege).toMatchObject({ outcome: "FELL", capturedFeatures: [{ kind: "STRUCTURE", structureType: "PALISADE", count: 1 }] });
  });

  it("names what stood on a seized launch tile, and credits the seizer only with what survived", () => {
    const seized = aggregatePersonalActivity("me", { from: 0, to: 60 * 60_000 }, [
      testFlip({ tileId: "5,5", x: 5, y: 5, fromOwner: "maren", toOwner: "me", at: 1_100, features: [{ kind: "STRUCTURE", structureType: "SIEGE_TOWER" }, { kind: "DOCK" }] })
    ], [testCombat({ attackerId: "maren", defenderId: "me", attackerWon: false, x: 6, y: 5, originX: 5, originY: 5, at: 1_000 })]);
    // The Siege Tower is razed on capture: Maren lost it, but I never got it.
    expect(seized.cards[0]).toMatchObject({ kind: "COMBAT", originSeized: true, seizedOriginFeatures: [{ kind: "DOCK", count: 1 }] });
    expect(seized.summary.featuresCaptured).toEqual([{ kind: "DOCK", count: 1 }]);

    const asAttacker = aggregatePersonalActivity("maren", { from: 0, to: 60 * 60_000 }, [
      testFlip({ tileId: "5,5", x: 5, y: 5, fromOwner: "maren", toOwner: "me", at: 1_100, features: [{ kind: "STRUCTURE", structureType: "SIEGE_TOWER" }, { kind: "DOCK" }] })
    ], [testCombat({ attackerId: "maren", defenderId: "me", attackerWon: false, x: 6, y: 5, originX: 5, originY: 5, at: 1_000 })]);
    expect(asAttacker.cards[0]).toMatchObject({ seizedOriginFeatures: [{ kind: "STRUCTURE", structureType: "SIEGE_TOWER", count: 1 }, { kind: "DOCK", count: 1 }] });
    expect(asAttacker.summary.featuresLost).toEqual([{ kind: "STRUCTURE", structureType: "SIEGE_TOWER", count: 1 }, { kind: "DOCK", count: 1 }]);
  });

  it("leaves bare captures without a features field", () => {
    const bare = aggregatePersonalActivity("me", { from: 0, to: 60 * 60_000 }, [testFlip({ fromOwner: "me", toOwner: "maren" })], []);
    expect(bare.summary.featuresLost).toBeUndefined();
    expect(bare.cards[0]).not.toHaveProperty("features");
  });
});

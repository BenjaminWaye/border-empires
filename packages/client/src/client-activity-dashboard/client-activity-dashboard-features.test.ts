import type { PersonalActivityCard, PersonalActivityTimeline, PersonalActivityTileFeatureCount } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";

import { combatCardText, combatGroupCardText, siegeCardText } from "./client-activity-dashboard-combat-text.js";
import { featureListLabel } from "./client-activity-dashboard-features.js";
import { activityCardText, summaryCountsLine } from "./client-activity-dashboard-format.js";

const names = (id: string): string | undefined => ({ maren: "Maren" })[id];

const palisade: PersonalActivityTileFeatureCount = { kind: "STRUCTURE", structureType: "PALISADE", count: 1 };
const dock: PersonalActivityTileFeatureCount = { kind: "DOCK", count: 1 };
const wonder: PersonalActivityTileFeatureCount = { kind: "NATURAL_WONDER", wonderType: "FOUNDRY_HEART", count: 1 };

describe("featureListLabel", () => {
  it("names structures, docks and wonders, with a count for repeats", () => {
    expect(featureListLabel([{ ...palisade, count: 2 }, dock, wonder])).toBe("Palisade ×2, Dock and Foundry Heart wonder");
    expect(featureListLabel([])).toBeUndefined();
  });

  it("drops the one structure the sentence already names", () => {
    expect(featureListLabel([palisade, dock], "PALISADE")).toBe("Dock");
    expect(featureListLabel([palisade], "PALISADE")).toBeUndefined();
    expect(featureListLabel([{ ...palisade, count: 2 }], "PALISADE")).toBe("Palisade");
  });

  it("drops a leading article so the name follows \"your\"", () => {
    expect(featureListLabel([{ kind: "STRUCTURE", structureType: "TITANIUM_LEVY", count: 1 }])).toBe("Titanium Levy");
  });

  it("still reads for a feature this client doesn't know", () => {
    expect(featureListLabel([{ kind: "NATURAL_WONDER", wonderType: "SKY_ANVIL" as never, count: 1 }])).toBe("Sky anvil wonder");
    expect(featureListLabel([{ kind: "FUTURE_THING", count: 1 } as never])).toBe("landmark");
  });
});

// Regression: Maren took a Palisade, a Dock and a wonder, and the Activity
// report only ever said "2 tiles lost" / "−3 tiles lost".
describe("cards and summary name what fell with the tiles", () => {
  it("names them on the summary line", () => {
    const summary = { tilesClaimed: 1, tilesLost: 5, waystationsActivated: 0, townsCaptured: 0, townsLost: 0, buildingsCompleted: 0, featuresLost: [palisade, dock, wonder], featuresCaptured: [dock] };
    const timeline = { goldPlundered: 0, goldRaidedFromYou: 0, manpowerSpentAttacking: 0 } as PersonalActivityTimeline;
    expect(summaryCountsLine(summary, timeline, 1000)).toBe("+1 tiles claimed · −5 tiles lost · Lost your Palisade, Dock and Foundry Heart wonder · Captured their Dock");
  });

  it("names them on a rival's push", () => {
    const card: Extract<PersonalActivityCard, { kind: "COMBAT_GROUP" }> = {
      kind: "COMBAT_GROUP", id: "g", occurredAt: 0, role: "DEFENDER", counterpartyPlayerId: "maren", attempts: 3, captures: 2, originsSeized: 1,
      manpowerLoss: 130, pillagedGold: 0, defenderGoldLoss: 3, x: 212, y: 187, capturedFeatures: [palisade, dock]
    };
    // Each list sits right after the clause it belongs to, so the seized tiles never read as holding the Palisade.
    expect(combatGroupCardText({ ...card, seizedOriginFeatures: [dock] }, names)).toBe("Maren attacked 3 times: 1 repelled, 2 tiles lost (incl. your Palisade and Dock) · seized 1 of their tiles (incl. their Dock) · −3 coin raided from you · cost them 130 manpower");
    expect(combatGroupCardText({ ...card, role: "ATTACKER" }, names)).toBe("Your assault on Maren: 3 attacks, 2 tiles taken (incl. their Palisade and Dock) · they seized 1 launch tile · −130 manpower");
  });

  it("names them on territory rows", () => {
    const lost: PersonalActivityCard = { kind: "TERRITORY_FLIP_GROUP", id: "t", occurredAt: 0, direction: "LOST", counterpartyPlayerId: "maren", tileCount: 3, x: 212, y: 187, features: [wonder] };
    expect(activityCardText(lost, "me", names)).toBe("−3 tiles lost (Maren) · incl. your Foundry Heart wonder");
    expect(activityCardText({ ...lost, direction: "GAINED", counterpartyPlayerId: undefined, features: [dock] }, "me", names)).toBe("+3 tiles claimed · incl. Dock");
  });

  it("does not repeat the fortification a single fight or siege already names", () => {
    const fight: Extract<PersonalActivityCard, { kind: "COMBAT" }> = {
      kind: "COMBAT", id: "c", occurredAt: 0, attackerId: "maren", defenderId: "me", attackerWon: true, manpowerLoss: 60, x: 211, y: 186,
      pillagedGold: 0, defenderGoldLoss: 0, targetWasSettled: true, defenseVariant: "PALISADE", capturedFeatures: [palisade, dock]
    };
    expect(combatCardText(fight, "me", names)).toBe("Your Palisade fell to Maren (with your Dock) · cost them 60 manpower");
    const { capturedFeatures: _captured, ...repelled } = fight;
    expect(combatCardText({ ...repelled, attackerId: "me", defenderId: "maren", attackerWon: false, originSeized: true, seizedOriginFeatures: [dock] }, "me", names))
      .toBe("Your attack on Maren was repelled by their Palisade and they seized your launch tile (with your Dock) · −60 manpower");
    const siege: Extract<PersonalActivityCard, { kind: "SIEGE" }> = {
      kind: "SIEGE", id: "s", occurredAt: 60 * 60_000, startedAt: 0, x: 211, y: 186, outcome: "FELL", assaultsRepelled: 3, originsSeized: 0,
      attackerIds: ["maren"], manpowerSpentAgainst: 240, defenseVariant: "PALISADE", capturedBy: "maren", capturedFeatures: [palisade]
    };
    expect(siegeCardText(siege, names)).toBe("Your Palisade fell to Maren after a 1h siege · Held off 3 assaults from Maren · cost them 240 manpower");
    expect(siegeCardText({ ...siege, capturedFeatures: [palisade, dock], originsSeized: 1, seizedOriginFeatures: [wonder] }, names))
      .toBe("Your Palisade fell to Maren after a 1h siege (with your Dock) · Held off 3 assaults from Maren · seized 1 of their tiles (incl. their Foundry Heart wonder) · cost them 240 manpower");
  });
});

it("names redesigned relics while preserving historical wonder labels", () => {
  expect(featureListLabel([{ kind: "NATURAL_WONDER", wonderType: "WARPRESS", relicVersion: 1, count: 1 }])).toBe("Combat-Suit Factory relic");
  expect(featureListLabel([{ kind: "NATURAL_WONDER", wonderType: "WARPRESS", count: 1 }])).toContain("wonder");
});

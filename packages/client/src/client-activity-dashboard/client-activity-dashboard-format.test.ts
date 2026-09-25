import { describe, expect, it } from "vitest";
import { activityCardCoordinates, activityCardText, shouldShowManpowerHeadline, summaryCountsLine, truncationLabel } from "./client-activity-dashboard-format.js";

describe("shouldShowManpowerHeadline", () => {
  it("is false below the absolute floor even at a huge cap share", () => {
    expect(shouldShowManpowerHeadline(249, 1)).toBe(false);
  });

  it("is false above the absolute floor when it's too small a share of the cap", () => {
    expect(shouldShowManpowerHeadline(300, 100_000)).toBe(false);
  });

  it("is true once both the absolute floor and cap-share floor are met", () => {
    expect(shouldShowManpowerHeadline(300, 5_000)).toBe(true); // 300 >= 250 and 300/5000 = 6% >= 5%
  });

  it("is false when the manpower cap is unknown (0)", () => {
    expect(shouldShowManpowerHeadline(10_000, 0)).toBe(false);
  });
});

describe("summaryCountsLine", () => {
  const emptySummary = { tilesClaimed: 0, tilesLost: 0, waystationsActivated: 0, townsCaptured: 0, townsLost: 0, buildingsCompleted: 0 };
  const baseTimeline = { goldPlundered: 0, goldRaidedFromYou: 0, manpowerSpentAttacking: 0 };

  it("never nets gold plundered against gold raided -- both can appear together", () => {
    const line = summaryCountsLine(emptySummary, { ...baseTimeline, goldPlundered: 130, goldRaidedFromYou: 240 } as any, 1000);
    expect(line).toContain("+130 gold plundered");
    expect(line).toContain("−240 gold raided");
    expect(line).not.toMatch(/net/i);
  });

  it("rounds summed gold totals instead of showing raw binary-float precision", () => {
    // 12.34 + 0.66 + 5.01 + 2.33 === 20.339999999999996 in plain floating point.
    const line = summaryCountsLine(emptySummary, { ...baseTimeline, goldPlundered: 20.339999999999996 } as any, 1000);
    expect(line).toContain("+20 gold plundered");
    expect(line).not.toContain("20.34");
    expect(line).not.toContain("20.339999999999996");
  });

  it("omits the manpower headline below the materiality gate", () => {
    const line = summaryCountsLine(emptySummary, { ...baseTimeline, manpowerSpentAttacking: 100 } as any, 1000);
    expect(line).not.toContain("manpower spent attacking");
  });

  it("includes the manpower headline once it clears the materiality gate", () => {
    const line = summaryCountsLine(emptySummary, { ...baseTimeline, manpowerSpentAttacking: 300 } as any, 1000);
    expect(line).toContain("300 manpower spent attacking");
  });

  it("includes tile and structure counts with the right signs", () => {
    const summary = { ...emptySummary, tilesClaimed: 7, tilesLost: 3, townsCaptured: 1, townsLost: 1 };
    const line = summaryCountsLine(summary, baseTimeline as any, 1000);
    expect(line).toContain("+7 tiles claimed");
    expect(line).toContain("−3 tiles lost");
    expect(line).toContain("+1 town captured");
    expect(line).toContain("−1 town lost");
  });
});

describe("truncationLabel", () => {
  it("is undefined when the timeline was not truncated", () => {
    expect(truncationLabel({ truncated: false, from: 0, to: 1000 })).toBeUndefined();
  });

  it("states the away duration in days without implying the whole gap is covered", () => {
    const dayMs = 24 * 60 * 60_000;
    const label = truncationLabel({ truncated: true, from: 0, to: 3 * dayMs });
    expect(label).toContain("3 days");
    expect(label).toContain("latest 24 hours");
    expect(label).not.toMatch(/since you were away/i);
  });
});

describe("activityCardText / activityCardCoordinates", () => {
  const noNames = () => undefined;
  const namesFrom = (map: Record<string, string>) => (id: string) => map[id];

  it("labels a won capture as an attacker plunder, with directional gold text", () => {
    const card = { kind: "COMBAT" as const, attackerId: "me", defenderId: "them", attackerWon: true, pillagedGold: 50, defenderGoldLoss: 0, x: 1, y: 2 };
    expect(activityCardText(card as any, "me", noNames)).toContain("50 gold plundered");
  });

  it("labels a raid against the viewer with directional 'raided from you' text", () => {
    const card = { kind: "COMBAT" as const, attackerId: "them", defenderId: "me", attackerWon: true, pillagedGold: 0, defenderGoldLoss: 80, x: 1, y: 2 };
    expect(activityCardText(card as any, "me", noNames)).toContain("−80 gold raided from you");
  });

  it("rounds a floating-point gold total instead of showing raw binary-float precision", () => {
    const card = { kind: "COMBAT" as const, attackerId: "me", defenderId: "them", attackerWon: true, pillagedGold: 20.339999999999996, defenderGoldLoss: 0, x: 1, y: 2 };
    expect(activityCardText(card as any, "me", noNames)).toContain("20 gold plundered");
  });

  it("resolves the other player's display name from the roster when available", () => {
    const card = { kind: "COMBAT" as const, attackerId: "me", defenderId: "rival-1", attackerWon: true, pillagedGold: 0, defenderGoldLoss: 0, x: 1, y: 2 };
    expect(activityCardText(card as any, "me", namesFrom({ "rival-1": "Osmond" }))).toContain("Osmond");
  });

  it("falls back to the raw id when a player can't be resolved (deleted/renamed, per plan §7)", () => {
    const card = { kind: "COMBAT" as const, attackerId: "me", defenderId: "gone-1", attackerWon: true, pillagedGold: 0, defenderGoldLoss: 0, x: 1, y: 2 };
    expect(activityCardText(card as any, "me", noNames)).toContain("gone-1");
  });

  it("gives a territory card its direction-appropriate sign", () => {
    const gained = { kind: "TERRITORY_FLIP_GROUP" as const, direction: "GAINED", tileCount: 4, x: 1, y: 1 };
    const lost = { kind: "TERRITORY_FLIP_GROUP" as const, direction: "LOST", tileCount: 2, x: 1, y: 1 };
    expect(activityCardText(gained as any, "me", noNames)).toBe("+4 tiles claimed");
    expect(activityCardText(lost as any, "me", noNames)).toBe("−2 tiles lost");
  });

  it("has no Center coordinates for a truncation-note card", () => {
    const note = { kind: "TRUNCATION_NOTE" as const, hiddenCount: 6 };
    expect(activityCardCoordinates(note as any)).toBeUndefined();
    expect(activityCardText(note as any, "me", noNames)).toContain("6 smaller events not shown");
  });

  it("has Center coordinates for a combat or territory card", () => {
    const combat = { kind: "COMBAT" as const, attackerId: "a", defenderId: "b", attackerWon: true, pillagedGold: 0, defenderGoldLoss: 0, x: 5, y: 9 };
    expect(activityCardCoordinates(combat as any)).toEqual({ x: 5, y: 9 });
  });
});

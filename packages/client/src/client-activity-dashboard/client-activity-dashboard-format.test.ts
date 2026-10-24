import { describe, expect, it } from "vitest";
import { activityCardCoordinates, activityCardCoordinatesLabel, activityCardText, activityPlayerNameLookup, shouldShowManpowerHeadline, summaryCountsLine, truncationLabel } from "./client-activity-dashboard-format.js";
import { activityCardTone } from "./client-activity-dashboard-tone.js";

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
    expect(line).toContain("+130 coin plundered");
    expect(line).toContain("−240 coin raided");
    expect(line).not.toMatch(/net/i);
  });

  it("hides coin amounts that round to zero or are too small for the headline", () => {
    // Regression: 0.3 coin raided passed the `> 0` check but rendered as "−0 coin raided".
    const line = summaryCountsLine({ ...emptySummary, tilesLost: 2 }, { ...baseTimeline, goldRaidedFromYou: 0.3, goldPlundered: 2 } as any, 1000);
    expect(line).toBe("−2 tiles lost");
  });

  it("rounds summed gold totals instead of showing raw binary-float precision", () => {
    // 12.34 + 0.66 + 5.01 + 2.33 === 20.339999999999996 in plain floating point.
    const line = summaryCountsLine(emptySummary, { ...baseTimeline, goldPlundered: 20.339999999999996 } as any, 1000);
    expect(line).toContain("+20 coin plundered");
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
    expect(activityCardText(card as any, "me", noNames)).toContain("50 coin plundered");
  });

  it("labels a raid against the viewer with directional 'raided from you' text", () => {
    const card = { kind: "COMBAT" as const, attackerId: "them", defenderId: "me", attackerWon: true, pillagedGold: 0, defenderGoldLoss: 80, x: 1, y: 2 };
    expect(activityCardText(card as any, "me", noNames)).toContain("−80 coin raided from you");
  });

  it("rounds a floating-point gold total instead of showing raw binary-float precision", () => {
    const card = { kind: "COMBAT" as const, attackerId: "me", defenderId: "them", attackerWon: true, pillagedGold: 20.339999999999996, defenderGoldLoss: 0, x: 1, y: 2 };
    expect(activityCardText(card as any, "me", noNames)).toContain("20 coin plundered");
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

  it("renders a waystation's specific grant and keeps its Center location", () => {
    const card = { kind: "WAYSTATION_ACTIVATED" as const, grantedEffect: "TECH" as const, grantedTechId: "CARTOGRAPHY", x: 5, y: 9 };
    expect(activityCardText(card as any, "me", noNames)).toContain("CARTOGRAPHY granted");
    expect(activityCardText(card as any, "me", noNames, (id) => (id === "CARTOGRAPHY" ? "Star Charts" : undefined))).toContain("Star Charts granted");
    expect(activityCardCoordinates(card as any)).toEqual({ x: 5, y: 9 });
  });

  it("does not claim a population or technology reward that did not resolve", () => {
    const tech = { kind: "WAYSTATION_ACTIVATED" as const, grantedEffect: "TECH" as const, x: 5, y: 9 };
    const population = { kind: "WAYSTATION_ACTIVATED" as const, grantedEffect: "POPULATION" as const, x: 5, y: 9 };
    expect(activityCardText(tech as any, "me", noNames)).toContain("no unowned technology remained");
    expect(activityCardText(population as any, "me", noNames)).toContain("no eligible town received population");
  });

  it("renders town aftermath and building one-off effects", () => {
    const town = { kind: "TOWN_LOST" as const, townTier: "TOWN", townSurvived: false, populationBefore: 1_000, populationAfter: 500, capturedStructureTypes: [], x: 5, y: 9 };
    const building = { kind: "BUILDING_COMPLETED" as const, structureType: "MANUFACTORY", instantGold: 100, x: 4, y: 7 };
    expect(activityCardText(town as any, "me", noNames)).toContain("settlement razed");
    expect(activityCardText(building as any, "me", noNames)).toContain("+100 coin");
  });

  it("names who took or gave up a town and rounds its population", () => {
    const base = { townName: "Aurienspire Ring", townTier: "CITY", townSurvived: true, populationBefore: 50_000, populationAfter: 25354.069705641472, capturedStructureTypes: [], x: 5, y: 9 };
    const names = namesFrom({ kara: "Kara" });
    expect(activityCardText({ ...base, kind: "TOWN_LOST", counterpartyPlayerId: "kara" } as any, "me", names)).toBe("Lost Aurienspire Ring to Kara · 25354 population remaining");
    expect(activityCardText({ ...base, kind: "TOWN_CAPTURED", counterpartyPlayerId: "kara" } as any, "me", names)).toBe("Captured Aurienspire Ring from Kara · 25354 population remaining");
    expect(activityCardText({ ...base, kind: "TOWN_LOST" } as any, "me", names)).toBe("Lost Aurienspire Ring · 25354 population remaining");
  });

  it("gives a lost or captured dock its own note naming the other player", () => {
    const names = namesFrom({ kara: "Kara" });
    expect(activityCardText({ kind: "DOCK_LOST", counterpartyPlayerId: "kara", x: 5, y: 9 } as any, "me", names)).toBe("Lost your Dock to Kara");
    expect(activityCardText({ kind: "DOCK_CAPTURED", counterpartyPlayerId: "kara", x: 5, y: 9 } as any, "me", names)).toBe("Captured a Dock from Kara");
    expect(activityCardTone({ kind: "DOCK_LOST", x: 5, y: 9 } as any, "me")).toBe("loss");
  });

  it("names completed buildings by their player-facing name, not the backend id", () => {
    const tradeNexus = { kind: "BUILDING_COMPLETED" as const, structureType: "TRADE_NEXUS", x: 4, y: 7 };
    const incubationEngine = { kind: "BUILDING_COMPLETED" as const, structureType: "INCUBATION_ENGINE", x: 4, y: 7 };
    const unknown = { kind: "BUILDING_COMPLETED" as const, structureType: "SOME_FUTURE_HALL", x: 4, y: 7 };
    expect(activityCardText(tradeNexus as any, "me", noNames)).toBe("Trade Nexus completed");
    expect(activityCardText(incubationEngine as any, "me", noNames)).toBe("Incubation Engine completed");
    expect(activityCardText(unknown as any, "me", noNames)).toBe("Some future hall completed");
  });
});

describe("activityPlayerNameLookup", () => {
  const leaderboardWith = (entries: Array<{ id: string; name: string }>) => ({
    overall: entries.map((entry, index) => ({ ...entry, tiles: 1, incomePerMinute: 1, techs: 1, manpowerCap: 100, score: 1, rank: index + 1 })),
    selfOverall: undefined,
    selfByTiles: undefined,
    selfByIncome: undefined,
    selfByTechs: undefined,
    byTiles: [],
    byIncome: [],
    byTechs: []
  });

  it("names an AI by its leaderboard name instead of the stable \"AI N\" diplomacy name", () => {
    const lookup = activityPlayerNameLookup({ playerNames: new Map([["ai-5", "AI 5"]]), leaderboard: leaderboardWith([{ id: "ai-5", name: "Astrid" }]) });
    expect(lookup("ai-5")).toBe("Astrid");
  });

  it("keeps a human's fresh playerNames entry over a stale leaderboard name", () => {
    const lookup = activityPlayerNameLookup({ playerNames: new Map([["player-2", "Rex"]]), leaderboard: leaderboardWith([{ id: "player-2", name: "Bob" }]) });
    expect(lookup("player-2")).toBe("Rex");
  });

  it("falls back to playerNames for an AI missing from the leaderboard", () => {
    const lookup = activityPlayerNameLookup({ playerNames: new Map([["ai-7", "AI 7"]]), leaderboard: leaderboardWith([]) });
    expect(lookup("ai-7")).toBe("AI 7");
  });
});

describe("activityCardCoordinatesLabel", () => {
  it("formats a located card as \"(x, y)\"", () => {
    const card = { kind: "TERRITORY_FLIP_GROUP" as const, id: "a", occurredAt: 1, direction: "GAINED" as const, counterpartyPlayerId: undefined, tileCount: 1, x: 12, y: 0 };
    expect(activityCardCoordinatesLabel(card)).toBe("(12, 0)");
  });

  it("has no label for the truncation note", () => {
    expect(activityCardCoordinatesLabel({ kind: "TRUNCATION_NOTE", id: "t", occurredAt: 1, hiddenCount: 3 } as any)).toBeUndefined();
  });
});

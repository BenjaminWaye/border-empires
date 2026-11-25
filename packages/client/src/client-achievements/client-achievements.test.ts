import { describe, expect, it } from "vitest";
import { applyLongestRoadMessage, applyPlayerUpdateAchievements, createInitialAchievementsState } from "./client-achievements-state.js";
import { achievementsProfileSectionHtml, longestRoadCardHtml } from "./client-achievements-html.js";

describe("client achievements", () => {
  it("reads achievements from PLAYER_UPDATE and ignores unknown ids and partial updates", () => {
    const state = createInitialAchievementsState();
    applyPlayerUpdateAchievements(state, { achievements: { progress: { PACIFIER: 12, BOGUS: 3 }, earned: { WARLORD: 5 } } });
    expect(state.achievements).toEqual({ progress: { PACIFIER: 12 }, earned: { WARLORD: 5 } });
    applyPlayerUpdateAchievements(state, {});
    expect(state.achievements?.progress.PACIFIER).toBe(12);
  });

  it("shows earned badges lit and the rest with progress", () => {
    const html = achievementsProfileSectionHtml({ progress: { PACIFIER: 12 }, earned: { WARLORD: 5 } });
    expect(html).toContain("1 / 6");
    expect(html).toMatch(/ach-badge is-earned[^]*Warlord/);
    expect(html).toContain("12 / 50");
    expect(achievementsProfileSectionHtml(undefined)).toBe("");
  });

  it("keeps the Longest Road holder from LONGEST_ROAD and shows it on Ranks", () => {
    const state = createInitialAchievementsState();
    expect(applyLongestRoadMessage(state, { type: "LONGEST_ROAD", road: { playerId: "p2", playerName: "Rival", tileCount: 41, fromTown: "Ash", toTown: "Brine" } })).toBe(true);
    const card = longestRoadCardHtml(state.liveLongestRoad, "p1", () => "Rival <3");
    expect(card).toContain("41 tiles");
    expect(card).toContain("Updated every 4 hours");
    expect(card).toContain("Rival &lt;3");
    expect(card).toContain('data-hud-v2-profile="p2"');
    expect(longestRoadCardHtml(state.liveLongestRoad, "p2", () => "")).toContain(">You<");
    expect(applyLongestRoadMessage(state, { type: "LONGEST_ROAD", road: { playerId: 1 } })).toBe(false);
    expect(applyLongestRoadMessage(state, { type: "LONGEST_ROAD", road: null })).toBe(true);
    expect(longestRoadCardHtml(state.liveLongestRoad, "p1", () => "")).toContain("No road yet");
    expect(longestRoadCardHtml(undefined, "p1", () => "")).toBe("");
  });
});

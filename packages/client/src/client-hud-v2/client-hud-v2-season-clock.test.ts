import { describe, expect, it } from "vitest";
import type { SeasonVictoryObjectiveView, SeasonWinnerView } from "../client-types.js";
import { ranksBannerHtml, ranksBodyHtml, type RanksInput } from "./client-hud-v2-ranks.js";
import { seasonClockHtml } from "./client-hud-v2-rivals.js";

// After crowning, the winner's path can still read conditionMet with a leader,
// which made every victory surface say "<winner> holding <path>".
const holding: SeasonVictoryObjectiveView = {
  id: "ECONOMIC_HEGEMONY",
  name: "Economic Ascendancy",
  description: "",
  leaderPlayerId: "p-astrid",
  leaderName: "Astrid",
  progressLabel: "",
  thresholdLabel: "",
  holdDurationSeconds: 86400,
  holdRemainingSeconds: 0,
  statusLabel: "",
  conditionMet: true
};
const winner: SeasonWinnerView = { playerId: "p-astrid", playerName: "Astrid", crownedAt: 1, objectiveId: "ECONOMIC_HEGEMONY", objectiveName: "Economic Ascendancy" };
const names = new Map([["p-astrid", "Astrid"]]);
const nameOf = (id: string): string => names.get(id) ?? "";

describe("Victory race line", () => {
  it("names the season winner instead of saying they are still holding", () => {
    const html = seasonClockHtml([holding], winner, "me", nameOf);
    expect(html).toContain("<b>Astrid</b> won Economic Ascendancy");
    expect(html).not.toContain("holding");
  });

  it("says You when the local player won", () => {
    expect(seasonClockHtml([holding], winner, "p-astrid", nameOf)).toContain("<b>You</b> won Economic Ascendancy");
  });

  it("uses the winner's current name over the crowning snapshot", () => {
    expect(seasonClockHtml([holding], winner, "me", () => "Astrid the Great")).toContain("<b>Astrid the Great</b> won");
  });

  it("shows who is holding a path while the race is still on", () => {
    expect(seasonClockHtml([holding])).toContain("<b>Astrid</b> holding Economic Ascendancy");
  });
});

describe("Ranks after the season is won", () => {
  const input = (patch: Partial<RanksInput>): RanksInput => ({ me: "me", objectives: [holding], winner, overall: [], selfOverall: undefined, nameOf, colorOf: () => undefined, ...patch });

  it("banner names the winner instead of the holder", () => {
    const html = ranksBannerHtml(input({}));
    expect(html).toContain("♛ Astrid won Economic Ascendancy");
    expect(html).not.toContain("holding");
  });

  it("winning track says won, not holding", () => {
    const html = ranksBodyHtml(input({}));
    expect(html).toContain('v2r-status-won">♛ Astrid won</span>');
    expect(html).not.toContain("v2r-status-hold");
  });

  it("banner still counts down a hold before anyone is crowned", () => {
    expect(ranksBannerHtml(input({ winner: undefined }))).toContain("Astrid is holding Economic Ascendancy");
  });
});

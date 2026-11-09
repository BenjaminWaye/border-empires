import { describe, expect, it } from "vitest";
import type { SeasonVictoryObjectiveView, SeasonWinnerView } from "../client-types.js";
import { seasonClockHtml } from "./client-hud-v2-rivals.js";

const holding = { id: "ECONOMIC_HEGEMONY", name: "Economic Ascendancy", leaderName: "Astrid", leaderPlayerId: "p-astrid", conditionMet: true, holdRemainingSeconds: 0 } as unknown as SeasonVictoryObjectiveView;
const winner: SeasonWinnerView = { playerId: "p-astrid", playerName: "Astrid", crownedAt: 1, objectiveId: "ECONOMIC_HEGEMONY", objectiveName: "Economic Ascendancy" };

describe("seasonClockHtml", () => {
  it("names the season winner instead of saying they are still holding", () => {
    const html = seasonClockHtml([holding], winner);
    expect(html).toContain("<b>Astrid</b> won Economic Ascendancy");
    expect(html).not.toContain("holding");
  });

  it("shows who is holding a path while the race is still on", () => {
    expect(seasonClockHtml([holding])).toContain("<b>Astrid</b> holding Economic Ascendancy");
  });
});

import { describe, expect, it } from "vitest";
import { playerProfileHtml } from "./client-player-profile.js";

const baseArgs = {
  profilePlayerId: "p1",
  viewerPlayerId: "me",
  playerName: "Nauticus",
  leaderboardOverall: [{ id: "p1", rank: 3, name: "Nauticus", score: 42, tiles: 10, incomePerMinute: 1, techs: 5, manpowerCap: 200 }],
  allies: [] as string[],
  activeTruces: [] as { otherPlayerId: string; otherPlayerName: string; startedAt: number; endsAt: number; createdByPlayerId: string }[],
  truceBreaksThisSeason: [] as { targetPlayerId: string; targetPlayerName: string; brokenAt: number }[],
  nowMs: 1_000_000
};

describe("playerProfileHtml", () => {
  it("shows the season snapshot from the leaderboard entry", () => {
    const html = playerProfileHtml(baseArgs);
    expect(html).toContain("Nauticus");
    expect(html).toContain("Rank #3");
    expect(html).toContain("42");
  });

  it("shows an oathbreaker badge and broken-truce list only when viewing your own profile", () => {
    const truceBreaksThisSeason = [{ targetPlayerId: "p2", targetPlayerName: "Valka", brokenAt: 900_000 }];

    const selfProfile = playerProfileHtml({ ...baseArgs, profilePlayerId: "me", truceBreaksThisSeason });
    expect(selfProfile).toContain("Oathbreaker");
    expect(selfProfile).toContain("Valka");

    const otherProfile = playerProfileHtml({ ...baseArgs, profilePlayerId: "p1", truceBreaksThisSeason });
    expect(otherProfile).not.toContain("Oathbreaker");
    expect(otherProfile).not.toContain("Valka");
    expect(otherProfile).toContain("isn't available yet");
  });

  it("labels the relationship as Allied when the profile target is an ally", () => {
    const html = playerProfileHtml({ ...baseArgs, allies: ["p1"] });
    expect(html).toContain("Allied");
  });

  it("shows active truce status with the viewer when one exists", () => {
    const html = playerProfileHtml({
      ...baseArgs,
      activeTruces: [{ otherPlayerId: "p1", otherPlayerName: "Nauticus", startedAt: 0, endsAt: 2_000_000, createdByPlayerId: "me" }]
    });
    expect(html).toContain("active truce");
  });
});

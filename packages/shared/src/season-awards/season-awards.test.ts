import { describe, expect, it } from "vitest";
import { seasonAwardsAtCrowning } from "./season-awards.js";

const standings = [
  { id: "a", name: "Aln", rank: 1 },
  { id: "b", name: "Bel", rank: 4 },
  { id: "c", name: "Cor", rank: 5 },
  { id: "d", name: "Dun", rank: 6 },
  { id: "e", name: "Eth", rank: 40 }
];

describe("seasonAwardsAtCrowning", () => {
  it("gives Never Gave Up to the most redeploys and Comeback Kid to every redeployed top-5 House", () => {
    expect(seasonAwardsAtCrowning(standings, new Map([["b", 1], ["c", 2], ["d", 3], ["e", 7]]))).toEqual([
      { kind: "NEVER_GAVE_UP", playerId: "e", playerName: "Eth", redeploys: 7 },
      { kind: "COMEBACK_KID", playerId: "b", playerName: "Bel", redeploys: 1, rank: 4 },
      { kind: "COMEBACK_KID", playerId: "c", playerName: "Cor", redeploys: 2, rank: 5 }
    ]);
  });

  it("breaks a Never Gave Up tie by the better placement", () => {
    expect(seasonAwardsAtCrowning(standings, new Map([["d", 3], ["e", 3]]))[0]).toMatchObject({ kind: "NEVER_GAVE_UP", playerId: "d" });
  });

  it("awards nothing when nobody redeployed, and ignores Houses off the leaderboard", () => {
    expect(seasonAwardsAtCrowning(standings, new Map())).toEqual([]);
    expect(seasonAwardsAtCrowning(standings, new Map([["barbarian-1", 9], ["a", 0]]))).toEqual([]);
  });
});

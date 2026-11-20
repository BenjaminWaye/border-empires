import { describe, expect, it } from "vitest";
import { houseChargeDomainWeight } from "@border-empires/shared";
import { houseChargeDifficulty, houseChargePipsForScore } from "./house-charge-difficulty.js";

const near = { reach: 15, crossesWater: false, rivalsNear: 0 };

describe("House Charge difficulty", () => {
  // Owner report 2026-11-20: a 34-tile tundra (75% = 26 tiles) was Rare, +2 Domain, while
  // a 342-tile Survey Claim (every tile) was Common, +1 Domain. Pay must follow the work.
  it("scores a large Survey Claim above a small tundra and pays it more", () => {
    const tundra = houseChargeDifficulty({ ...near, kind: "TUNDRA", areaTiles: 34 });
    const survey = houseChargeDifficulty({ ...near, kind: "SURVEY", areaTiles: 342 });
    expect(survey.score).toBeGreaterThan(tundra.score);
    expect(survey.renown).toBeGreaterThan(tundra.renown);
    const paid = (scored: { renown: number; rarity: typeof survey.rarity }) => houseChargeDomainWeight({ ...scored, held: true, difficultyScored: true });
    expect(paid(survey)).toBeGreaterThan(paid(tundra));
    expect(tundra.rarity).toBe("COMMON");
    expect(survey.rarity).toBe("MYTHIC");
  });

  it("scores tundra and desert of the same size alike", () => {
    expect(houseChargeDifficulty({ ...near, kind: "TUNDRA", areaTiles: 120 })).toEqual(houseChargeDifficulty({ ...near, kind: "DESERT", areaTiles: 120 }));
  });

  it("does not make a relic Mythic by kind: a close, uncontested one is easy", () => {
    const relic = houseChargeDifficulty({ ...near, kind: "RELIC", reach: 10 });
    expect(relic.renown).toBe(1);
    expect(relic.rarity).toBe("COMMON");
  });

  it("raises difficulty for distance, a sea crossing and rivals near the target", () => {
    const base = houseChargeDifficulty({ ...near, kind: "RELIC", reach: 20 }).score;
    expect(houseChargeDifficulty({ ...near, kind: "RELIC", reach: 40 }).score).toBeGreaterThan(base);
    expect(houseChargeDifficulty({ ...near, kind: "RELIC", reach: 20, crossesWater: true }).score).toBeGreaterThan(base);
    expect(houseChargeDifficulty({ ...near, kind: "RELIC", reach: 20, rivalsNear: 2 }).score).toBeGreaterThan(base);
  });

  it("caps the contest multiplier", () => {
    const many = houseChargeDifficulty({ ...near, kind: "SURVEY", areaTiles: 30, reach: 0, rivalsNear: 50 });
    expect(many.score).toBe(Math.round(30 * 1.4));
  });

  it("maps scores to 1..4 pips", () => {
    expect([0, 50, 51, 110, 111, 220, 221, 5000].map(houseChargePipsForScore)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

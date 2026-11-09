import { describe, expect, it } from "vitest";

import { ELO_INITIAL_RATING, ELO_K_FACTOR, computeSeasonElo } from "./season-elo.js";

describe("computeSeasonElo", () => {
  it("starts unrated players at the initial rating and moves them by final rank", () => {
    const result = computeSeasonElo(
      [{ playerId: "a", rank: 1 }, { playerId: "b", rank: 2 }, { playerId: "c", rank: 3 }],
      () => undefined
    );
    expect(result.get("a")).toEqual({ ratingBefore: ELO_INITIAL_RATING, ratingAfter: ELO_INITIAL_RATING + ELO_K_FACTOR / 2 });
    expect(result.get("b")).toEqual({ ratingBefore: ELO_INITIAL_RATING, ratingAfter: ELO_INITIAL_RATING });
    expect(result.get("c")).toEqual({ ratingBefore: ELO_INITIAL_RATING, ratingAfter: ELO_INITIAL_RATING - ELO_K_FACTOR / 2 });
  });

  it("caps a single season's swing at K regardless of field size", () => {
    const standings = Array.from({ length: 40 }, (_, index) => ({ playerId: `p${index}`, rank: index + 1 }));
    const result = computeSeasonElo(standings, () => undefined);
    const winner = result.get("p0");
    expect(winner && winner.ratingAfter - winner.ratingBefore).toBe(ELO_K_FACTOR / 2);
  });

  it("rewards an upset more than an expected win", () => {
    const upset = computeSeasonElo([{ playerId: "low", rank: 1 }, { playerId: "high", rank: 2 }], (id) => (id === "low" ? 1000 : 1400));
    const expected = computeSeasonElo([{ playerId: "high", rank: 1 }, { playerId: "low", rank: 2 }], (id) => (id === "low" ? 1000 : 1400));
    const upsetGain = upset.get("low")!.ratingAfter - 1000;
    const expectedGain = expected.get("high")!.ratingAfter - 1400;
    expect(upsetGain).toBeGreaterThan(expectedGain);
    expect(upsetGain).toBe(29);
    expect(expectedGain).toBe(3);
  });

  it("treats shared ranks as draws", () => {
    const result = computeSeasonElo([{ playerId: "a", rank: 1 }, { playerId: "b", rank: 1 }], () => undefined);
    expect(result.get("a")!.ratingAfter).toBe(ELO_INITIAL_RATING);
    expect(result.get("b")!.ratingAfter).toBe(ELO_INITIAL_RATING);
  });

  it("leaves a lone player's rating unchanged", () => {
    expect(computeSeasonElo([{ playerId: "solo", rank: 1 }], () => 1300).get("solo")).toEqual({ ratingBefore: 1300, ratingAfter: 1300 });
  });
});

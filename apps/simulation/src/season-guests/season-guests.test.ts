import { afterEach, describe, expect, it } from "vitest";

import { resolveMaxSeasonGuests } from "./season-guests.js";

describe("resolveMaxSeasonGuests", () => {
  const original = process.env.SIMULATION_MAX_SEASON_GUESTS;
  afterEach(() => {
    if (original === undefined) delete process.env.SIMULATION_MAX_SEASON_GUESTS;
    else process.env.SIMULATION_MAX_SEASON_GUESTS = original;
  });

  it("defaults to 10", () => {
    delete process.env.SIMULATION_MAX_SEASON_GUESTS;
    expect(resolveMaxSeasonGuests()).toBe(10);
  });

  it("reads the env var, and an explicit value wins over it", () => {
    process.env.SIMULATION_MAX_SEASON_GUESTS = "25";
    expect(resolveMaxSeasonGuests()).toBe(25);
    expect(resolveMaxSeasonGuests(3)).toBe(3);
  });

  it("keeps 0 as 'no guests' and falls back to the default for garbage", () => {
    process.env.SIMULATION_MAX_SEASON_GUESTS = "0";
    expect(resolveMaxSeasonGuests()).toBe(0);
    process.env.SIMULATION_MAX_SEASON_GUESTS = "lots";
    expect(resolveMaxSeasonGuests()).toBe(10);
  });
});

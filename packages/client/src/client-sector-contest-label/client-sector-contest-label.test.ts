import { describe, expect, it } from "vitest";

import { sectorContestLabel } from "./client-sector-contest-label.js";

describe("sectorContestLabel", () => {
  it("numbers the contest from a sequential season id", () => {
    expect(sectorContestLabel("season-7")).toBe("Sector Contest 7");
  });

  it("keeps an unrecognised id rather than dropping it", () => {
    expect(sectorContestLabel("dev-seed")).toBe("Sector Contest dev-seed");
  });

  it("falls back when the id is unknown", () => {
    expect(sectorContestLabel(undefined)).toBe("the current Sector Contest");
    expect(sectorContestLabel("")).toBe("the current Sector Contest");
  });
});

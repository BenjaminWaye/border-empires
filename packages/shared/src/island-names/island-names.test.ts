import { describe, expect, it } from "vitest";
import { ISLAND_NAME_FADE_MS, evaluateIslandClaim, isIslandFullyGarrisoned, validateIslandName } from "./island-names.js";

describe("evaluateIslandClaim", () => {
  it("is held at 100%, contested from 60%, fading below", () => {
    expect(evaluateIslandClaim({}, { namerGarrisoned: 10, landTiles: 10 }, 0)).toEqual({ kind: "held" });
    expect(evaluateIslandClaim({}, { namerGarrisoned: 6, landTiles: 10 }, 0)).toEqual({ kind: "contested" });
    expect(evaluateIslandClaim({}, { namerGarrisoned: 5, landTiles: 10 }, 50)).toEqual({ kind: "fading", fadingSince: 50, revertsAt: 50 + ISLAND_NAME_FADE_MS });
  });

  it("keeps the original fade start and reverts once the window has passed", () => {
    const standing = { namerGarrisoned: 0, landTiles: 10 };
    expect(evaluateIslandClaim({ fadingSince: 10 }, standing, 20)).toMatchObject({ kind: "fading", fadingSince: 10 });
    expect(evaluateIslandClaim({ fadingSince: 10 }, standing, 10 + ISLAND_NAME_FADE_MS)).toEqual({ kind: "reverted" });
  });

  it("treats an island with no LAND left as not held", () => {
    expect(isIslandFullyGarrisoned({ namerGarrisoned: 0, landTiles: 0 })).toBe(false);
  });
});

describe("validateIslandName", () => {
  it("trims and collapses whitespace", () => {
    expect(validateIslandName("  Isle   of  Brass ")).toEqual({ ok: true, name: "Isle of Brass" });
  });

  it("rejects too short, too long and blocked names", () => {
    expect(validateIslandName("ab").ok).toBe(false);
    expect(validateIslandName("A".repeat(29)).ok).toBe(false);
    expect(validateIslandName("fuck isle").ok).toBe(false);
  });
});

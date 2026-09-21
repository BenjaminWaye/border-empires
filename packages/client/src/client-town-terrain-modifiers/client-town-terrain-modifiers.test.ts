import { describe, expect, it } from "vitest";
import { townCharacterLabelForProfile } from "./client-town-terrain-modifiers.js";

describe("townCharacterLabelForProfile", () => {
  it("uses the full terrain identity in the town header", () => {
    expect(townCharacterLabelForProfile("GRASS", false)).toBe("Fertile Town");
    expect(townCharacterLabelForProfile("DESERT", false)).toBe("Sunscorched Trade Town");
    expect(townCharacterLabelForProfile("TUNDRA", false)).toBe("Tundra Town");
  });

  it("adds coastal identity without replacing the underlying terrain", () => {
    expect(townCharacterLabelForProfile("TUNDRA", true)).toBe("Tundra Town · Coastal Town");
    expect(townCharacterLabelForProfile("COASTAL_DESERT", false)).toBe("Sunscorched Trade Town · Coastal Town");
  });
});

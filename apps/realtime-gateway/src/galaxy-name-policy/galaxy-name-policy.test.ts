import { describe, expect, it } from "vitest";

import { validatePlanetName } from "./galaxy-name-policy.js";

describe("validatePlanetName", () => {
  it("accepts a normal planet name and trims surrounding whitespace", () => {
    const result = validatePlanetName("  Aethelgard  ");
    expect(result).toEqual({ ok: true, name: "Aethelgard" });
  });

  it("accepts names with spaces, apostrophes, and hyphens", () => {
    expect(validatePlanetName("New Terra")).toEqual({ ok: true, name: "New Terra" });
    expect(validatePlanetName("Kepler's Rest")).toEqual({ ok: true, name: "Kepler's Rest" });
    expect(validatePlanetName("Iron-Reach")).toEqual({ ok: true, name: "Iron-Reach" });
  });

  it("rejects names shorter than 2 characters", () => {
    const result = validatePlanetName("A");
    expect(result.ok).toBe(false);
  });

  it("rejects whitespace-only names", () => {
    const result = validatePlanetName("   ");
    expect(result.ok).toBe(false);
  });

  it("rejects names longer than 24 characters", () => {
    const result = validatePlanetName("A".repeat(25));
    expect(result.ok).toBe(false);
  });

  it("accepts a name at exactly the 24 character boundary", () => {
    const result = validatePlanetName("A".repeat(24));
    expect(result.ok).toBe(true);
  });

  it("rejects names starting with punctuation", () => {
    const result = validatePlanetName("-Terra");
    expect(result.ok).toBe(false);
  });

  it("rejects profane names", () => {
    const result = validatePlanetName("shitworld");
    expect(result.ok).toBe(false);
  });

  it("rejects profane names hidden behind leetspeak substitutions", () => {
    const result = validatePlanetName("5h1t planet");
    expect(result.ok).toBe(false);
  });

  it("rejects profane names regardless of case", () => {
    const result = validatePlanetName("FuckWorld");
    expect(result.ok).toBe(false);
  });
});

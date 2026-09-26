import { describe, expect, it } from "vitest";
import { computeCourtStrength, computeDomainWeight, rankDomainWeights } from "./galaxy-court.js";

describe("computeCourtStrength", () => {
  it("starts at 10 x Sector count: 300 for 30", () => {
    expect(computeCourtStrength({ totalSectors: 30, capturedSectors: 0, committedInfluence: 0 })).toMatchObject({ start: 300, current: 300, fallen: false });
  });
  it("-10 per captured Sector and -(Influence / 5) for Move Against the Court", () => {
    expect(computeCourtStrength({ totalSectors: 30, capturedSectors: 3, committedInfluence: 20 }).current).toBe(300 - 30 - 4);
  });
  it("capturing every Sector alone reaches exactly zero", () => {
    expect(computeCourtStrength({ totalSectors: 30, capturedSectors: 30, committedInfluence: 0 })).toMatchObject({ current: 0, fallen: true });
  });
  it("never goes below zero", () => {
    expect(computeCourtStrength({ totalSectors: 2, capturedSectors: 2, committedInfluence: 999 }).current).toBe(0);
  });
});

describe("computeDomainWeight", () => {
  const planet = (specialization: "INDUSTRIAL" | "CAPITAL") => ({ seasonId: "s", tier: "PLANET" as const, specialization });
  it("Planet = 10 + its Influence output, so a Capital world outweighs an Industrial one", () => {
    expect(computeDomainWeight({ holdings: [planet("INDUSTRIAL")], totalStability: 0, committedInfluence: 0 })).toBe(12);
    expect(computeDomainWeight({ holdings: [planet("CAPITAL")], totalStability: 0, committedInfluence: 0 })).toBe(14);
  });
  it("Outpost = 3 + its Influence output; Stability adds /100", () => {
    expect(computeDomainWeight({ holdings: [{ seasonId: "o", tier: "OUTPOST", specialization: "CAPITAL" }], totalStability: 100, committedInfluence: 0 })).toBe(6);
  });
  it("committing Influence to Move Against the Court adds Influence / 5", () => {
    const base = computeDomainWeight({ holdings: [planet("INDUSTRIAL")], totalStability: 100, committedInfluence: 0 });
    expect(computeDomainWeight({ holdings: [planet("INDUSTRIAL")], totalStability: 100, committedInfluence: 20 })).toBe(base + 4);
  });
});

describe("rankDomainWeights", () => {
  it("ranks highest first with deterministic tie-breaks", () => {
    const ranks = rankDomainWeights(new Map([["b", 12], ["a", 12], ["c", 30]]));
    expect(ranks.map((r) => `${r.authUid}:${r.rank}`)).toEqual(["c:1", "a:2", "b:3"]);
  });
});

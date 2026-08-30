import { describe, expect, it } from "vitest";
import type { DomainPlayer } from "@border-empires/game-domain";
import { firstThreeTownMultipliersForTile } from "./economy-network-first-three-towns.js";

const makePlayer = (domainIds: string[]): Pick<DomainPlayer, "techIds" | "domainIds"> => ({
  techIds: new Set<string>(),
  domainIds: new Set(domainIds)
});

// firstThreeTownMultipliersForTile is the single call every consumer (both
// the real gold/growth math and the wire display fields the tile overview
// reads) must go through — this is the fix for the bug history where those
// two consumers independently re-derived eligibility and drifted apart
// twice. This test locks in that both halves of its result move together.
describe("firstThreeTownMultipliersForTile", () => {
  it("returns 1.5x gold / 1.25x growth for an eligible tile when the player holds Mercantile Charter", () => {
    const player = makePlayer(["mercantile-charter"]);
    const result = firstThreeTownMultipliersForTile(player, new Set(["10,10"]), "10,10");
    expect(result).toEqual({ isFirstThree: true, goldMult: 1.5, popGrowthMult: 1.25 });
  });

  it("returns no bonus for a tile outside the first-three set even with the domain", () => {
    const player = makePlayer(["mercantile-charter"]);
    const result = firstThreeTownMultipliersForTile(player, new Set(["99,99"]), "10,10");
    expect(result).toEqual({ isFirstThree: false, goldMult: 1, popGrowthMult: 1 });
  });

  it("returns no bonus for an eligible tile when the player doesn't hold the domain", () => {
    const player = makePlayer([]);
    const result = firstThreeTownMultipliersForTile(player, new Set(["10,10"]), "10,10");
    expect(result).toEqual({ isFirstThree: true, goldMult: 1, popGrowthMult: 1 });
  });

  it("treats an undefined firstThreeTownKeys set as no bonus", () => {
    const player = makePlayer(["mercantile-charter"]);
    const result = firstThreeTownMultipliersForTile(player, undefined, "10,10");
    expect(result).toEqual({ isFirstThree: false, goldMult: 1, popGrowthMult: 1 });
  });
});

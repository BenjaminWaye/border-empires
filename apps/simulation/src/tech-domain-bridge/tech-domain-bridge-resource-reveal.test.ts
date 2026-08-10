import { describe, expect, it } from "vitest";
import { hasRevealedResourceForPlayer, revealedResourceValueForPlayer } from "./tech-domain-bridge.js";

// Regression coverage for a real bug: tile.resource values (FARM/FISH/TITANIUM/
// GEMS/UMBRITE) are raw terrain-resource types, not the strategic
// categories tech-tree.json's revealResource effect uses (food/titanium/
// crystal/umbrite). Comparing them directly only ever happened to work for
// TITANIUM (whose raw type and category name are spelled the same) — UMBRITE
// and CRYSTAL (GEMS) tiles stayed masked forever regardless of
// tech, since their raw type never equals their category name.
describe("hasRevealedResourceForPlayer", () => {
  it("FOOD (FARM/FISH) is always revealed, no tech required", () => {
    const player = { techIds: [] as string[] };
    expect(hasRevealedResourceForPlayer(player, "FARM")).toBe(true);
    expect(hasRevealedResourceForPlayer(player, "FISH")).toBe(true);
  });

  it("TITANIUM stays hidden without masonry, revealed with it", () => {
    expect(hasRevealedResourceForPlayer({ techIds: [] }, "TITANIUM")).toBe(false);
    expect(hasRevealedResourceForPlayer({ techIds: ["masonry"] }, "TITANIUM")).toBe(true);
  });

  it("UMBRITE tiles stay hidden without leatherworking, revealed with it", () => {
    expect(hasRevealedResourceForPlayer({ techIds: [] }, "UMBRITE")).toBe(false);
    expect(hasRevealedResourceForPlayer({ techIds: ["leatherworking"] }, "UMBRITE")).toBe(true);
  });

  it("CRYSTAL tiles (GEMS) stay hidden without crystal-lattices, revealed with it", () => {
    expect(hasRevealedResourceForPlayer({ techIds: [] }, "GEMS")).toBe(false);
    expect(hasRevealedResourceForPlayer({ techIds: ["crystal-lattices"] }, "GEMS")).toBe(true);
  });

  it("an unrelated tech doesn't reveal anything", () => {
    expect(hasRevealedResourceForPlayer({ techIds: ["agriculture"] }, "TITANIUM")).toBe(false);
    expect(hasRevealedResourceForPlayer({ techIds: ["agriculture"] }, "UMBRITE")).toBe(false);
    expect(hasRevealedResourceForPlayer({ techIds: ["agriculture"] }, "GEMS")).toBe(false);
  });
});

// revealedResourceValueForPlayer is the single shared helper every tile-wire-
// delta builder (streaming, login/full-export, fog-of-war first-exposure)
// must call instead of re-deriving this same masking logic inline -- three
// separate builders each did that inline this session, and each one
// individually forgot it at some point.
describe("revealedResourceValueForPlayer", () => {
  it("returns the resource value when revealed, undefined when masked", () => {
    expect(revealedResourceValueForPlayer("TITANIUM", { techIds: ["masonry"] })).toBe("TITANIUM");
    expect(revealedResourceValueForPlayer("TITANIUM", { techIds: [] })).toBeUndefined();
  });

  it("returns undefined when there is no resource or no viewer", () => {
    expect(revealedResourceValueForPlayer(undefined, { techIds: ["masonry"] })).toBeUndefined();
    expect(revealedResourceValueForPlayer("TITANIUM", undefined)).toBeUndefined();
  });
});

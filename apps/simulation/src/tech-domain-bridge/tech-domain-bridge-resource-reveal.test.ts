import { describe, expect, it } from "vitest";
import { hasRevealedResourceForPlayer, revealedResourceValueForPlayer } from "./tech-domain-bridge.js";

// Regression coverage for a real bug: tile.resource values (FARM/FISH/IRON/
// GEMS/WOOD/FUR) are raw terrain-resource types, not the strategic
// categories tech-tree.json's revealResource effect uses (food/iron/
// crystal/supply). Comparing them directly only ever happened to work for
// IRON (whose raw type and category name are spelled the same) — SUPPLY
// (WOOD/FUR) and CRYSTAL (GEMS) tiles stayed masked forever regardless of
// tech, since their raw type never equals their category name.
describe("hasRevealedResourceForPlayer", () => {
  it("FOOD (FARM/FISH) is always revealed, no tech required", () => {
    const player = { techIds: [] as string[] };
    expect(hasRevealedResourceForPlayer(player, "FARM")).toBe(true);
    expect(hasRevealedResourceForPlayer(player, "FISH")).toBe(true);
  });

  it("IRON stays hidden without masonry, revealed with it", () => {
    expect(hasRevealedResourceForPlayer({ techIds: [] }, "IRON")).toBe(false);
    expect(hasRevealedResourceForPlayer({ techIds: ["masonry"] }, "IRON")).toBe(true);
  });

  it("SUPPLY tiles (WOOD, FUR) stay hidden without leatherworking, revealed with it", () => {
    expect(hasRevealedResourceForPlayer({ techIds: [] }, "WOOD")).toBe(false);
    expect(hasRevealedResourceForPlayer({ techIds: [] }, "FUR")).toBe(false);
    expect(hasRevealedResourceForPlayer({ techIds: ["leatherworking"] }, "WOOD")).toBe(true);
    expect(hasRevealedResourceForPlayer({ techIds: ["leatherworking"] }, "FUR")).toBe(true);
  });

  it("CRYSTAL tiles (GEMS) stay hidden without crystal-lattices, revealed with it", () => {
    expect(hasRevealedResourceForPlayer({ techIds: [] }, "GEMS")).toBe(false);
    expect(hasRevealedResourceForPlayer({ techIds: ["crystal-lattices"] }, "GEMS")).toBe(true);
  });

  it("an unrelated tech doesn't reveal anything", () => {
    expect(hasRevealedResourceForPlayer({ techIds: ["agriculture"] }, "IRON")).toBe(false);
    expect(hasRevealedResourceForPlayer({ techIds: ["agriculture"] }, "WOOD")).toBe(false);
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
    expect(revealedResourceValueForPlayer("IRON", { techIds: ["masonry"] })).toBe("IRON");
    expect(revealedResourceValueForPlayer("IRON", { techIds: [] })).toBeUndefined();
  });

  it("returns undefined when there is no resource or no viewer", () => {
    expect(revealedResourceValueForPlayer(undefined, { techIds: ["masonry"] })).toBeUndefined();
    expect(revealedResourceValueForPlayer("IRON", undefined)).toBeUndefined();
  });
});

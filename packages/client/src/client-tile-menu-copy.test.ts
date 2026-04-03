import { describe, expect, it } from "vitest";
import { tileMenuOverviewIntroLines, tileMenuSubtitleText } from "./client-tile-menu-copy.js";

describe("tile menu copy ownership", () => {
  it("keeps owner and region in the subtitle", () => {
    expect(tileMenuSubtitleText("Unclaimed", "Ancient Heartland")).toBe("Unclaimed · Ancient Heartland");
  });

  it("does not duplicate region or owner lines for unclaimed land in overview", () => {
    expect(
      tileMenuOverviewIntroLines({
        terrain: "LAND",
        ownerKind: "unclaimed",
        productionLabel: "food"
      })
    ).toEqual([
      "Claim this tile first to turn it into frontier land.",
      "After you settle it, this tile can produce food."
    ]);
  });

  it("calls out neutral resource nodes explicitly in overview copy", () => {
    expect(
      tileMenuOverviewIntroLines({
        terrain: "LAND",
        ownerKind: "unclaimed",
        productionLabel: "iron",
        resourceLabel: "Iron"
      })
    ).toEqual([
      "Resource node: Iron.",
      "Claim this tile first to turn it into frontier land.",
      "After you settle it, this tile can produce iron."
    ]);
  });
});

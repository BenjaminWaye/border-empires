import { describe, expect, it } from "vitest";
import { tileMenuOverviewIntroLines, tileMenuSubtitleText } from "./client-tile-menu-copy.js";

describe("tile menu copy ownership", () => {
  it("keeps owner and region in the subtitle", () => {
    expect(tileMenuSubtitleText("Unclaimed", "Ancient Heartland")).toBe("Unclaimed · Ancient Heartland");
  });

  it("uses a single claim prompt for plain unclaimed land", () => {
    expect(
      tileMenuOverviewIntroLines({
        terrain: "LAND",
        ownerKind: "unclaimed",
        productionLabel: "food"
      })
    ).toEqual([
      "Claim this tile first to turn it into frontier land."
    ]);
  });

  it("collapses neutral resource node copy into a single actionable line", () => {
    expect(
      tileMenuOverviewIntroLines({
        terrain: "LAND",
        ownerKind: "unclaimed",
        productionLabel: "iron",
        resourceLabel: "Iron"
      })
    ).toEqual([
      "Resource node: Iron. Claim and settle this tile to start producing iron."
    ]);
  });
});

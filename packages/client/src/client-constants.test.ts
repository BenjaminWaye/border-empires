import { describe, expect, it } from "vitest";

import { isForestTile, settleCostLabelForTile, settleDurationMsForTile } from "./client-constants.js";

describe("client constants helpers", () => {
  it("keeps the settlement label in sync with the forest-adjusted duration rule", () => {
    for (const [x, y] of [
      [0, 0],
      [17, 29],
      [120, 220]
    ] as const) {
      expect(settleCostLabelForTile(x, y)).toBe(
        `4 gold • ${Math.round(settleDurationMsForTile(x, y) / 1000)}s${isForestTile(x, y) ? " (Forest)" : ""}`
      );
    }
  });

  it("uses the base settlement label for non-forest tiles", () => {
    expect(settleCostLabelForTile(0, 0)).toBe("4 gold • 60s");
  });
});

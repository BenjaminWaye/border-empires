import { describe, expect, it } from "vitest";

import { buildDetailTextForAction } from "./client-tile-action-detail-text.js";
import type { Tile } from "../client-types.js";

const baseTile: Tile = {
  x: 10,
  y: 10,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED"
};

describe("buildDetailTextForAction — build_observatory", () => {
  it("states the protection radius and that it pauses on cooldown", () => {
    const text = buildDetailTextForAction("build_observatory", baseTile);
    expect(text).toContain("blocks hostile crystal actions within");
    expect(text).toMatch(/within \d+ tiles/);
    expect(text).toContain("cooldown");
  });
});

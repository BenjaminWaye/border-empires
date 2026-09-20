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

describe("buildDetailTextForAction — build_mintworks", () => {
  it("describes the flat income, production bonus, and completion reward", () => {
    const text = buildDetailTextForAction("build_mintworks", baseTile);
    expect(text).toContain("+1 base gold income");
    expect(text).toContain("+10% town gold production");
    expect(text).toContain("+10 instant gold on completion");
  });
});

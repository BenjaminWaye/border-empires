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
    expect(text).toContain("protects your own tiles within");
    expect(text).toContain("never covers unclaimed land or other players' tiles");
    expect(text).toMatch(/within \d+ tiles/);
    expect(text).toContain("cooldown");
  });
});

describe("buildDetailTextForAction — build_mintworks", () => {
  it("describes the flat income, production bonus, and completion reward", () => {
    const text = buildDetailTextForAction("build_mintworks", baseTile);
    expect(text).toContain("+1 base coin income");
    expect(text).toContain("+10% town coin production");
    expect(text).toContain("+10 instant coin on completion");
  });
});

describe("buildDetailTextForAction — build_farmstead (Hydrogarden)", () => {
  it("says it adds +2 FOOD slots on grain resource tiles", () => {
    const text = buildDetailTextForAction("build_farmstead", { ...baseTile, resource: "FARM" });
    expect(text).toBe("Adds +2 FOOD slots on grain resource tiles.");
  });

  it("says it does not boost fish tiles", () => {
    expect(buildDetailTextForAction("build_farmstead", { ...baseTile, resource: "FISH" })).toBe("Hydrogardens do not boost fish output.");
  });
});

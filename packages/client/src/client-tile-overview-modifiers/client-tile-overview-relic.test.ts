import { describe, expect, it } from "vitest";

import { naturalWonderOverviewLine } from "./client-tile-overview-modifiers.js";
import type { Tile } from "../client-types.js";

describe("naturalWonderOverviewLine for relics", () => {
  // Regression: the Details text listed a relic's effect before a garrison activated it.
  it("keeps the effect hidden until the relic is garrisoned", () => {
    const relic = { x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", naturalWonder: { type: "BASTION_FRAME", relicVersion: 1 } } as Tile;
    expect(naturalWonderOverviewLine(relic, "mine-frontier")).toBe("Relic: Ancient Field Generator — dormant. Garrison to activate.");
    expect(naturalWonderOverviewLine({ ...relic, ownershipState: "SETTLED" }, "mine-settled")).toContain("+50% defense");
  });
});

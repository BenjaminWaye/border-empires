import { describe, expect, it } from "vitest";

import { titleLabelForTile } from "./client-tile-menu-structure-label.js";
import type { Tile } from "../client-types.js";

const baseDeps = {
  prettyToken: (value: string) => value,
  terrainLabel: (_x: number, _y: number, terrain: Tile["terrain"]) => terrain
};

const baseTile: Tile = {
  x: 90,
  y: 329,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED"
};

describe("titleLabelForTile", () => {
  it("names an economic structure instead of falling back to terrain", () => {
    const label = titleLabelForTile(
      { ...baseTile, economicStructure: { ownerId: "me", type: "UMBRITE_SYNTHESIZER", status: "active" } },
      baseDeps
    );
    expect(label).toBe("UMBRITE_SYNTHESIZER");
  });

  it("names a fort instead of falling back to terrain", () => {
    const label = titleLabelForTile(
      { ...baseTile, fort: { ownerId: "me", status: "active", variant: "TITANIUM_BASTION" } },
      baseDeps
    );
    expect(label).toBe("TITANIUM_BASTION");
  });

  it("falls back to terrain when no structure is present", () => {
    const label = titleLabelForTile(baseTile, baseDeps);
    expect(label).toBe("LAND");
  });
});

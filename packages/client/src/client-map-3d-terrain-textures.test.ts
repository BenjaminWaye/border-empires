import { describe, expect, it } from "vitest";

import { legacy3DTerrainPalette, textureEdgeBlendAt } from "./client-map-3d-terrain-textures.js";

describe("3d terrain textures", () => {
  it("brightens the grass and sand palette toward the legacy 2d look", () => {
    expect(legacy3DTerrainPalette.grassLight).toEqual([119, 142, 66]);
    expect(legacy3DTerrainPalette.grassDark).toEqual([94, 124, 48]);
    expect(legacy3DTerrainPalette.sand).toEqual([214, 184, 135]);
    expect(legacy3DTerrainPalette.seaCoast).toEqual([103, 154, 182]);
  });

  it("adds a strong edge blend near tile borders but not at the center", () => {
    expect(textureEdgeBlendAt(32, 32, 64, 2)).toBe(0);
    expect(textureEdgeBlendAt(0, 32, 64, 2)).toBeGreaterThan(0.9);
    expect(textureEdgeBlendAt(1, 32, 64, 2)).toBeGreaterThan(0.4);
    expect(textureEdgeBlendAt(2, 32, 64, 2)).toBe(0);
  });
});

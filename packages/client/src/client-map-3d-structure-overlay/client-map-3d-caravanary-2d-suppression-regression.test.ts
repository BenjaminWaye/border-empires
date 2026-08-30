import { describe, expect, it } from "vitest";
import { isStructureHandledBy3D } from "./client-map-3d-structure-overlay.js";

describe("CARAVANARY (trade nexus) 2D overlay suppression", () => {
  it("is reported as 3D-handled even though it isn't in the generic instanced-mesh set", () => {
    expect(isStructureHandledBy3D("CARAVANARY")).toBe(true);
  });

  it("still reports the Umbrite special cases as 3D-handled", () => {
    expect(isStructureHandledBy3D("UMBRITE_RIG")).toBe(true);
    expect(isStructureHandledBy3D("UMBRITE_WEAPONS_FACTORY")).toBe(true);
  });

  it("still reports generic instanced-mesh structures as 3D-handled", () => {
    expect(isStructureHandledBy3D("MINTWORKS")).toBe(true);
  });
});

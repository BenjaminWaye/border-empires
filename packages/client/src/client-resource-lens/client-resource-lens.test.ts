import { describe, expect, it } from "vitest";
import { diplomacyOverlayKey } from "../client-diplomacy-overlay/client-diplomacy-overlay.js";
import { ownershipPaint3D, resourceLensOwnerId, resourceLensTileColor } from "./client-resource-lens.js";

describe("Resources lens", () => {
  it("leaves territory paint alone while off", () => {
    expect(resourceLensTileColor({ showResourceOverlay: false }, { resource: "FARM" })).toBeUndefined();
    expect(ownershipPaint3D({}, { ownerId: "me", ownershipState: "FRONTIER" }, true, true)).toEqual({ ownerId: "me", ownershipState: "FRONTIER" });
    expect(ownershipPaint3D({}, { ownerId: "me" }, true, false)).toBeUndefined();
  });

  it("paints resource tiles in their resource colour and nothing else, owned or not", () => {
    const on = { showResourceOverlay: true };
    expect(resourceLensTileColor(on, { resource: "FARM" })).toBe("#e9f27b");
    expect(resourceLensTileColor(on, {})).toBeNull();
    expect(resourceLensTileColor(on, undefined)).toBeNull();
    // Owned land without a resource loses its owner colour entirely.
    expect(ownershipPaint3D(on, { ownerId: "me", ownershipState: "SETTLED" }, true, true)).toBeUndefined();
    // An unowned resource tile in sight is painted, settled-style, under the resource's pseudo-owner.
    expect(ownershipPaint3D(on, { resource: "GEMS" }, true, false)).toEqual({ ownerId: resourceLensOwnerId("GEMS"), ownershipState: "SETTLED", color: "#b175ff" });
    expect(ownershipPaint3D(on, { resource: "GEMS" }, false, false)).toBeUndefined();
  });

  it("changes the territory paint key so the 3D map and minimap repaint on toggle", () => {
    const base = { me: "me", allies: [], activeTruces: [], showDiplomacyOverlay: false };
    expect(diplomacyOverlayKey(base)).toBe("");
    expect(diplomacyOverlayKey({ ...base, showResourceOverlay: true })).toBe("resources");
  });
});

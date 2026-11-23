import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResourceType } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { refinedDepositAt } from "../client-refineries/refinery-scene.js";
import { addRawResourceInstance, umbriteDepositDrawnOnTile, type RawResourceOverlays } from "./client-map-3d-raw-resource-dispatch.js";

vi.mock("../client-refineries/refinery-scene.js", () => ({ refinedDepositAt: vi.fn(() => undefined) }));

const recordingOverlays = (): { overlays: RawResourceOverlays; drawn: string[] } => {
  const drawn: string[] = [];
  const tileOverlay = (name: string) => ({ addInstance: () => { drawn.push(name); } });
  return {
    drawn,
    overlays: {
      farmland: tileOverlay("farmland"),
      fishing: tileOverlay("fishing"),
      titaniumDeposit: tileOverlay("titaniumDeposit"),
      umbriteDeposit: tileOverlay("umbriteDeposit"),
      generic: { addInstance: (_x, _z, _y, resource) => { drawn.push(`generic:${resource}`); } }
    }
  };
};

const tileWith = (resource: ResourceType, type?: NonNullable<Tile["economicStructure"]>["type"]): Tile => ({
  x: 4, y: 4, terrain: "LAND", ownerId: "p", ownershipState: "SETTLED", resource,
  ...(type ? { economicStructure: { ownerId: "p", type, status: "active" } } : {})
});

const dispatch = (resource: ResourceType, tile: Tile | undefined): string[] => {
  const { overlays, drawn } = recordingOverlays();
  addRawResourceInstance(overlays, resource, tile, { sceneX: 0, sceneZ: 0, surfaceY: 0, flatOverlayY: 0, worldTileX: 4, worldTileY: 4 }, () => undefined);
  return drawn;
};

describe("addRawResourceInstance", () => {
  it.each([
    ["TITANIUM", "titaniumDeposit"],
    ["UMBRITE", "umbriteDeposit"],
    ["GEMS", "generic:GEMS"],
    ["FARM", "farmland"],
    ["FISH", "fishing"]
  ] as const)("draws a bare %s tile with its raw overlay", (resource, overlay) => {
    expect(dispatch(resource, tileWith(resource))).toEqual([overlay]);
    expect(dispatch(resource, undefined)).toEqual([overlay]);
  });

  it.each([
    ["FARM", "HYDROGARDEN"]
  ] as const)("draws nothing raw for %s under a %s", (resource, building) => {
    expect(dispatch(resource, tileWith(resource, building))).toEqual([]);
  });

  it("keeps the raw deposit under a structure that does not replace it", () => {
    // Strategic deposits take no on-tile building since town refineries; any stray structure leaves them drawn.
    expect(dispatch("TITANIUM", tileWith("TITANIUM", "MANUFACTORY"))).toEqual(["titaniumDeposit"]);
    expect(dispatch("UMBRITE", tileWith("UMBRITE", "TITANIUM_REFINERY"))).toEqual(["umbriteDeposit"]);
    // Buildings other than the hydroponic dome keep the farm readable; they
    // are lifted onto the plot instead (FarmlandOverlay.standLiftAt).
    expect(dispatch("FARM", tileWith("FARM", "HYDROWORKS"))).toEqual(["farmland"]);
    expect(dispatch("FARM", tileWith("FARM", "MINISTRY_HALL"))).toEqual(["farmland"]);
  });

  it("reports the Umbrite deposit (which brings its own trees) exactly when it is drawn", () => {
    expect(umbriteDepositDrawnOnTile("UMBRITE", tileWith("UMBRITE"), 4, 4)).toBe(true);
    expect(umbriteDepositDrawnOnTile("UMBRITE", undefined, 4, 4)).toBe(true);
    expect(umbriteDepositDrawnOnTile("TITANIUM", tileWith("TITANIUM"), 4, 4)).toBe(false);
    expect(umbriteDepositDrawnOnTile(undefined, tileWith("UMBRITE"), 4, 4)).toBe(false);
  });

  afterEach(() => { vi.mocked(refinedDepositAt).mockReturnValue(undefined); });

  it("seats the Umbrite deposit on the hill dome (flatOverlayY), not the prop height", () => {
    const ys: number[] = [];
    const { overlays } = recordingOverlays();
    const withY = { ...overlays, umbriteDeposit: { addInstance: (_x: number, _z: number, y: number) => { ys.push(y); } } };
    addRawResourceInstance(withY, "UMBRITE", tileWith("UMBRITE"), { sceneX: 0, sceneZ: 0, surfaceY: 0.5, flatOverlayY: 0.2, worldTileX: 4, worldTileY: 4 }, () => undefined);
    expect(ys).toEqual([0.2]);
  });

  it("does not report the deposit where a refinery's rig replaces it, but does under a structure", () => {
    vi.mocked(refinedDepositAt).mockReturnValue("UMBRITE");
    expect(umbriteDepositDrawnOnTile("UMBRITE", tileWith("UMBRITE"), 4, 4)).toBe(false);
    // A structure on the tile keeps the raw deposit (and the forest gate removes the trees itself).
    expect(umbriteDepositDrawnOnTile("UMBRITE", tileWith("UMBRITE", "TITANIUM_REFINERY"), 4, 4)).toBe(true);
  });
});

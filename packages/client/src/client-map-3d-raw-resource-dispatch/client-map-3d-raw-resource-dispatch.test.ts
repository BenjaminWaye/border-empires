import { describe, expect, it } from "vitest";
import type { ResourceType } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { addRawResourceInstance, type RawResourceOverlays } from "./client-map-3d-raw-resource-dispatch.js";

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
  addRawResourceInstance(overlays, resource, tile, { sceneX: 0, sceneZ: 0, surfaceY: 0, worldTileX: 4, worldTileY: 4 }, () => undefined);
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
    ["TITANIUM", "MINE"],
    ["GEMS", "MINE"],
    ["UMBRITE", "UMBRITE_RIG"],
    ["FARM", "HYDROGARDEN"]
  ] as const)("draws nothing raw for %s under a %s", (resource, building) => {
    expect(dispatch(resource, tileWith(resource, building))).toEqual([]);
  });

  it("keeps the raw deposit under a structure that does not replace it", () => {
    expect(dispatch("TITANIUM", tileWith("TITANIUM", "UMBRITE_RIG"))).toEqual(["titaniumDeposit"]);
    expect(dispatch("UMBRITE", tileWith("UMBRITE", "MINE"))).toEqual(["umbriteDeposit"]);
  });
});

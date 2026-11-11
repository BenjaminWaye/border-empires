import { describe, expect, it } from "vitest";
import { Color } from "three";
import { paintTerritoryTile3D, type TerritoryPaintDeps } from "./client-map-3d-territory-paint.js";
import type { BarbarianFrontierTintTracker } from "../client-map-3d-barbarian-frontier-tint.js";
import type { Tile } from "../client-types.js";

const setup = (showResourceOverlay: boolean) => {
  const colors: string[] = [];
  const deps: TerritoryPaintDeps = {
    state: { showResourceOverlay },
    placement: {
      overlay: {
        addTile: (...args) => { colors.push(`#${(args[12] as Color).getHexString()}`); return 0; },
        addHillTile: () => 0
      },
      cornerYAt: () => 0, isHillsTile: () => false, hillCutAt: () => undefined,
      neighbours: { tiles: new Map(), keyFor: (x, y) => `${x},${y}`, wrapX: (x) => x, wrapY: (y) => y },
      frontierDecayPulse: { track: () => undefined },
      barbarianFrontierTint: { track: () => undefined }
    },
    effectiveOverlayColor: () => "#ff0000",
    barbarianFrontierTint: { observeTile: () => undefined } as unknown as BarbarianFrontierTintTracker,
    scratch: new Color()
  };
  return { deps, colors };
};

const at = (tile: Tile | undefined, isOwnedLand: boolean) => ({ tile, tileKey: "5,5", wx: 5, wy: 5, x: 0, z: 0, visibleLand: true, isOwnedLand });
const land = (over: Partial<Tile>): Tile => ({ x: 5, y: 5, terrain: "LAND", ...over });

describe("paintTerritoryTile3D", () => {
  it("paints owned land in its owner's colour while the Resources lens is off", () => {
    const { deps, colors } = setup(false);
    expect(paintTerritoryTile3D(deps, at(land({ ownerId: "a", ownershipState: "SETTLED", resource: "FARM" }), true))).toBeDefined();
    expect(colors).toEqual(["#ff0000"]);
  });

  it("on the Resources lens paints only resource tiles, in the resource colour, owned or not", () => {
    const { deps, colors } = setup(true);
    expect(paintTerritoryTile3D(deps, at(land({ ownerId: "a", ownershipState: "SETTLED" }), true))).toBeUndefined();
    paintTerritoryTile3D(deps, at(land({ resource: "GEMS" }), false));
    paintTerritoryTile3D(deps, at(land({ ownerId: "a", ownershipState: "FRONTIER", resource: "FARM" }), true));
    expect(colors).toEqual(["#b175ff", "#e9f27b"]);
  });

  it("paints nothing for an unknown tile", () => {
    const { deps, colors } = setup(false);
    expect(paintTerritoryTile3D(deps, at(undefined, false))).toBeUndefined();
    expect(colors).toEqual([]);
  });
});

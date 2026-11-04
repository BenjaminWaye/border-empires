import { describe, expect, it } from "vitest";
import { Color } from "three";
import { placeOwnershipTile3D, type OwnershipTilePlacementDeps } from "./client-map-3d-ownership-tile.js";
import { EDGE_E, EDGE_NE, EDGE_SE } from "../client-settled-edge-glow/client-settled-edge-glow.js";

type Call = { kind: "flat" | "hill"; isFrontier: boolean; edgeMask: number | undefined };

const setup = (opts: { hills?: boolean; capacity?: boolean } = {}) => {
  const calls: Call[] = [];
  const pulses: number[] = [];
  const index = opts.capacity === false ? -1 : 3;
  const tiles = new Map([
    ["4,5", { ownerId: "a", ownershipState: "SETTLED" }],
    ["5,5", { ownerId: "a", ownershipState: "SETTLED" }],
    ["6,5", { ownerId: "a", ownershipState: "FRONTIER" }]
  ]);
  for (const y of [4, 6]) for (const x of [4, 5]) tiles.set(`${x},${y}`, { ownerId: "a", ownershipState: "SETTLED" });
  const deps: OwnershipTilePlacementDeps = {
    overlay: {
      addTile: (...args) => { calls.push({ kind: "flat", isFrontier: args[13], edgeMask: args[14] }); return index; },
      addHillTile: (...args) => { calls.push({ kind: "hill", isFrontier: args[9], edgeMask: args[14] }); return index; }
    },
    cornerYAt: () => 0,
    isHillsTile: () => opts.hills ?? false,
    hillCutAt: () => undefined,
    neighbours: { tiles, keyFor: (x, y) => `${x},${y}`, wrapX: (x) => x, wrapY: (y) => y },
    frontierDecayPulse: { track: (entry) => { pulses.push(entry.index); } },
    barbarianFrontierTint: { track: () => undefined }
  };
  return { deps, calls, pulses };
};

const base = { tile: {}, ownerId: "a", wx: 5, wy: 5, x: 0, z: 0, ownerColor: new Color("#ff0000"), barbarianTintTransition: undefined } as const;

describe("placeOwnershipTile3D", () => {
  it("passes a settled tile's edge mask, counting its own frontier as boundary", () => {
    const { deps, calls } = setup();
    placeOwnershipTile3D(deps, { ...base, ownershipState: "SETTLED" });
    // East is the owner's frontier; NE/SE are unowned.
    expect(calls).toEqual([{ kind: "flat", isFrontier: false, edgeMask: EDGE_E | EDGE_NE | EDGE_SE }]);
  });

  it("drapes hill tiles with the same mask", () => {
    const { deps, calls } = setup({ hills: true });
    placeOwnershipTile3D(deps, { ...base, ownershipState: "SETTLED" });
    expect(calls).toEqual([{ kind: "hill", isFrontier: false, edgeMask: EDGE_E | EDGE_NE | EDGE_SE }]);
  });

  it("gives frontier tiles no mask and tracks their decay pulse at the returned index", () => {
    const { deps, calls, pulses } = setup();
    placeOwnershipTile3D(deps, { ...base, ownershipState: "FRONTIER", tile: { frontierDecayAt: 1000 } });
    expect(calls).toEqual([{ kind: "flat", isFrontier: true, edgeMask: 0 }]);
    expect(pulses).toEqual([3]);
  });

  it("skips tracking when the overlay bucket is full", () => {
    const { deps, pulses } = setup({ capacity: false });
    placeOwnershipTile3D(deps, { ...base, ownershipState: "FRONTIER", tile: { frontierDecayAt: 1000 } });
    expect(pulses).toEqual([]);
  });
});

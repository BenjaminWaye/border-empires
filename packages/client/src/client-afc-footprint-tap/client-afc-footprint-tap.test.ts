import { describe, expect, it } from "vitest";
import { Scene } from "three";
import { WORLD_WIDTH } from "@border-empires/shared";
import { createFabricationComplexOverlay } from "../client-map-3d-fabrication-complex.js";
import type { Tile } from "../client-types.js";
import { afcArmSocketForTile, afcArmTapMenuOptions, ownAfcFootprintTapTarget } from "./client-afc-footprint-tap.js";

const land = (x: number, y: number, ownerId?: string, extra: Partial<Tile> = {}): Tile =>
  ({ x, y, terrain: "LAND", ownerId, ownershipState: ownerId ? "SETTLED" : undefined, ...extra }) as Tile;

const afcWorld = (ownerId: string): Map<string, Tile> => {
  const tiles = new Map<string, Tile>();
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const x = 20 + dx, y = 20 + dy;
      const afc = dx === 0 && dy === 0 ? { afc: { ownerId, status: "active" as const } } : {};
      tiles.set(`${x},${y}`, land(x, y, ownerId, afc));
    }
  }
  tiles.set("22,20", land(22, 20, ownerId));
  return tiles;
};

describe("ownAfcFootprintTapTarget", () => {
  it("routes a tap on an own AFC support tile to the AFC centre", () => {
    const tiles = afcWorld("me");
    expect(ownAfcFootprintTapTarget(tiles, "me", 19, 21)).toMatchObject({ x: 20, y: 20 });
    expect(ownAfcFootprintTapTarget(tiles, "me", 21, 20)).toMatchObject({ x: 20, y: 20 });
  });

  it("leaves the centre itself and tiles outside the footprint alone", () => {
    const tiles = afcWorld("me");
    expect(ownAfcFootprintTapTarget(tiles, "me", 20, 20)).toBeUndefined();
    expect(ownAfcFootprintTapTarget(tiles, "me", 22, 20)).toBeUndefined();
  });

  it("does not redirect taps on another player's AFC footprint", () => {
    expect(ownAfcFootprintTapTarget(afcWorld("enemy"), "me", 19, 21)).toBeUndefined();
  });

  it("keeps a footprint tile with its own building as its own tap target", () => {
    const tiles = afcWorld("me");
    tiles.set("19,21", land(19, 21, "me", { fort: { ownerId: "me", status: "active" } } as Partial<Tile>));
    expect(ownAfcFootprintTapTarget(tiles, "me", 19, 21)).toBeUndefined();
  });
});

describe("afcArmSocketForTile", () => {
  it("names the socket whose 3D arm reaches each footprint tile", () => {
    const overlay = createFabricationComplexOverlay(new Scene(), 1);
    overlay.addInstance(0, 0, 0, 20, 20);
    try {
      for (const attachment of overlay.moduleSocketAttachments(0)) {
        // Scene x/z run with world x/y; the bay sits over the footprint tile in that direction.
        const x = 20 + Math.round(attachment.x / Math.hypot(attachment.x, attachment.z));
        const y = 20 + Math.round(attachment.z / Math.hypot(attachment.x, attachment.z));
        expect(afcArmSocketForTile({ x: 20, y: 20 }, x, y)).toBe(attachment.socketIndex);
      }
    } finally {
      overlay.dispose();
    }
  });

  it("numbers east first, then clockwise, and ignores the centre and far tiles", () => {
    const centre = { x: 20, y: 20 };
    expect([[21, 20], [21, 21], [20, 21], [19, 21], [19, 20], [19, 19], [20, 19], [21, 19]].map(([x, y]) => afcArmSocketForTile(centre, x!, y!))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(afcArmSocketForTile(centre, 20, 20)).toBeUndefined();
    expect(afcArmSocketForTile(centre, 22, 20)).toBeUndefined();
  });

  it("handles an AFC beside the world's wrap seam", () => {
    expect(afcArmSocketForTile({ x: 0, y: 5 }, WORLD_WIDTH - 1, 5)).toBe(4);
    expect(afcArmSocketForTile({ x: WORLD_WIDTH - 1, y: 5 }, 0, 6)).toBe(1);
    expect(afcArmTapMenuOptions({ x: 20, y: 20, afc: { ownerId: "me", status: "active" } }, 20, 19)).toEqual({ afcArmSocket: 6 });
    expect(afcArmTapMenuOptions({ x: 20, y: 20 }, 20, 19)).toBeUndefined();
  });
});

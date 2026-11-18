import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { ownAfcFootprintTapTarget } from "./client-afc-footprint-tap.js";

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

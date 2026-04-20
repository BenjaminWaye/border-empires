import { describe, expect, it } from "vitest";
import {
  fortificationOpeningForTile,
  fortificationOverlayKindForTile,
  fortificationOverlayAlphaForTile,
  isFortificationOverlayTile
} from "./client-fortification-overlays.js";
import type { Tile } from "./client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const wrap = (value: number): number => value;

const landTile = (x: number, y: number): Tile => ({
  x,
  y,
  terrain: "LAND",
  ownerId: "p1",
  ownershipState: "SETTLED"
});

describe("fortification overlay selection", () => {
  it("opens paired fortifications toward each other", () => {
    const north = {
      ...landTile(4, 4),
      fort: { ownerId: "p1", status: "active" as const }
    };
    const south = {
      ...landTile(4, 5),
      fort: { ownerId: "p1", status: "active" as const }
    };
    const tiles = new Map<string, Tile>([
      [keyFor(north.x, north.y), north],
      [keyFor(south.x, south.y), south]
    ]);

    expect(fortificationOpeningForTile(north, { tiles, keyFor, wrapX: wrap, wrapY: wrap })).toBe("SOUTH");
    expect(fortificationOpeningForTile(south, { tiles, keyFor, wrapX: wrap, wrapY: wrap })).toBe("NORTH");
  });

  it("opens fortifications horizontally toward the nearest matching neighbor", () => {
    const west = {
      ...landTile(7, 3),
      fort: { ownerId: "p1", status: "active" as const }
    };
    const east = {
      ...landTile(8, 3),
      fort: { ownerId: "p1", status: "active" as const }
    };
    const tiles = new Map<string, Tile>([
      [keyFor(west.x, west.y), west],
      [keyFor(east.x, east.y), east]
    ]);

    expect(fortificationOpeningForTile(west, { tiles, keyFor, wrapX: wrap, wrapY: wrap })).toBe("EAST");
    expect(fortificationOpeningForTile(east, { tiles, keyFor, wrapX: wrap, wrapY: wrap })).toBe("WEST");
  });

  it("treats wooden forts and light outposts as fortification overlay tiles", () => {
    const woodenFort = {
      ...landTile(1, 1),
      economicStructure: { ownerId: "p1", type: "WOODEN_FORT" as const, status: "under_construction" as const }
    };
    const lightOutpost = {
      ...landTile(2, 1),
      economicStructure: { ownerId: "p1", type: "LIGHT_OUTPOST" as const, status: "removing" as const }
    };

    expect(isFortificationOverlayTile(woodenFort)).toBe(true);
    expect(isFortificationOverlayTile(lightOutpost)).toBe(true);
    expect(fortificationOverlayKindForTile(woodenFort)).toBe("WOODEN_FORT");
    expect(fortificationOverlayKindForTile(lightOutpost)).toBe("LIGHT_OUTPOST");
    expect(fortificationOverlayAlphaForTile(woodenFort)).toBe(0.82);
    expect(fortificationOverlayAlphaForTile(lightOutpost)).toBe(0.64);
  });

  it("keeps light outposts non-directional", () => {
    const tile = {
      ...landTile(2, 2),
      economicStructure: { ownerId: "p1", type: "LIGHT_OUTPOST" as const, status: "active" as const }
    };
    const tiles = new Map<string, Tile>([[keyFor(tile.x, tile.y), tile]]);

    expect(fortificationOpeningForTile(tile, { tiles, keyFor, wrapX: wrap, wrapY: wrap })).toBe("CLOSED");
  });

  it("keeps siege outposts non-directional", () => {
    const siegeOutpost = {
      ...landTile(5, 5),
      siegeOutpost: { ownerId: "p1", status: "active" as const }
    };
    const enemy = { ...landTile(6, 5), ownerId: "p2" };
    const tiles = new Map<string, Tile>([
      [keyFor(siegeOutpost.x, siegeOutpost.y), siegeOutpost],
      [keyFor(enemy.x, enemy.y), enemy]
    ]);

    expect(fortificationOpeningForTile(siegeOutpost, { tiles, keyFor, wrapX: wrap, wrapY: wrap })).toBe("CLOSED");
  });

  it("does not open toward enemy or mixed fortifications", () => {
    const fort = {
      ...landTile(4, 4),
      fort: { ownerId: "p1", status: "active" as const }
    };
    const enemyFort = {
      ...landTile(5, 4),
      ownerId: "p2",
      fort: { ownerId: "p2", status: "active" as const }
    };
    const lightOutpost = {
      ...landTile(4, 5),
      economicStructure: { ownerId: "p1", type: "LIGHT_OUTPOST" as const, status: "active" as const }
    };
    const tiles = new Map<string, Tile>([
      [keyFor(fort.x, fort.y), fort],
      [keyFor(enemyFort.x, enemyFort.y), enemyFort],
      [keyFor(lightOutpost.x, lightOutpost.y), lightOutpost]
    ]);

    expect(fortificationOpeningForTile(fort, { tiles, keyFor, wrapX: wrap, wrapY: wrap })).toBe("CLOSED");
  });
});

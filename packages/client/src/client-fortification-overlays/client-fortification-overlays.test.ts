import { describe, expect, it } from "vitest";
import {
  fortificationOpeningForTile,
  fortificationOverlayKindForTile,
  fortificationOverlayAlphaForTile,
  isFortificationOverlayTile,
  nearestSiegeOutpostTileForBattle,
  siegeAimAwareFacingRadiansForTile
} from "./client-fortification-overlays.js";
import type { Tile } from "../client-types.js";

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

  it("treats wooden forts and Relay Beacons as fortification overlay tiles", () => {
    const woodenFort = {
      ...landTile(1, 1),
      economicStructure: { ownerId: "p1", type: "WOODEN_FORT" as const, status: "under_construction" as const }
    };
    const relayBeacon = {
      ...landTile(2, 1),
      economicStructure: { ownerId: "p1", type: "RELAY_BEACON" as const, status: "removing" as const }
    };

    expect(isFortificationOverlayTile(woodenFort)).toBe(true);
    expect(isFortificationOverlayTile(relayBeacon)).toBe(true);
    expect(fortificationOverlayKindForTile(woodenFort)).toBe("WOODEN_FORT");
    expect(fortificationOverlayKindForTile(relayBeacon)).toBe("RELAY_BEACON");
    expect(fortificationOverlayAlphaForTile(woodenFort)).toBe(0.82);
    expect(fortificationOverlayAlphaForTile(relayBeacon)).toBe(0.64);
  });

  it("keeps Relay Beacons non-directional", () => {
    const tile = {
      ...landTile(2, 2),
      economicStructure: { ownerId: "p1", type: "RELAY_BEACON" as const, status: "active" as const }
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
    const relayBeacon = {
      ...landTile(4, 5),
      economicStructure: { ownerId: "p1", type: "RELAY_BEACON" as const, status: "active" as const }
    };
    const tiles = new Map<string, Tile>([
      [keyFor(fort.x, fort.y), fort],
      [keyFor(enemyFort.x, enemyFort.y), enemyFort],
      [keyFor(relayBeacon.x, relayBeacon.y), relayBeacon]
    ]);

    expect(fortificationOpeningForTile(fort, { tiles, keyFor, wrapX: wrap, wrapY: wrap })).toBe("CLOSED");
  });
});

const siegeOutpostTile = (x: number, y: number, ownerId: string): Tile => ({
  ...landTile(x, y),
  ownerId,
  siegeOutpost: { ownerId, status: "active" }
});

describe("nearestSiegeOutpostTileForBattle", () => {
  it("finds the nearest attacker-owned siege structure within range", () => {
    const near = siegeOutpostTile(5, 5, "attacker");
    const far = siegeOutpostTile(2, 2, "attacker");
    const rival = siegeOutpostTile(5, 6, "defender");
    const tiles = new Map<string, Tile>([
      [keyFor(near.x, near.y), near],
      [keyFor(far.x, far.y), far],
      [keyFor(rival.x, rival.y), rival]
    ]);

    const result = nearestSiegeOutpostTileForBattle({ tiles, keyFor, wrapX: wrap, wrapY: wrap }, 5, 4, "attacker");

    expect(result).toEqual({ x: 5, y: 5 });
  });

  it("returns undefined when no attacker-owned siege structure is in range", () => {
    const rival = siegeOutpostTile(5, 5, "defender");
    const tiles = new Map<string, Tile>([[keyFor(rival.x, rival.y), rival]]);

    expect(nearestSiegeOutpostTileForBattle({ tiles, keyFor, wrapX: wrap, wrapY: wrap }, 5, 4, "attacker")).toBeUndefined();
  });
});

describe("siegeAimAwareFacingRadiansForTile", () => {
  it("aims at the override target while it hasn't expired", () => {
    const battery = siegeOutpostTile(5, 5, "attacker");
    const tiles = new Map<string, Tile>([[keyFor(battery.x, battery.y), battery]]);
    const overrides = new Map([[keyFor(5, 5), { targetX: 8, targetY: 5, expiresAt: 1000 }]]);

    const facing = siegeAimAwareFacingRadiansForTile(battery, { tiles, keyFor, wrapX: wrap, wrapY: wrap }, overrides, 500);

    expect(facing).toBeCloseTo(Math.atan2(3, 0));
  });

  it("falls back to the nearest-rival heuristic once the override expires", () => {
    const battery = siegeOutpostTile(5, 5, "attacker");
    const rival = { ...landTile(6, 5), ownerId: "defender" };
    const tiles = new Map<string, Tile>([
      [keyFor(battery.x, battery.y), battery],
      [keyFor(rival.x, rival.y), rival]
    ]);
    const overrides = new Map([[keyFor(5, 5), { targetX: 8, targetY: 5, expiresAt: 1000 }]]);

    const facing = siegeAimAwareFacingRadiansForTile(battery, { tiles, keyFor, wrapX: wrap, wrapY: wrap }, overrides, 1500);

    expect(facing).toBeCloseTo(Math.atan2(1, 0));
  });
});

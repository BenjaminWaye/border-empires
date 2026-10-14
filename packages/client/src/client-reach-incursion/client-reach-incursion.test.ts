import { describe, expect, it } from "vitest";
import { incursionHatchColors, incursionMarkColor, incursionNeighbourKindAt, incursionOwnerAt, incursionPocketEdges, type IncursionTile } from "./client-reach-incursion.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const wrap = (v: number): number => ((v % 10) + 10) % 10;
const tilesFrom = (owners: Record<string, string>): Map<string, IncursionTile> =>
  new Map(Object.entries(owners).map(([key, ownerId]) => [key, { ownerId }]));

describe("incursionOwnerAt", () => {
  const myReach = new Set(["1,1", "2,1", "3,1"]);

  it("flags a rival-owned tile inside my reach", () => {
    expect(incursionOwnerAt({ ownerId: "rival" }, "2,1", "me", myReach)).toBe("rival");
  });

  it("ignores my own tiles, tiles outside my reach, unowned tiles and barbarians", () => {
    expect(incursionOwnerAt({ ownerId: "me" }, "2,1", "me", myReach)).toBeUndefined();
    expect(incursionOwnerAt({ ownerId: "rival" }, "9,9", "me", myReach)).toBeUndefined();
    expect(incursionOwnerAt({}, "2,1", "me", myReach)).toBeUndefined();
    expect(incursionOwnerAt({ ownerId: "barbarian-1" }, "2,1", "me", myReach)).toBeUndefined();
  });

  it("is off until my reach is known", () => {
    expect(incursionOwnerAt({ ownerId: "rival" }, "2,1", "me", undefined)).toBeUndefined();
  });
});

describe("incursionPocketEdges", () => {
  it("outlines only the sides facing ground the intruder does not hold", () => {
    // Rival holds a 2-tile pocket (1,1)-(2,1) surrounded by my tiles.
    const tiles = tilesFrom({ "1,1": "rival", "2,1": "rival", "0,1": "me", "3,1": "me", "1,0": "me", "2,0": "me", "1,2": "me", "2,2": "me" });
    const deps = { tiles, keyFor, wrapX: wrap, wrapY: wrap };
    expect(incursionPocketEdges(1, 1, "rival", deps)).toEqual({ north: true, east: false, south: true, west: true });
    expect(incursionPocketEdges(2, 1, "rival", deps)).toEqual({ north: true, east: true, south: true, west: false });
  });

  it("wraps around the world edge", () => {
    const tiles = tilesFrom({ "0,0": "rival", "9,0": "rival" });
    expect(incursionPocketEdges(0, 0, "rival", { tiles, keyFor, wrapX: wrap, wrapY: wrap }).west).toBe(false);
  });
});

describe("incursionMarkColor", () => {
  it("uses white marks on dark intruder colours and dark marks on light ones", () => {
    expect(incursionMarkColor("#0b1dda")).toBe("#ffffff");
    expect(incursionMarkColor("#2f3842")).toBe("#ffffff");
    expect(incursionMarkColor("#39ff14")).toBe("#141414");
    expect(incursionMarkColor("#ffa500")).toBe("#141414");
  });
});

describe("incursionHatchColors", () => {
  it("pairs the intruder's colour with mine when they are distinct", () => {
    expect(incursionHatchColors("#0b1dda", "#39ff14")).toEqual({ theirs: "#0b1dda", mine: "#39ff14" });
  });

  it("lightens my stripe when the two colours are too close to tell apart", () => {
    const { theirs, mine } = incursionHatchColors("#e25822", "#e8602a");
    expect(theirs).toBe("#e25822");
    expect(mine).not.toBe("#e8602a");
    expect(parseInt(mine.slice(3, 5), 16)).toBeGreaterThan(0x60);
  });
});

describe("incursionNeighbourKindAt", () => {
  it("tells the intruder's pocket inside my reach apart from their own land behind the old border", () => {
    // Rival tiles at (2,1) (inside my reach) and (3,1) (outside it); mine at (1,1); a third empire at (2,2).
    const tiles = tilesFrom({ "1,1": "me", "2,1": "rival", "3,1": "rival", "2,2": "other-empire" });
    const kindAt = incursionNeighbourKindAt(2, 1, "rival", "me", { tiles, keyFor, wrapX: wrap, wrapY: wrap }, new Set(["1,1", "2,1"]));
    expect(kindAt(0, 0)).toBe("pocket");
    expect(kindAt(1, 0)).toBe("rival");
    expect(kindAt(-1, 0)).toBe("mine");
    expect(kindAt(0, 1)).toBe("other");
    expect(kindAt(0, -1)).toBe("other"); // unknown / unowned
  });
});

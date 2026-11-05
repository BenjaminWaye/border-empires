import { describe, expect, it } from "vitest";
import type { DockPair, Tile } from "../client-types.js";
import { drawLandingGround2D } from "./client-dock-landing-ground-2d.js";
import { landingAshoreDirection, landingGroundKeysForSelection, landingGroundMenuLine, seaLaneSupplyLinksFor } from "./client-dock-landing-ground.js";

// My dock at (5,5) links to a far dock at (40,40). The far harbour has sea to
// the north (row 39), so (39,40) and (41,40) are beaches; (40,41) is inland.
// My own dock has sea to its west, so (5,4) and (5,6) are my beaches.
const tile = (x: number, y: number, overrides: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ...overrides });
const world = (extra: Tile[] = []) => {
  const tiles = new Map<string, Tile>();
  const put = (t: Tile) => tiles.set(`${t.x},${t.y}`, t);
  for (let x = 38; x <= 42; x += 1) put(tile(x, 39, { terrain: "SEA" }));
  for (let x = 38; x <= 42; x += 1) for (let y = 40; y <= 42; y += 1) put(tile(x, y));
  for (let y = 3; y <= 7; y += 1) put(tile(4, y, { terrain: "SEA" }));
  for (let y = 3; y <= 7; y += 1) for (let x = 5; x <= 7; x += 1) put(tile(x, y, { ownerId: "me", ownershipState: "SETTLED" }));
  put(tile(5, 5, { ownerId: "me", ownershipState: "SETTLED", dockId: "dock-a" }));
  put(tile(40, 40, { dockId: "dock-b" }));
  for (const t of extra) put(t);
  const dockPairs: DockPair[] = [{ ax: 5, ay: 5, bx: 40, by: 40, route: [{ x: 41, y: 38 }, { x: 4, y: 5 }] }];
  return { tiles, dockPairs, me: "me" };
};

describe("landingGroundKeysForSelection", () => {
  it("shows the landing ground at both ends of a selected dock's sea lanes", () => {
    const keys = landingGroundKeysForSelection({ ...world(), selected: { x: 5, y: 5 } });
    expect(keys).toEqual(new Set(["5,5", "5,4", "5,6", "40,40", "39,40", "41,40"]));
  });

  it("shows a harbour's landing ground when one of its beaches is selected", () => {
    const keys = landingGroundKeysForSelection({ ...world(), selected: { x: 41, y: 40 } });
    expect(keys).toEqual(new Set(["40,40", "39,40", "41,40"]));
  });

  it("shows nothing for inland ground or with nothing selected", () => {
    expect(landingGroundKeysForSelection({ ...world(), selected: { x: 40, y: 41 } }).size).toBe(0);
    expect(landingGroundKeysForSelection({ ...world(), selected: undefined }).size).toBe(0);
  });
});

describe("seaLaneSupplyLinksFor", () => {
  it("links my dock to my frontier on the far shore's landing ground, along the sea route read from my dock", () => {
    const state = world([tile(41, 40, { ownerId: "me", ownershipState: "FRONTIER" }), tile(40, 41, { ownerId: "me", ownershipState: "FRONTIER" })]);
    // Only the beach is a sea-lane landing; (40,41) hangs on it by land.
    expect(seaLaneSupplyLinksFor(state)).toEqual([
      { dockKey: "5,5", landingKey: "41,40", via: [{ x: 4, y: 5 }, { x: 41, y: 38 }] }
    ]);
  });
});

describe("landingGroundMenuLine", () => {
  it("names my dock as the crossing that can land on a far beach", () => {
    expect(landingGroundMenuLine(world(), 41, 40)).toBe("Landing ground: sea crossings from your dock at (5, 5) can come ashore here.");
  });

  it("warns on my own shore which dock's crossings can land there", () => {
    expect(landingGroundMenuLine(world(), 5, 4)).toBe("Landing ground: sea crossings from the dock at (40, 40) can come ashore here.");
  });

  it("says nothing inland", () => {
    expect(landingGroundMenuLine(world(), 40, 41)).toBeUndefined();
  });
});

describe("landingAshoreDirection", () => {
  it("points away from the water side", () => {
    // Far harbour: sea to the north, so landings come ashore heading south.
    expect(landingAshoreDirection(world().tiles, 40, 40)).toEqual({ dx: 0, dy: 1 });
    // My beach (5,4): sea to the west only.
    expect(landingAshoreDirection(world().tiles, 5, 4)).toEqual({ dx: 1, dy: 0 });
  });

  it("points south on land with no water beside it", () => {
    expect(landingAshoreDirection(world().tiles, 40, 41)).toEqual({ dx: 0, dy: 1 });
  });
});

describe("drawLandingGround2D", () => {
  it("marks every landing tile of the selection with a tint, a waterline glow and a chevron (the 3D overlay reads the same keys)", () => {
    const tileFills: Array<[number, number]> = [];
    const waterlines: Array<[number, number]> = [];
    let chevrons = 0;
    const gradient = { addColorStop: () => {} };
    const ctx = {
      save: () => {}, restore: () => {}, setLineDash: () => {}, strokeRect: () => {},
      beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => { chevrons += 1; },
      createLinearGradient: () => gradient,
      fillRect(x: number, y: number) { (this.fillStyle === gradient ? waterlines : tileFills).push([x, y]); },
      fillStyle: "" as unknown, strokeStyle: "", lineWidth: 1, globalAlpha: 1
    };
    drawLandingGround2D(ctx as unknown as CanvasRenderingContext2D, { ...world(), selected: { x: 41, y: 40 } }, {
      tileCenter: (x, y) => ({ sx: x * 10, sy: y * 10 }),
      size: 10,
      viewportWidth: 1_000,
      viewportHeight: 1_000
    });
    expect(tileFills).toHaveLength(3);
    // All three tiles face the sea to the north: one band each, starting at the tile's north edge.
    expect(waterlines.map(([, y]) => y).sort()).toEqual([395 - 4.2, 395 - 4.2, 395 - 4.2]);
    expect(chevrons).toBe(3);
  });
});

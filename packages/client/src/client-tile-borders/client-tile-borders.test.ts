import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { drawTileOwnershipAndBreachBorder, frontierTerritoryEdgeSides, type TileBorderRenderDeps } from "./client-tile-borders.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const recordingCtx = () => {
  const strokes: Array<{ style: string; dash: number[] }> = [];
  let dash: number[] = [];
  const ctx = {
    strokeStyle: "",
    lineWidth: 1,
    lineDashOffset: 0,
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    setLineDash: (value: number[]) => {
      dash = value;
    },
    stroke() {
      strokes.push({ style: String(this.strokeStyle), dash });
    }
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, strokes };
};

const depsFor = (tiles: Map<string, Tile>, ctx: CanvasRenderingContext2D, is3D = false): TileBorderRenderDeps => ({
  ctx,
  tiles,
  keyFor,
  wrapX: (x) => x,
  wrapY: (y) => y,
  me: "me",
  is3D,
  shouldDrawOwnershipBorder: (tile) => tile.ownershipState === "SETTLED",
  borderColorForOwner: () => "rgba(255,255,255,0.55)",
  isTileOwnedByAlly: () => false,
  borderLineWidthForOwner: () => 2
});

// Regression (playtest, colour-blind players): ungarrisoned (FRONTIER) land
// had no outline on the 2D map, so it read the same as unclaimed land unless
// you could tell the owner's fill hue apart.
describe("2D frontier territory edge", () => {
  const frontier: Tile = { x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" };

  it("outlines a frontier tile's edge against unclaimed land with a dashed light-on-dark line", () => {
    const tiles = new Map<string, Tile>([[keyFor(5, 5), frontier]]);
    const { ctx, strokes } = recordingCtx();
    drawTileOwnershipAndBreachBorder(frontier, "visible", 0, 0, 20, depsFor(tiles, ctx));
    expect(strokes).toHaveLength(2);
    expect(strokes[1]!.dash.length).toBeGreaterThan(0);
  });

  it("only edges sides that face another owner, not the same owner's garrisoned land", () => {
    const tiles = new Map<string, Tile>([
      [keyFor(5, 5), frontier],
      [keyFor(5, 4), { x: 5, y: 4, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" }],
      [keyFor(6, 5), { x: 6, y: 5, terrain: "LAND", ownerId: "rival", ownershipState: "FRONTIER" }]
    ]);
    expect(frontierTerritoryEdgeSides(frontier, { tiles, keyFor, wrapX: (x) => x, wrapY: (y) => y })).toEqual({ top: false, right: true, bottom: true, left: true });
  });

  it("leaves the true-3D renderer and unowned land alone", () => {
    const tiles = new Map<string, Tile>([[keyFor(5, 5), frontier]]);
    const { ctx, strokes } = recordingCtx();
    drawTileOwnershipAndBreachBorder(frontier, "visible", 0, 0, 20, depsFor(tiles, ctx, true));
    drawTileOwnershipAndBreachBorder({ x: 1, y: 1, terrain: "LAND" }, "visible", 0, 0, 20, depsFor(tiles, ctx));
    expect(strokes).toHaveLength(0);
  });
});

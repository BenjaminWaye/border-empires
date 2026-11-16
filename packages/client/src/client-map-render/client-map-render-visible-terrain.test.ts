import { describe, expect, it, vi } from "vitest";
import type { Tile } from "../client-types.js";
import { setTrue3DRendererActive } from "../client-renderer-mode.js";
import { drawVisibleTerrain2D } from "./client-map-render-visible-terrain.js";

vi.mock("./client-map-render.js", () => ({ useTerrainReliefRenderer: false, terrainReliefPx: () => 0 }));
vi.mock("./client-map-render-terrain-relief.js", () => ({ useTerrainReliefRenderer: false }));
vi.mock("./client-map-render-river-edges.js", () => ({ drawRiverEdges: () => undefined }));

// The rendered tile's whole 8-neighbourhood is the same owner's settled land,
// so the settled edge glow takes its flat interior-fill path (no canvas).
const surroundedBy = (ownerId: string | undefined): Map<string, Tile> => {
  const tiles = new Map<string, Tile>();
  if (!ownerId) return tiles;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) tiles.set(`${5 + dx},${9 + dy}`, { x: 5 + dx, y: 9 + dy, terrain: "LAND", ownerId, ownershipState: "SETTLED" });
  }
  return tiles;
};

const render = (ownerId?: string, resource?: Tile["resource"]): string[] => {
  const calls: string[] = [];
  const ctx = {
    save: () => undefined, restore: () => undefined,
    beginPath: () => undefined, arc: () => undefined,
    fill: () => calls.push("fleck"), fillRect: () => calls.push("ownership")
  } as unknown as CanvasRenderingContext2D;
  setTrue3DRendererActive(false);
  drawVisibleTerrain2D({
    ctx, effectiveOverlayColor: () => "#ff0000",
    drawForestOverlay: () => { calls.push("forest"); },
    drawHillsOverlay: () => { calls.push("hills"); },
    keyFor: (x, y) => `${x},${y}`, wrapX: (x) => x, wrapY: (y) => y
  }, { techIds: [], techCatalog: [], tiles: surroundedBy(ownerId), tilesRevision: 0 }, {
    x: 5, y: 9, terrain: "LAND", ownershipState: "SETTLED", ...(ownerId ? { ownerId } : {}),
    prospectSignature: "FERROUS_DUST", ...(resource ? { resource } : {})
  }, 5, 9, 0, 0, 48);
  return calls;
};

describe("2D visible terrain prospect layering", () => {
  it("paints ore flecks after hill details and the ownership fill", () => {
    const calls = render("owner");
    expect(calls.slice(0, 3)).toEqual(["forest", "hills", "ownership"]);
    expect(calls.slice(3).length).toBeGreaterThan(0);
    expect(calls.slice(3).every((call) => call === "fleck")).toBe(true);
  });

  it("also paints clues on unowned ground, but excludes resource tiles", () => {
    expect(render()).toContain("fleck");
    expect(render("owner", "IRON")).toEqual(["forest", "hills", "ownership"]);
  });
});


it("uses the resource plot in place of overlapping decorative forest in 2D", () => {
  expect(render("owner", "LUXURY_BIOTA")).toEqual(["hills", "ownership"]);
  expect(render("owner", "PRECURSOR_SALVAGE")).toEqual(["hills", "ownership"]);
});

describe("2D visible terrain on the Resources lens", () => {
  const paintOn = (tile: Partial<Tile>): string[] => {
    const fills: string[] = [];
    const ctx = {
      fillStyle: "", strokeStyle: "", globalAlpha: 1, lineWidth: 1,
      save: () => undefined, restore: () => undefined, beginPath: () => undefined, arc: () => undefined, fill: () => undefined,
      fillRect(this: { fillStyle: string }) { fills.push(this.fillStyle); }, strokeRect: () => undefined
    } as unknown as CanvasRenderingContext2D;
    setTrue3DRendererActive(false);
    drawVisibleTerrain2D({
      ctx, effectiveOverlayColor: () => "#ff0000", drawForestOverlay: () => undefined, drawHillsOverlay: () => undefined,
      keyFor: (x, y) => `${x},${y}`, wrapX: (x) => x, wrapY: (y) => y
    }, { techIds: [], techCatalog: [], tiles: surroundedBy(tile.ownerId), tilesRevision: 0, showResourceOverlay: true },
    { x: 5, y: 9, terrain: "LAND", ownershipState: "SETTLED", ...tile }, 5, 9, 0, 0, 48);
    return fills;
  };

  it("paints a resource tile in its resource colour instead of its owner's", () => {
    expect(paintOn({ ownerId: "owner", resource: "FARM" })).toEqual(["#e9f27b"]);
    expect(paintOn({ resource: "GEMS" })).toEqual(["#b175ff"]);
  });

  it("gives owned land without a resource no territory paint", () => {
    expect(paintOn({ ownerId: "owner" })).toEqual([]);
  });
});

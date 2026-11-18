import { describe, expect, it } from "vitest";
import { Color, Mesh, Scene } from "three";
import type { Tile } from "../client-types.js";
import { PLOT_AMBER, PLOT_IVORY, PLOT_VERTICES } from "../client-town-support-plot/plot-style.js";
import { createTownSupportTileOverlay } from "./client-map-3d-town-support-tile.js";
import { createTownSupportTileSync, plotSurfaceHeights, type TownSupportTileSyncDeps } from "./client-map-3d-town-support-tile-sync.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const wrap = (x: number): number => (x + 100) % 100;
const fixture = () => {
  const scene = new Scene(), overlay = createTownSupportTileOverlay(scene, 24);
  const town: Tile = { x: 20, y: 20, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" };
  // Only population tier is read by the support-plot lookup.
  town.town = { populationTier: "TOWN" } as NonNullable<Tile["town"]>;
  const tiles = new Map([[keyFor(20, 20), town]]);
  let selected: { x: number; y: number } | undefined;
  let hovered: { x: number; y: number } | undefined;
  let visible = true, groundY = 0.1;
  let hillCutAt = (): undefined => undefined;
  const deps: TownSupportTileSyncDeps = {
    overlay, selected: () => selected, hover: () => hovered, visibleAt: () => visible,
    sceneOrigin: { camX: 20, camY: 20 }, toroidDelta: (from, to, dim) => ((to - from + dim * 1.5) % dim) - dim / 2,
    worldWidth: 100, worldHeight: 100, cornerYAt: () => groundY, isHillsAt: () => false, hillCutAt: () => hillCutAt, rise: 0.01,
    lookupDeps: { tiles, keyFor, wrapX: wrap, wrapY: wrap, terrainAt: () => "LAND", me: "me" }
  };
  const sync = createTownSupportTileSync(deps);
  const mesh = overlay.group.children[0]!;
  if (!(mesh instanceof Mesh)) throw new Error("missing plot mesh");
  return { deps, overlay, town, tiles, sync, mesh,
    select: (coord: typeof selected) => { selected = coord; }, hover: (coord: typeof hovered) => { hovered = coord; },
    visibility: (value: boolean) => { visible = value; },
    rebuild: (height: number) => { groundY = height; hillCutAt = (): undefined => undefined; }
  };
};

describe("town plot corner markers", () => {
  it("appears on town selection, stays while selecting a plot, and clears on deselection or unrelated selection", () => {
    const f = fixture();
    // Real renderer output rather than just checking that clear()/commit() ran.
    const drawCount = (): number => f.mesh.geometry.drawRange.count;
    f.sync(); expect(drawCount()).toBe(0);
    f.select(f.town); f.sync(); expect(drawCount()).toBe(8 * PLOT_VERTICES.length);
    const plot: Tile = { x: 21, y: 20, terrain: "LAND" };
    f.tiles.set(keyFor(21, 20), plot);
    f.select(plot); f.sync(); expect(drawCount()).toBe(8 * PLOT_VERTICES.length);
    f.select({ x: 40, y: 40 }); f.sync(); expect(drawCount()).toBe(0);
    f.select(f.town); f.sync(); f.select(undefined); f.sync(); expect(drawCount()).toBe(0);
    f.overlay.dispose();
  });

  it("covers both rings for a Great City, hides invisible plots, and refreshes after a terrain rebuild", () => {
    const f = fixture();
    f.town.town!.populationTier = "GREAT_CITY";
    f.select(f.town); f.sync();
    const geometry = f.mesh.geometry;
    expect(geometry.drawRange.count).toBe(24 * PLOT_VERTICES.length);
    expect(geometry.getAttribute("position").getY(0)).toBeCloseTo(0.11);
    f.rebuild(0.3); f.sync();
    expect(geometry.getAttribute("position").getY(0)).toBeCloseTo(0.31);
    f.visibility(false); f.sync(); expect(geometry.drawRange.count).toBe(0);
  });

  it("turns only the hovered plot amber and clears its highlight when the pointer leaves", () => {
    const f = fixture();
    f.select(f.town); f.hover({ x: 19, y: 19 }); f.sync();
    const colors = f.mesh.geometry.getAttribute("color");
    expect(colors.getY(0)).toBeCloseTo(new Color(PLOT_AMBER).g);
    expect(colors.getY(PLOT_VERTICES.length)).toBeCloseTo(new Color(PLOT_IVORY).g);
    f.hover(undefined); f.sync();
    expect(colors.getY(0)).toBeCloseTo(new Color(PLOT_IVORY).g);
  });

  it("matches the rendered triangles when the four terrain corners are not coplanar", () => {
    const f = fixture();
    const heights = plotSurfaceHeights(20, 20, { ...f.deps,
      cornerYAt: (x, y) => (x === 21 && y === 20) || (x === 20 && y === 21) ? 0.4 : 0
    });
    PLOT_VERTICES.forEach(([x, z], i) => {
      const u = x + 0.5, v = z + 0.5;
      const ground = u + v <= 1 ? (u + v) * 0.4 : (2 - u - v) * 0.4;
      expect(heights[i]).toBeCloseTo(ground + 0.01);
    });
  });

  it("follows the slope at every marker vertex rather than floating a horizontal square at its highest point", () => {
    const f = fixture();
    const heights = plotSurfaceHeights(20, 20, { ...f.deps, cornerYAt: (x, y) => (x - 20) * 0.3 + (y - 20) * 0.1 });
    PLOT_VERTICES.forEach(([x, z], i) => expect(heights[i]).toBeCloseTo((x + 0.5) * 0.3 + (z + 0.5) * 0.1 + 0.01));
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.3);
    const hills = { ...f.deps, isHillsAt: () => true };
    const dome = plotSurfaceHeights(20, 20, hills);
    expect(Math.max(...dome)).toBeGreaterThan(0.11);
    const graded = plotSurfaceHeights(20, 20, { ...hills, hillCutAt: () => () => ({ afcPads: [{ du: 0, dv: 0 }] }) });
    expect(Math.min(...graded)).toBeGreaterThanOrEqual(0.1);
    expect(Math.max(...graded)).toBeLessThanOrEqual(Math.max(...dome));
  });
});

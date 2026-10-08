// Phase 1a regressions (docs/rivers-remake-plan.md): river pieces hanging
// into the unexplored void, valley patches past the terrain's edge, the v8
// strip floating above the ground, and the see-through ocean material.
import { BufferGeometry, Mesh, MeshStandardMaterial, Scene } from "three";
import { describe, expect, it } from "vitest";
import { isHillsTileAt, riverCornerWidthsForCurrentSeed, setWorldSeed, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { createRiverOverlay, type RiverOverlayDeps } from "./client-map-3d-rivers.js";
import { appendWater, heightfieldSurfaceY, RIVER_WATER_DEPTH, riverDescentScale, riverSeaBlend, type WaterBuffers } from "./client-map-3d-rivers-channel.js";
import { WATER_SURFACE_Y } from "../client-map-3d-water-surface.js";
import { riverMouthPlume, riverSampleSides, seaDirectionAtCorner, withMouthDescent } from "./client-map-3d-river-edge-water.js";
import { heightfieldTileWindow } from "../client-map-3d-heightfield/client-map-3d-heightfield-window.js";
import { RENDER_ORDER } from "../client-map-3d-render-order.js";
import { RIVER_SEA_BLEND, RIVER_WATER_CORE } from "./client-map-3d-river-water-material.js";

const TERRAIN_MATERIAL = new MeshStandardMaterial();
// Varies per corner so "draped on the surface" is distinguishable from "flat".
const cornerYAt = (x: number, z: number): number => 0.1 + ((x * 7 + z * 3) % 5) * 0.02;
const deps: RiverOverlayDeps = {
  heightfield: {
    material: TERRAIN_MATERIAL,
    cornerYAt,
    cornerAttributesAt: (x, z, out) => {
      Object.assign(out, { y: cornerYAt(x, z), r: 0.4, g: 0.6, b: 0.3, forestZone: 0, tundraZone: 0 });
      return true;
    }
  }
};
const meshes = (scene: Scene): Mesh[] => scene.children.filter((c): c is Mesh => c instanceof Mesh);
const positions = (mesh: Mesh): Float32Array => (mesh.geometry as BufferGeometry).getAttribute("position").array as Float32Array;
const ALWAYS = (): boolean => true;
// Camera centred on a real v9 river corner, so the window always holds a river.
const v9RiverCamera = (): { camX: number; camY: number } => {
  setWorldSeed(555, "continents", 9);
  const [corner] = riverCornerWidthsForCurrentSeed().keys();
  expect(corner).toBeDefined();
  return { camX: corner! % WORLD_WIDTH, camY: Math.floor(corner! / WORLD_WIDTH) };
};

describe("river culling and look (phase 1a)", () => {
  const tileWindow = heightfieldTileWindow(10, 10);

  it("draws each half of a border river only where its own tile is explored", () => {
    // A vertical river on the border x = 0 between tile -1 (west, world 99)
    // and tile 0 (east, world 100); normal (1, 0), so "left" is west.
    const onlyWest = (wx: number): boolean => wx === 99;
    expect(riverSampleSides(0, 0.5, 1, 0, 100, 50, tileWindow, ALWAYS)).toEqual({ left: true, right: true });
    expect(riverSampleSides(0, 0.5, 1, 0, 100, 50, tileWindow, onlyWest)).toEqual({ left: true, right: false });
    expect(riverSampleSides(0, 0.5, 1, 0, 100, 50, tileWindow, (wx: number) => wx === 100)).toEqual({ left: false, right: true });
    expect(riverSampleSides(0, 0.5, 1, 0, 100, 50, tileWindow, () => false)).toEqual({ left: false, right: false });
  });

  it("treats a side outside the heightfield's tile window like an unexplored one", () => {
    const edgeX = tileWindow.tileOffsetX + tileWindow.tileSpanX; // first tile past the window
    expect(riverSampleSides(edgeX, 0.5, 1, 0, 100, 50, tileWindow, ALWAYS)).toEqual({ left: true, right: false });
    expect(riverSampleSides(edgeX - 1, 0.5, 1, 0, 100, 50, tileWindow, ALWAYS)).toEqual({ left: true, right: true });
  });

  it("at the fog edge the explored half keeps its water, stopping at the border", () => {
    // Regression: water was dropped entirely when one side was unexplored,
    // leaving the explored tile's carved half-bed dry and empty.
    const buffers: WaterBuffers = { positions: [], colors: [], indices: [] };
    const run = [{ x: 0, z: 0, halfWidth: 0.15 }, { x: 0, z: 1, halfWidth: 0.15 }, { x: 0, z: 2, halfWidth: 0.15 }];
    // Tangent +z, so the -normal ("left") side is +x here; keep only it.
    appendWater(buffers, run, () => 0, run.map(() => ({ left: true, right: false })));
    const xs = buffers.positions.filter((_, i) => i % 3 === 0);
    expect(Math.max(...xs)).toBeGreaterThan(0.1);
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
  });

  it("runs the river mouth out into the sea, starting at the channel's end, widening and fading", () => {
    // Regression: v9 rivers stopped at their final corner with a hard square
    // end at the coast. Sea only at tile (-1, -1) of corner (10, 10).
    const seaDir = seaDirectionAtCorner(10, 10, (wx: number, wy: number) => wx === 9 && wy === 9);
    expect(seaDir!.x).toBeCloseTo(-Math.SQRT1_2);
    expect(seaDir!.z).toBeCloseTo(-Math.SQRT1_2);
    expect(seaDirectionAtCorner(10, 10, () => false)).toBeNull();
    const end = { x: 0, z: 0, halfWidth: 0.15 };
    const plume = riverMouthPlume(end, { x: 0, z: -1 }, seaDir!);
    expect(plume[0]).toMatchObject({ x: 0, z: 0, mouth: 0 }); // meets the channel with no gap
    const last = plume[plume.length - 1]!;
    expect(last.mouth).toBe(1);
    expect(last.x).toBeLessThan(-0.4);
    expect(last.z).toBeLessThan(-0.4);
    expect(last.halfWidth).toBeGreaterThan(end.halfWidth * 2);
    const buffers: WaterBuffers = { positions: [], colors: [], indices: [] };
    appendWater(buffers, plume, () => 0);
    const alphas = buffers.colors.filter((_, i) => i % 4 === 3);
    expect(alphas[2]).toBe(1); // solid where it leaves the coast
    expect(Math.max(...alphas.slice(-5))).toBe(0); // fully faded at the end
  });

  it("cuts the channel down to sea level over the last stretch before the mouth", () => {
    // Regression: the water sat in its trench at land height, so every river
    // ended on top of the coastal cliff above the sea.
    const line = [0, 0.5, 1, 1.5, 2, 2.5, 3].map((x) => ({ x, z: 0, halfWidth: 0.15 }));
    const descended = withMouthDescent(line);
    expect(descended[0]!.descent ?? 0).toBe(0);
    expect(descended[descended.length - 1]!.descent).toBe(1);
    expect(descended[descended.length - 2]!.descent!).toBeGreaterThan(0);
    // ...and flares into an estuary: a channel meeting the sea at its full
    // inland width, banks and all, looked cut off by the straight coast.
    expect(descended[0]!.halfWidth).toBe(0.15);
    expect(descended[descended.length - 1]!.halfWidth).toBeGreaterThan(0.15 * 1.4);
    const land = 0.18;
    expect(riverDescentScale(land, 0)).toBe(1);
    // Fully descended, the water line reaches (just below) the sea surface.
    expect(land - RIVER_WATER_DEPTH * riverDescentScale(land, 1)).toBeLessThan(WATER_SURFACE_Y);
  });

  it("starts mixing the channel's colour toward the sea's on its descent, continuous into the plume", () => {
    // Regression: the textured channel ran at full inland colour right up to
    // the coast and the plume took over there, so the river looked cut off.
    expect(riverSeaBlend({ x: 0, z: 0, halfWidth: 0.15 })).toBe(0);
    const channelEnd = riverSeaBlend({ x: 0, z: 0, halfWidth: 0.15, descent: 1 });
    expect(channelEnd).toBeGreaterThan(0.3);
    expect(riverSeaBlend({ x: 0, z: 0, halfWidth: 0.15, descent: 1, mouth: 0 })).toBe(channelEnd);
    expect(riverSeaBlend({ x: 0, z: 0, halfWidth: 0.15, descent: 1, mouth: 1 })).toBe(1);
  });

  it("a strip split across two meshes meets exactly at the shared sample", () => {
    // Regression: channel and mouth meshes each took the shared sample's
    // direction from their own neighbours, leaving a hairline seam.
    const line = [[0, 0], [0.5, 0.1], [1, 0.4], [1.5, 0.9], [2, 1.2]].map(([x, z]) => ({ x: x!, z: z!, halfWidth: 0.15 }));
    const whole: WaterBuffers = { positions: [], colors: [], indices: [] };
    appendWater(whole, line, () => 0);
    const channel: WaterBuffers = { positions: [], colors: [], indices: [] };
    const mouth: WaterBuffers = { positions: [], colors: [], indices: [] };
    appendWater(channel, line.slice(0, 3), () => 0, undefined, { after: line[3] });
    appendWater(mouth, line.slice(2), () => 0, undefined, { before: line[1] });
    const shared = whole.positions.slice(2 * 15, 3 * 15); // 5 columns x 3 coords at sample 2
    expect(channel.positions.slice(2 * 15, 3 * 15)).toEqual(shared);
    expect(mouth.positions.slice(0, 15)).toEqual(shared);
  });

  it("blends the plume's colour into the sea colour as it runs out", () => {
    // Regression: the river switched from its own colour to a flat pool at the coast.
    const buffers: WaterBuffers = { positions: [], colors: [], indices: [] };
    const plume = riverMouthPlume({ x: 0, z: 0, halfWidth: 0.15 }, { x: 0, z: -1 }, { x: -Math.SQRT1_2, z: -Math.SQRT1_2 });
    appendWater(buffers, plume, () => 0);
    const coreAt = (sample: number): number => buffers.colors[(sample * 5 + 2) * 4]!; // red of the centre column
    expect(coreAt(0)).toBeCloseTo(RIVER_WATER_CORE[0], 6);
    expect(coreAt(plume.length - 1)).toBeCloseTo(RIVER_SEA_BLEND[0], 6);
  });

  it("v9: valley patches and water stay inside the heightfield window (no squares past the terrain edge)", () => {
    const { camX, camY } = v9RiverCamera();
    const halfW = 60;
    const halfH = 40;
    const w = heightfieldTileWindow(halfW, halfH);
    const scene = new Scene();
    const overlay = createRiverOverlay(scene, deps);
    overlay.rebuild({ camX, camY, halfW, halfH, isExploredAt: ALWAYS });
    const all = meshes(scene);
    expect(all.length).toBeGreaterThan(0);
    for (const mesh of all) {
      const pos = positions(mesh);
      for (let i = 0; i < pos.length; i += 3) {
        // Slop: a half drawn at the window edge stops on the centreline,
        // which wobbles up to ~0.05 off the tile border.
        expect(pos[i]!).toBeGreaterThanOrEqual(w.tileOffsetX - 0.06);
        expect(pos[i]!).toBeLessThanOrEqual(w.tileOffsetX + w.tileSpanX + 0.06);
        expect(pos[i + 2]!).toBeGreaterThanOrEqual(w.tileOffsetY - 0.06);
        expect(pos[i + 2]!).toBeLessThanOrEqual(w.tileOffsetY + w.tileSpanY + 0.06);
      }
    }
    overlay.dispose();
  });

  it("v9: water uses the river's own opaque material, drawn above ownership and below fog-darken", () => {
    const { camX, camY } = v9RiverCamera();
    const scene = new Scene();
    const overlay = createRiverOverlay(scene, deps);
    overlay.rebuild({ camX, camY, halfW: 20, halfH: 20, isExploredAt: ALWAYS });
    const water = meshes(scene).find((m) => m.renderOrder === RENDER_ORDER.riverWater);
    expect(water).toBeDefined();
    const material = water!.material as MeshStandardMaterial;
    expect(material.opacity).toBe(1);
    expect(material.depthWrite).toBe(true);
    expect(water!.renderOrder).toBe(RENDER_ORDER.riverWater);
    expect((water!.geometry as BufferGeometry).getAttribute("color").itemSize).toBe(4);
    overlay.dispose();
  });

  it("v8: the strip is draped on the rendered heightfield surface instead of floating above it", () => {
    setWorldSeed(555, "continents", 8);
    const camX = Math.floor(WORLD_WIDTH / 2);
    const camY = Math.floor(WORLD_HEIGHT / 2);
    const scene = new Scene();
    const overlay = createRiverOverlay(scene, deps);
    overlay.rebuild({ camX, camY, halfW: 150, halfH: 100, isExploredAt: ALWAYS });
    const [strip] = meshes(scene);
    expect(strip).toBeDefined();
    expect(strip!.renderOrder).toBe(RENDER_ORDER.riverWater);
    const pos = positions(strip!);
    let checked = 0;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i]!;
      const z = pos[i + 2]!;
      if (isHillsTileAt(((Math.floor(camX + x) % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH, ((Math.floor(camY + z) % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT)) continue;
      expect(pos[i + 1]!).toBeCloseTo(heightfieldSurfaceY(x, z, camX, camY, cornerYAt) + 0.025, 5);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(50);
    overlay.dispose();
  });
});

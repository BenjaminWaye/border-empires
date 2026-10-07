// Phase 1a regressions (docs/rivers-remake-plan.md): river pieces hanging
// into the unexplored void, valley patches past the terrain's edge, the v8
// strip floating above the ground, and the see-through ocean material.
import { BufferGeometry, Mesh, MeshStandardMaterial, Scene } from "three";
import { describe, expect, it } from "vitest";
import { isHillsTileAt, riverCornerWidthsForCurrentSeed, setWorldSeed, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { createRiverOverlay, isRiverSampleDrawable, type RiverOverlayDeps } from "./client-map-3d-rivers.js";
import { heightfieldSurfaceY } from "./client-map-3d-rivers-channel.js";
import { heightfieldTileWindow } from "../client-map-3d-heightfield/client-map-3d-heightfield-window.js";
import { RENDER_ORDER } from "../client-map-3d-render-order.js";

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

  it("keeps a river sample only when the tiles on both sides of it are explored", () => {
    // A vertical river on the border x = 0 between tile -1 (west) and tile 0 (east).
    const onlyWest = (wx: number): boolean => wx === 99;
    expect(isRiverSampleDrawable(0, 0.5, 1, 0, 100, 50, tileWindow, ALWAYS)).toBe(true);
    expect(isRiverSampleDrawable(0, 0.5, 1, 0, 100, 50, tileWindow, onlyWest)).toBe(false);
    expect(isRiverSampleDrawable(0, 0.5, 1, 0, 100, 50, tileWindow, (wx) => wx === 100)).toBe(false);
  });

  it("never draws a river sample outside the heightfield's tile window", () => {
    const edgeX = tileWindow.tileOffsetX + tileWindow.tileSpanX; // first tile past the window
    // On the window's outer border: one side is outside the terrain.
    expect(isRiverSampleDrawable(edgeX, 0.5, 1, 0, 100, 50, tileWindow, ALWAYS)).toBe(false);
    expect(isRiverSampleDrawable(edgeX - 1, 0.5, 1, 0, 100, 50, tileWindow, ALWAYS)).toBe(true);
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
        expect(pos[i]!).toBeGreaterThanOrEqual(w.tileOffsetX - 0.01);
        expect(pos[i]!).toBeLessThanOrEqual(w.tileOffsetX + w.tileSpanX + 0.01);
        expect(pos[i + 2]!).toBeGreaterThanOrEqual(w.tileOffsetY - 0.01);
        expect(pos[i + 2]!).toBeLessThanOrEqual(w.tileOffsetY + w.tileSpanY + 0.01);
      }
    }
    overlay.dispose();
  });

  it("v9: water uses the river's own opaque material, drawn above ownership and below fog-darken", () => {
    const { camX, camY } = v9RiverCamera();
    const scene = new Scene();
    const overlay = createRiverOverlay(scene, deps);
    overlay.rebuild({ camX, camY, halfW: 20, halfH: 20, isExploredAt: ALWAYS });
    const water = meshes(scene).find((m) => m.material !== TERRAIN_MATERIAL);
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

// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { DoubleSide, Mesh, Scene } from "three";
import { BufferGeometry } from "three";
import { WORLD_WIDTH } from "@border-empires/shared";
import { createWaterSurface, WATER_SURFACE_Y } from "./client-map-3d-water-surface.js";
import { RENDER_ORDER } from "./client-map-3d-render-order.js";

// Regression test for the water surface rendering solid black from below:
// the surface mesh only winds a front face (normal pointing up), so without
// DoubleSide on the material, any camera angle catching the underside (or
// a steep enough grazing angle) saw straight through to empty background
// instead of water.
describe("createWaterSurface", () => {
  // happy-dom's canvas has no real 2D context (needs a native canvas
  // binding); stub just enough of it for the module's normal-map generator
  // to run without actually rasterizing anything.
  beforeAll(() => {
    const fakeCtx = {
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: () => undefined
    };
    HTMLCanvasElement.prototype.getContext = (() => fakeCtx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  it("renders both sides of the surface mesh, not just the top face", () => {
    const scene = new Scene();
    const water = createWaterSurface(scene, 4);
    water.addTile(0.5, 0.5, false, 0, 0);
    water.commit();

    const mesh = scene.children.find((child): child is Mesh => child instanceof Mesh);
    expect(mesh).toBeDefined();
    const material = mesh!.material as { side: number };
    expect(material.side).toBe(DoubleSide);

    water.dispose();
  });

  // Regression test for black artifacts under coastal sea tiles: the water
  // surface is a flat, zero-thickness sheet with no underside geometry of
  // its own -- it relied entirely on the *land* skirt (a wall dropped along
  // every coastal land edge) to hide the void beneath it. Anywhere water
  // bordered non-water without an adjacent drawn land tile this frame (mid-
  // sea, a fog/window boundary, etc.) there was nothing there, so a grazing
  // or below-water view saw straight through to empty background.
  //
  // Only the south edge gets a skirt (see the loop in commit()) -- the
  // other three sat right where the land skirt's own coastal wall runs and
  // the two z-fought/flickered against each other during the wave
  // animation, so north/east/west were dropped in favor of just not
  // reproducing the flicker.
  it("adds a skirt wall only along the south-facing tile edge", () => {
    const scene = new Scene();
    const water = createWaterSurface(scene, 4);
    water.addTile(0.5, 0.5, false, 0, 0); // a single water tile: every edge is exposed
    water.commit();

    const meshes = scene.children.filter((child): child is Mesh => child instanceof Mesh);
    expect(meshes.length).toBe(2); // surface + skirt
    const skirt = meshes.find((m) => m.renderOrder === 11);
    expect(skirt).toBeDefined();
    // 1 south edge * 4 verts/edge = 4 skirt vertices.
    expect(skirt!.geometry.attributes["position"]!.count).toBe(4);

    water.dispose();
  });

  it("adds no skirt wall when every tile edge borders another water tile", () => {
    const scene = new Scene();
    const water = createWaterSurface(scene, 9);
    // A fully-interior 1x1 patch surrounded on all 4 sides: no exposed edges.
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        water.addTile(dx + 0.5, dz + 0.5, false, dx, dz);
      }
    }
    water.commit();

    const meshes = scene.children.filter((child): child is Mesh => child instanceof Mesh);
    const skirt = meshes.find((m) => m.renderOrder === 11);
    expect(skirt).toBeDefined();
    // Only the bottom row (dz=1) of the 3x3 grid has an exposed south edge:
    // 3 tiles * 4 verts/edge = 12 skirt vertices.
    expect(skirt!.geometry.attributes["position"]!.count).toBe(3 * 4);

    water.dispose();
  });

  // Regression test for the wave animation leaving the skirt behind: the
  // main surface's vertex Y bobs every frame in tick(), but the skirt's top
  // row was written once in commit() and never touched again -- whenever
  // the wave lifted the surface above that static top edge, the gap
  // between them exposed the void underneath (the same black-artifact bug,
  // just reintroduced by animation instead of by having no skirt at all).
  it("keeps the skirt's top edge flush with the animated surface", () => {
    const scene = new Scene();
    const water = createWaterSurface(scene, 4);
    water.addTile(0.5, 0.5, false, 0, 0);
    water.commit();
    water.tick(1234);

    const meshes = scene.children.filter((child): child is Mesh => child instanceof Mesh);
    const surface = meshes.find((m) => m.renderOrder === 12)!;
    const skirt = meshes.find((m) => m.renderOrder === 11)!;

    const surfacePos = surface.geometry.attributes["position"]!.array;
    // Surface vertex at world (0, *, 1) -- the south edge of the single
    // water tile spanning x:[0,1] z:[0,1] -- is where the south skirt sits.
    const surfaceSouthEdgeIndex = surfacePos.findIndex((_, i) =>
      i % 3 === 0 && surfacePos[i] === 0 && surfacePos[i + 2] === 1
    );
    expect(surfaceSouthEdgeIndex).toBeGreaterThanOrEqual(0);
    const surfaceY = surfacePos[surfaceSouthEdgeIndex + 1];

    // Every skirt top-row vertex (index % 4 < 2) at the same world (x, z)
    // should match the surface's wave displacement exactly, not sit at the
    // static WATER_SURFACE_Y baseline.
    const skirtPos = skirt.geometry.attributes["position"]!.array;
    let sawTopVertex = false;
    for (let i = 0; i < skirtPos.length / 3; i++) {
      if (i % 4 >= 2) continue;
      const x = skirtPos[i * 3]!;
      const z = skirtPos[i * 3 + 2]!;
      if (x === 0 && z === 1) {
        sawTopVertex = true;
        expect(skirtPos[i * 3 + 1]).toBeCloseTo(surfaceY!, 6);
      }
    }
    expect(sawTopVertex).toBe(true);

    water.dispose();
  });

  // Regression for the wave pattern visibly jumping at every terrain rebuild
  // (e.g. clicking a tile, or panning): the wave's spatial phase used to be
  // computed from the mesh's baked, scene-relative vertex position, which is
  // only anchored to sceneOrigin at the moment of the commit() that built it.
  // A world tile's scene-relative position drifts between rebuilds as the
  // camera pans -- so recreating the geometry against a new anchor moved
  // every vertex's wave INPUT even though the water tile itself hadn't
  // physically moved, snapping the crest/trough pattern into a different
  // shape instead of continuing smoothly. addTile now takes the tile's
  // absolute world coordinates separately and the wave phases off those.
  it("keeps the wave pattern for a world tile the same across a rebuild that changes the scene anchor", () => {
    // Same single world tile (5, 5), added at two different scene-relative
    // positions -- simulating the camera having panned (and a rebuild
    // having re-anchored sceneOrigin) between the two commits.
    const sceneA = new Scene();
    const waterA = createWaterSurface(sceneA, 4);
    waterA.addTile(0.5, 0.5, false, 5, 5);
    waterA.commit();
    waterA.tick(9000);
    const meshA = sceneA.children.find((child): child is Mesh => child instanceof Mesh && child.renderOrder === 12)!;
    const yA = meshA.geometry.attributes["position"]!.array[1];

    const sceneB = new Scene();
    const waterB = createWaterSurface(sceneB, 4);
    waterB.addTile(200.5, -200.5, false, 5, 5);
    waterB.commit();
    waterB.tick(9000);
    const meshB = sceneB.children.find((child): child is Mesh => child instanceof Mesh && child.renderOrder === 12)!;
    const yB = meshB.geometry.attributes["position"]!.array[1];

    expect(yA).toBeCloseTo(yB!, 6);

    waterA.dispose();
    waterB.dispose();
  });
  it("drops the shore foam when a later commit has no sea in view", () => {
    // Regression: an empty commit returned before rebuilding the foam, so
    // the previous view's foam stayed in the scene at stale coordinates.
    const scene = new Scene();
    const water = createWaterSurface(scene, 4, { isLandAt: (x) => x === 1 });
    water.addTile(0.5, 0.5, false, 0, 0);
    water.commit();
    const foamCount = (): number => scene.children.filter((c) => c instanceof Mesh && c.renderOrder === RENDER_ORDER.shoreFoam).length;
    expect(foamCount()).toBe(1);
    water.clear();
    water.commit();
    expect(foamCount()).toBe(0);
  });

  it("keeps the sea flat where waveCalmAt says calm (river mouths), and waving elsewhere", () => {
    // Regression: the sea's tile corners bobbed ~0.22 up and down right
    // where rivers flow in, so the sea-tile edges showed around the mouth.
    const heights = (calm: number): number[] => {
      const scene = new Scene();
      const corners = new Map<number, number>();
      for (let x = 7; x <= 10; x += 1) for (let z = 3; z <= 6; z += 1) corners.set(z * WORLD_WIDTH + x, calm);
      const water = createWaterSurface(scene, 9, { waveCalmCorners: () => corners });
      for (let x = 0; x < 3; x += 1) for (let z = 0; z < 3; z += 1) water.addTile(x + 0.5, z + 0.5, false, x + 7, z + 3);
      water.commit();
      water.tick(12_345);
      const mesh = scene.children.find((child): child is Mesh => child instanceof Mesh)!;
      const pos = (mesh.geometry as BufferGeometry).getAttribute("position").array as Float32Array;
      const ys = Array.from(pos).filter((_, i) => i % 3 === 1);
      water.dispose();
      return ys;
    };
    expect(heights(1).every((y) => Math.abs(y - WATER_SURFACE_Y) < 1e-6)).toBe(true);
    expect(heights(0).some((y) => Math.abs(y - WATER_SURFACE_Y) > 0.01)).toBe(true);
  });
  it("maps a world-corner calm entry onto exactly that vertex of the scene-relative grid", () => {
    const scene = new Scene();
    // World corner (8, 4) is calm; tiles sit at world (7..9, 3..5), scene (0..2, 0..2).
    const water = createWaterSurface(scene, 9, { waveCalmCorners: () => new Map([[4 * WORLD_WIDTH + 8, 1]]) });
    for (let x = 0; x < 3; x += 1) for (let z = 0; z < 3; z += 1) water.addTile(x + 0.5, z + 0.5, false, x + 7, z + 3);
    water.commit();
    water.tick(12_345);
    const mesh = scene.children.find((child): child is Mesh => child instanceof Mesh)!;
    const pos = (mesh.geometry as BufferGeometry).getAttribute("position").array as Float32Array;
    for (let i = 0; i < pos.length; i += 3) {
      const flat = Math.abs(pos[i + 1]! - WATER_SURFACE_Y) < 1e-6;
      if (pos[i] === 1 && pos[i + 2] === 1) expect(flat).toBe(true);
    }
    expect(Array.from(pos).filter((_, i) => i % 3 === 1).filter((y) => Math.abs(y - WATER_SURFACE_Y) > 0.01).length).toBeGreaterThan(5);
    water.dispose();
  });
});

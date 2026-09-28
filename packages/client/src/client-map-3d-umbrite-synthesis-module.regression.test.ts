import { describe, expect, it } from "vitest";
import { CylinderGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Scene, Vector3 } from "three";
import { AFC_BAY_INNER_RADIUS, createFabricationComplexOverlay } from "./client-map-3d-fabrication-complex.js";
import { UMBRITE_SYNTHESIS_MODULE_HEIGHT, UMBRITE_SYNTHESIS_SCALE, createUmbriteSynthesisModuleOverlay } from "./client-map-3d-umbrite-synthesis-module.js";
import {
  bounds,
  chamberMesh,
  chamberRingMesh,
  feedPipeMesh,
  gaugeFaceMesh,
  injectorMesh,
  injectorRingMesh,
  insideBarrel,
  instancedMeshes,
  manifoldMesh,
  needleMesh,
  params,
  podMesh,
  translation,
  umbriteCoreMesh,
  yAxisColumn,
  zAxisColumn
} from "./client-map-3d-umbrite-synthesis-inspect.js";

const SCALE = UMBRITE_SYNTHESIS_SCALE;
const build = (max = 2) => {
  const scene = new Scene();
  const overlay = createUmbriteSynthesisModuleOverlay(scene, max);
  overlay.addInstance(0, 0, 0, 0, 0, 0);
  overlay.commit();
  return { scene, overlay };
};

const materialOf = (mesh: InstancedMesh | undefined): MeshStandardMaterial => mesh!.material as MeshStandardMaterial;

describe("umbrite synthesis overlay", () => {
  it("commits a fully assembled module with the chamber dominant", () => {
    const { scene } = build();
    const meshes = instancedMeshes(scene);
    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) {
      expect(mesh.count).toBeGreaterThan(0);
    }

    // One barrel, one core, three compression hoops, two injectors either end,
    // one pressure assembly, two feed runs and one rear coupling.
    expect(chamberMesh(scene)!.count).toBe(1);
    expect(umbriteCoreMesh(scene)!.count).toBe(1);
    expect(chamberRingMesh(scene)!.count).toBe(3);
    expect(injectorMesh(scene)!.count).toBe(2);
    expect(injectorRingMesh(scene)!.count).toBe(2);
    expect(manifoldMesh(scene)!.count).toBe(1);
    expect(gaugeFaceMesh(scene)!.count).toBe(1);
    expect(needleMesh(scene)!.count).toBe(1);
    expect(feedPipeMesh(scene)!.count).toBe(2);
    expect(podMesh(scene)!.count).toBe(1);
  });

  it("lays the synthesis chamber horizontal, across the pod on the Z axis", () => {
    const { scene } = build();
    const barrel = chamberMesh(scene)!;
    // A cylinder's length rides its local +Y, so after the quarter turn that
    // lays it down the second matrix column must run along Z with no vertical
    // component. A barrel that had stayed upright would read the other way.
    const axis = yAxisColumn(barrel, 0);
    expect(Math.abs(axis.z)).toBeCloseTo(SCALE, 4);
    expect(Math.abs(axis.y)).toBeLessThan(1e-6);
    expect(Math.abs(axis.x)).toBeLessThan(1e-6);
    // And it is wider than it is tall, which is what makes it read as a
    // horizontal vessel rather than a squat upright one.
    const shape = (barrel.geometry as CylinderGeometry).parameters;
    expect(shape.height!).toBeGreaterThan(shape.radiusTop! * 2);
    const box = bounds(barrel);
    expect(box.maxRadius).toBeGreaterThan(0.1);
  });

  it("suspends the umbrite core inside the chamber, shorter than the shell", () => {
    const { scene } = build();
    const barrel = chamberMesh(scene)!;
    const core = umbriteCoreMesh(scene)!;
    // The core's centre sits inside the barrel's own geometry space, which is
    // only true if it is genuinely suspended within the shell.
    expect(insideBarrel(barrel, translation(core, 0))).toBe(true);
    // It stops short of the vessel's end walls, so the two never share a plane.
    const coreLength = (core.geometry as CylinderGeometry).parameters.height! * SCALE;
    const barrelLength = (barrel.geometry as CylinderGeometry).parameters.height! * SCALE;
    expect(coreLength).toBeLessThan(barrelLength);
    expect(coreLength).toBeGreaterThan(0.9 * barrelLength);
  });

  it("keeps the umbrite dense and dark rather than lit", () => {
    const { scene } = build();
    const umbrite = materialOf(umbriteCoreMesh(scene));
    const { color, emissive, emissiveIntensity, transparent } = umbrite;
    // Near-black violet base: every channel stays low, so the core reads as a
    // mass and not as a surface catching the light.
    expect(color.r).toBeLessThan(0.2);
    expect(color.g).toBeLessThan(0.15);
    expect(color.b).toBeLessThan(0.3);
    // Faintly self-lit at most. A bright core would say "power", and this module
    // has to say "dense substance under pressure".
    expect(emissiveIntensity).toBeLessThanOrEqual(0.5);
    expect(transparent).toBe(false);
    // Violet, so the accents are the same family as the material itself.
    expect(emissive.b).toBeGreaterThan(emissive.r);
  });

  it("reads the chamber as a dark translucent window over the core", () => {
    const { scene } = build();
    const shell = materialOf(chamberMesh(scene));
    // Genuinely translucent, so the core is visible through the pressure vessel
    // rather than painted onto its face.
    expect(shell.transparent).toBe(true);
    expect(shell.opacity).toBeLessThan(0.6);
    expect(shell.opacity).toBeGreaterThan(0.2);
  });

  it("clamps the barrel with three heavy compression rings", () => {
    const { scene } = build();
    const rings = chamberRingMesh(scene)!;
    expect(rings.count).toBe(3);
    // Each hoop's hole runs along the barrel's own axis, and the three are
    // spread along it — two at the ends, one at the middle.
    const ringZ = (i: number): number => {
      const normal = zAxisColumn(rings, i);
      expect(Math.abs(normal.z)).toBeCloseTo(SCALE, 4);
      return translation(rings, i).z;
    };
    const aftZ = ringZ(0);
    const midZ = ringZ(1);
    const foreZ = ringZ(2);
    expect(aftZ).toBeLessThan(0);
    expect(foreZ).toBeGreaterThan(0);
    expect(Math.abs(midZ)).toBeLessThan(0.01);
    expect(Math.abs(aftZ)).toBeCloseTo(Math.abs(foreZ), 4);
  });

  it("feeds the barrel from both ends with coaxial injectors", () => {
    const { scene } = build();
    const injectors = injectorMesh(scene)!;
    expect(injectors.count).toBe(2);
    const centres = [translation(injectors, 0), translation(injectors, 1)];
    // One at each end of the barrel, mirrored across the module's centre line.
    const sides = centres.map((c) => Math.sign(c.z)).sort();
    expect(sides).toEqual([-1, 1]);
    for (const c of centres) {
      expect(Math.abs(c.x)).toBeLessThan(1e-6);
      expect(c.y).toBeCloseTo(0.14 * SCALE, 4);
    }
    expect(Math.abs(centres[0]!.z)).toBeCloseTo(Math.abs(centres[1]!.z), 4);
    // Coaxial with the barrel: each injector's own axis is the barrel's axis.
    for (const i of [0, 1]) {
      const axis = yAxisColumn(injectors, i);
      expect(Math.abs(axis.z)).toBeCloseTo(SCALE, 4);
      expect(Math.abs(axis.y)).toBeLessThan(1e-6);
    }
    // The purple entry rings face inward, toward the vessel.
    const rings = injectorRingMesh(scene)!;
    expect(rings.count).toBe(2);
    for (const i of [0, 1]) {
      const normal = zAxisColumn(rings, i);
      expect(Math.abs(normal.z)).toBeCloseTo(SCALE, 4);
    }
  });

  it("braces the injectors to the pod with two short reinforced pipes", () => {
    const { scene } = build();
    const pipes = feedPipeMesh(scene)!;
    expect(pipes.count).toBe(2);
    for (const i of [0, 1]) {
      // Real length, not a unit rod left unscaled: the run's axis carries it.
      const axis = yAxisColumn(pipes, i);
      expect(axis.length()).toBeGreaterThan(0.02 * SCALE);
      expect(axis.length()).toBeLessThan(0.09 * SCALE);
      // Each run leans in toward the pod's centre line.
      const centre = translation(pipes, i);
      expect(Math.abs(centre.x)).toBeGreaterThan(0.001);
    }
  });

  it("carries one chunky pressure-control assembly facing forward", () => {
    const { scene } = build();
    const manifold = manifoldMesh(scene)!;
    const face = gaugeFaceMesh(scene)!;
    const needle = needleMesh(scene)!;
    // The dial stands proud of the pod's centre line so it faces the viewer,
    // and its ring stands proud of the face.
    expect(translation(face, 0).x).toBeGreaterThan(0.02 * SCALE);
    expect(translation(manifold, 0).x).toBeCloseTo(0, 6);
    // The needle lies across the dial face, angled off vertical.
    const n = yAxisColumn(needle, 0);
    expect(n.y).toBeGreaterThan(Math.abs(n.x));
    // One assembly only — this is a single pressure-control point, not a bank.
    expect(manifold.count).toBe(1);
    expect(face.count).toBe(1);
  });

  it("fits the shared dock envelope", () => {
    const { scene } = build();
    const meshes = instancedMeshes(scene);
    const m = new Matrix4();
    const v = new Vector3();
    let minY = Infinity;
    let maxY = -Infinity;
    let maxRadius = 0;
    for (const mesh of meshes) {
      const attr = mesh.geometry.getAttribute("position");
      for (let i = 0; i < mesh.count; i += 1) {
        mesh.getMatrixAt(i, m);
        for (let k = 0; k < attr.count; k += 1) {
          v.fromBufferAttribute(attr, k).applyMatrix4(m);
          minY = Math.min(minY, v.y);
          maxY = Math.max(maxY, v.y);
          maxRadius = Math.max(maxRadius, Math.hypot(v.x, v.z));
        }
      }
    }
    // Sits on its pad, and stays under the shared 0.34 height cap.
    expect(minY).toBeCloseTo(0, 2);
    expect(maxY).toBeLessThanOrEqual(0.34);
    // The published height constant is the real top of the module.
    expect(maxY).toBeCloseTo(UMBRITE_SYNTHESIS_MODULE_HEIGHT, 2);
    // Everything above the seat — including the horizontal barrel and its
    // injectors, which are what set this family's width — stays inside the bay.
    for (const mesh of meshes) {
      if (params(mesh).type === "TorusGeometry" && (params(mesh).parameters as { radius: number }).radius === 0.12) continue;
      const b = bounds(mesh);
      expect(b.maxRadius).toBeLessThan(AFC_BAY_INNER_RADIUS);
    }
  });
});

describe("umbrite synthesis docking", () => {
  it("docks on the real AFC socket ring without swinging off its socket", () => {
    const afcScene = new Scene();
    const afc = createFabricationComplexOverlay(afcScene, 1);
    const afcIndex = afc.addInstance(0, 0, 0, 4, 0);
    afc.commit();
    const attachment = afc.moduleSocketAttachments(afcIndex)[3]!;

    const scene = new Scene();
    const overlay = createUmbriteSynthesisModuleOverlay(scene, 1);
    expect(overlay.addInstance(attachment.x, attachment.z, attachment.y, attachment.yaw, 0, 0)).toBe(0);
    overlay.commit();

    // The module lands on the socket it was handed: the seat's own centre sits
    // on the attachment point, which is a world position well away from the
    // origin. A placement that folded the origin into the rotation would throw
    // it most of a bay off.
    // The seat pad is the first mesh, and it sits ON the attachment point rather
    // than at it — so the lateral position has to match exactly while the height
    // carries the pad's own 0.016 offset.
    const base = translation(instancedMeshes(scene)[0]!, 0);
    expect(base.x).toBeCloseTo(attachment.x, 4);
    expect(base.z).toBeCloseTo(attachment.z, 4);
    expect(base.y - attachment.y).toBeCloseTo(0.016 * SCALE, 4);
    expect(Math.hypot(attachment.x, attachment.z)).toBeGreaterThan(0.1);
    overlay.dispose();
    afc.dispose();
  });

  it("rotates the whole module with the socket yaw", () => {
    const scene = new Scene();
    const overlay = createUmbriteSynthesisModuleOverlay(scene, 2);
    overlay.addInstance(3, 4, 0, 0, 0, 0);
    overlay.addInstance(3, 4, 0, Math.PI / 2, 0, 0);
    overlay.commit();

    const barrel = chamberMesh(scene)!;
    const upright = yAxisColumn(barrel, 0);
    const yawed = yAxisColumn(barrel, 1);
    // The same dock point for both, so the horizontal offsets have to agree.
    expect(translation(barrel, 0).distanceTo(translation(barrel, 1))).toBeLessThan(1e-5);
    // A quarter turn about the module's own dock point swings the barrel's
    // lateral axis from Z onto X.
    expect(Math.abs(upright.z)).toBeCloseTo(SCALE, 4);
    expect(Math.abs(yawed.x)).toBeCloseTo(SCALE, 4);
    expect(Math.abs(yawed.z)).toBeLessThan(1e-6);
    overlay.dispose();
  });

  it("holds still: no idle animation", () => {
    const scene = new Scene();
    const overlay = createUmbriteSynthesisModuleOverlay(scene, 2);
    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();
    const before = instancedMeshes(scene).map((mesh) => mesh.instanceMatrix.array.slice());
    overlay.update(0);
    overlay.update(1000);
    overlay.update(64_000);
    const after = instancedMeshes(scene).map((mesh) => mesh.instanceMatrix.array.slice());
    expect(after).toEqual(before);
    overlay.dispose();
  });

  it("caps at maxInstances, clears, and disposes every owned resource", () => {
    const scene = new Scene();
    const overlay = createUmbriteSynthesisModuleOverlay(scene, 2);
    expect(overlay.addInstance(0, 0, 0, 0, 0, 0)).toBe(0);
    expect(overlay.addInstance(4, 4, 0, 0.4, 0, 0)).toBe(1);
    expect(overlay.addInstance(8, 8, 0, 0.8, 0, 0)).toBe(-1);
    overlay.commit();
    expect(chamberMesh(scene)!.count).toBe(2);
    expect(injectorMesh(scene)!.count).toBe(4);
    expect(chamberRingMesh(scene)!.count).toBe(6);

    overlay.clear();
    overlay.commit();
    for (const mesh of instancedMeshes(scene)) {
      expect(mesh.count).toBe(0);
    }

    overlay.dispose();
    expect(scene.children.filter((child) => child instanceof InstancedMesh)).toHaveLength(0);
  });
});

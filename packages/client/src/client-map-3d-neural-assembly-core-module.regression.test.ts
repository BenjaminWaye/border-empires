// Regression tests for the Neural Assembly Core (NAC) AFC module overlay.
//
// These pin the things that are easy to break by accident and invisible in a
// screenshot: that the family really is one large exposed spherical neural core
// SUSPENDED inside a brass gimbal frame above the pod rather than a squat block
// or a bright reactor, that the dark smoky-glass sphere is crossed by a few
// broad glowing cyan pathways (restrained neural activity, not power-plant
// glare), that four thick conductor arms rise from the processor housing to
// seat in the gimbal and reach contact prongs toward the core, and that the
// whole assembly stays inside the shared bay.

import { describe, expect, it } from "vitest";
import { Scene } from "three";
import {
  NEURAL_ASSEMBLY_CORE_BASE_RADIUS,
  NEURAL_ASSEMBLY_CORE_MODULE_HEIGHT,
  NEURAL_ASSEMBLY_CORE_SCALE,
  createNeuralAssemblyCoreModuleOverlay
} from "./client-map-3d-neural-assembly-core-module.js";
import {
  NAC_ARM,
  NAC_ARM_AZIMUTHS,
  NAC_CONDUIT,
  NAC_GIMBAL,
  NAC_GLASS,
  NAC_HOUSING,
  NAC_PATHWAY,
  NAC_PATHWAY_LATITUDE_LIFT,
  NAC_POD,
  NAC_POD_CROWN,
  NAC_TOWER_TOP
} from "./client-map-3d-neural-assembly-core-parts.js";
import { AFC_BAY_INNER_RADIUS, createFabricationComplexOverlay } from "./client-map-3d-fabrication-complex.js";
import {
  baseMesh,
  bounds,
  conduitMesh,
  couplingMesh,
  couplingRingMesh,
  couplingTipMesh,
  elbowMesh,
  envelope,
  gimbalInnerMesh,
  gimbalOuterMesh,
  housingBandMesh,
  housingMesh,
  instancedMeshes,
  materialOf,
  params,
  podMesh,
  postMesh,
  prongMesh,
  ringLiesHorizontal,
  ringWrapsX,
  ringWrapsZ,
  shoulderMesh,
  sphereMesh,
  translation,
  pathwayMesh,
  upperArmMesh,
  yAxisColumn
} from "./client-map-3d-neural-assembly-core-inspect.js";

const build = (instances = 1): { scene: Scene; overlay: ReturnType<typeof createNeuralAssemblyCoreModuleOverlay> } => {
  const scene = new Scene();
  const overlay = createNeuralAssemblyCoreModuleOverlay(scene, instances);
  for (let i = 0; i < instances; i += 1) overlay.addInstance(i * 0.5, 0, 0, 0, 0, 0);
  overlay.commit();
  return { scene, overlay };
};

describe("neural assembly core module construction", () => {
  it("builds every part of the silhouette: seat, pod, housing, post, sphere, pathways, gimbal, arms, conduits, coupling", () => {
    const { scene } = build();
    expect(podMesh(scene)).toBeDefined();
    expect(baseMesh(scene)).toBeDefined();
    expect(housingMesh(scene)).toBeDefined();
    expect(housingBandMesh(scene)).toBeDefined();
    expect(postMesh(scene)).toBeDefined();
    expect(sphereMesh(scene)).toBeDefined();
    expect(pathwayMesh(scene)).toBeDefined();
    expect(gimbalOuterMesh(scene)).toBeDefined();
    expect(gimbalInnerMesh(scene)).toBeDefined();
    expect(shoulderMesh(scene)).toBeDefined();
    expect(upperArmMesh(scene)).toBeDefined();
    expect(elbowMesh(scene)).toBeDefined();
    expect(prongMesh(scene)).toBeDefined();
    expect(conduitMesh(scene)).toBeDefined();
    expect(couplingMesh(scene)).toBeDefined();
    expect(couplingRingMesh(scene)).toBeDefined();
    expect(couplingTipMesh(scene)).toBeDefined();
  });

  it("suspends one dark smoky-glass sphere above the pod crown", () => {
    // MAIN_READ: the neural core must float — its whole volume clears the pod
    // crown, carried only by the thin post and the conductor arms — and its
    // material must read as dark smoky glass, never as an emissive gem or a
    // reactor core.
    const { scene } = build();
    const sphere = sphereMesh(scene)!;
    expect(sphere.count).toBe(1);
    const t = translation(sphere, 0);
    expect(t.x).toBeCloseTo(0, 6);
    expect(t.z).toBeCloseTo(0, 6);
    expect(t.y).toBeCloseTo(NAC_GLASS.y * NEURAL_ASSEMBLY_CORE_SCALE, 6);
    expect(t.y - NAC_GLASS.radius * NEURAL_ASSEMBLY_CORE_SCALE).toBeGreaterThan(NAC_POD_CROWN * NEURAL_ASSEMBLY_CORE_SCALE);
    const sm = materialOf(sphere);
    expect(sm.emissive.b).toBe(0);
    expect(sm.emissiveIntensity).toBe(1);
    expect(sm.metalness).toBeGreaterThan(0.4);
    expect(sm.roughness).toBeLessThan(0.45);
    // The thin post runs from the housing crown straight up to the sphere,
    // between the two legs of the gap.
    const post = postMesh(scene)!;
    expect(post.count).toBe(1);
    const postT = translation(post, 0);
    const housingTop = NAC_HOUSING.y + NAC_HOUSING.length * 0.5;
    const postLength = NAC_GLASS.y - housingTop;
    expect(postT.y).toBeCloseTo((housingTop + postLength * 0.5) * NEURAL_ASSEMBLY_CORE_SCALE, 6);
    const axis = yAxisColumn(post, 0);
    expect(Math.abs(axis.x)).toBeLessThan(1e-6);
    expect(Math.abs(axis.z)).toBeLessThan(1e-6);
    expect(axis.y).toBeGreaterThan(0.01);
  });

  it("crosses three broad glowing cyan pathways over the dark core", () => {
    const { scene } = build();
    const pathways = pathwayMesh(scene)!;
    expect(pathways.count).toBe(3);
    // Two latitude rings (equator + one higher) and one meridian ring, all on
    // the sphere's centre line or above it.
    const ys = [0, 1, 2].map((i) => translation(pathways, i).y).sort((a, b) => a - b);
    // Two rings ride the sphere's centre line (the equator and the meridian),
    // the third sits one latitude lift higher.
    expect(ys[0]!).toBeCloseTo(NAC_GLASS.y * NEURAL_ASSEMBLY_CORE_SCALE, 6);
    expect(ys[1]!).toBeCloseTo(NAC_GLASS.y * NEURAL_ASSEMBLY_CORE_SCALE, 6);
    expect(ys[2]!).toBeCloseTo((NAC_GLASS.y + NAC_PATHWAY_LATITUDE_LIFT) * NEURAL_ASSEMBLY_CORE_SCALE, 6);
    expect(ringLiesHorizontal(pathways, 0)).toBe(true);
    expect(ringWrapsZ(pathways, 2)).toBe(true);
    // Restrained neural glow: genuinely cyan, moderate brightness, so the core
    // reads as an active neural assembler rather than a power plant.
    const pm = materialOf(pathways);
    expect(pm.emissive.b).toBeGreaterThan(pm.emissive.r);
    expect(pm.emissiveIntensity).toBeGreaterThan(0.9);
    expect(pm.emissiveIntensity).toBeLessThan(1.4);
  });

  it("cradles the core in a crossed brass gimbal frame", () => {
    const { scene } = build();
    const outer = gimbalOuterMesh(scene)!;
    const inner = gimbalInnerMesh(scene)!;
    expect(outer.count).toBe(1);
    expect(inner.count).toBe(1);
    // The outer hoop stands vertical in the forward plane, the inner hoop across
    // it, both through the sphere's centre.
    expect(ringWrapsZ(outer, 0)).toBe(true);
    expect(ringWrapsX(inner, 0)).toBe(true);
    const sphereT = translation(sphereMesh(scene)!, 0);
    expect(translation(outer, 0).x).toBeCloseTo(sphereT.x, 6);
    expect(translation(outer, 0).z).toBeCloseTo(sphereT.z, 6);
    expect(translation(outer, 0).y).toBeCloseTo(sphereT.y, 6);
    expect(translation(inner, 0).x).toBeCloseTo(sphereT.x, 6);
    expect(translation(inner, 0).z).toBeCloseTo(sphereT.z, 6);
    expect(translation(inner, 0).y).toBeCloseTo(sphereT.y, 6);
    // The whole head is the aged brass of the ring...
    expect(materialOf(outer).metalness).toBeGreaterThan(0.7);
    expect(materialOf(inner).metalness).toBeGreaterThan(0.7);
    // ...and it clears both the sphere and its pathway rings.
    expect(NAC_GLASS.radius + NAC_PATHWAY.tube).toBeLessThan(NAC_GIMBAL.innerRadius);
  });

  it("raises four conductor arms that seat in the gimbal and reach toward the core", () => {
    const { scene } = build();
    // Shoulders anchor on the housing flank at the four cardinals.
    const shoulders = shoulderMesh(scene)!;
    expect(shoulders.count).toBe(NAC_ARM_AZIMUTHS.length);
    for (let i = 0; i < shoulders.count; i += 1) {
      const t = translation(shoulders, i);
      expect(Math.hypot(t.x, t.z)).toBeCloseTo(NAC_ARM.shoulderR * NEURAL_ASSEMBLY_CORE_SCALE, 6);
      expect(t.y).toBeCloseTo(NAC_ARM.shoulderY * NEURAL_ASSEMBLY_CORE_SCALE, 6);
    }
    // Upper runs climb from the shoulder up-and-out to an elbow at the gimbal's
    // outer radius, at about the sphere's centre height.
    const uppers = upperArmMesh(scene)!;
    expect(uppers.count).toBe(NAC_ARM_AZIMUTHS.length);
    const elbows = elbowMesh(scene)!;
    expect(elbows.count).toBe(NAC_ARM_AZIMUTHS.length);
    const elbowYs = [0, 1, 2, 3].map((i) => translation(elbows, i).y);
    for (const y of elbowYs) expect(y).toBeCloseTo(NAC_ARM.upperY * NEURAL_ASSEMBLY_CORE_SCALE, 6);
    for (let i = 0; i < elbows.count; i += 1) {
      const t = translation(elbows, i);
      expect(Math.hypot(t.x, t.z)).toBeCloseTo(NAC_ARM.upperOut * NEURAL_ASSEMBLY_CORE_SCALE, 6);
    }
    expect(Math.hypot(translation(uppers, 0).x, translation(uppers, 0).z)).toBeCloseTo(
      (NAC_ARM.shoulderR + NAC_ARM.upperOut) * 0.5 * NEURAL_ASSEMBLY_CORE_SCALE,
      6
    );
    // Every elbow is exactly at one of the four cardinals.
    const angles = [0, 1, 2, 3]
      .map((i) => Math.atan2(translation(elbows, i).z, translation(elbows, i).x))
      .map((a) => (a < 0 ? a + Math.PI * 2 : a))
      .sort((a, b) => a - b);
    for (let i = 0; i < 4; i += 1) expect(angles[i]!).toBeCloseTo(NAC_ARM_AZIMUTHS[i]!, 5);
    // Contact prongs leave the elbow and reach back inward, hovering just off
    // the sphere's surface — the AFC writing patterns into the core.
    const prongs = prongMesh(scene)!;
    expect(prongs.count).toBe(NAC_ARM_AZIMUTHS.length);
    for (let i = 0; i < prongs.count; i += 1) {
      const t = translation(prongs, i);
      const axis = yAxisColumn(prongs, i);
      const azimuth = Math.atan2(t.z, t.x);
      const inward = { x: -Math.cos(azimuth), z: -Math.sin(azimuth) };
      const axisLength = Math.hypot(axis.x, axis.z);
      expect(axis.x / axisLength * inward.x + axis.z / axisLength * inward.z).toBeGreaterThan(0.99);
      const mid = Math.hypot(t.x, t.z);
      expect(mid).toBeCloseTo((NAC_ARM.upperOut + NAC_ARM.prongTip) * 0.5 * NEURAL_ASSEMBLY_CORE_SCALE, 6);
      // The tip is inside the elbow but outside the sphere surface.
      const tip = { x: t.x + axis.x * 0.5, z: t.z + axis.z * 0.5 };
      const tipRadius = Math.hypot(tip.x, tip.z);
      expect(tipRadius).toBeCloseTo(NAC_ARM.prongTip * NEURAL_ASSEMBLY_CORE_SCALE, 6);
      expect(tipRadius).toBeGreaterThan(NAC_GLASS.radius * NEURAL_ASSEMBLY_CORE_SCALE);
      expect(tipRadius).toBeLessThan(NAC_ARM.upperOut * NEURAL_ASSEMBLY_CORE_SCALE);
    }
  });

  it("sits on a compact lower processor housing with a brass clamp band", () => {
    const { scene } = build();
    const housing = housingMesh(scene)!;
    expect(housing.count).toBe(1);
    expect(translation(housing, 0).y).toBeCloseTo(NAC_HOUSING.y * NEURAL_ASSEMBLY_CORE_SCALE, 6);
    const axis = yAxisColumn(housing, 0);
    expect(Math.abs(axis.x)).toBeLessThan(1e-6);
    expect(axis.y).toBeGreaterThan(0.01);
    expect(materialOf(housing).metalness).toBeGreaterThan(0.4);
    const band = housingBandMesh(scene)!;
    expect(band.count).toBe(1);
    expect(ringLiesHorizontal(band, 0)).toBe(true);
    expect(translation(band, 0).y).toBeCloseTo((NAC_HOUSING.y + 0.005) * NEURAL_ASSEMBLY_CORE_SCALE, 6);
    expect(materialOf(band).metalness).toBeGreaterThan(0.7);
  });

  it("feeds two heavy data/power conduits back into the AFC low on the rear", () => {
    const { scene } = build();
    const conduits = conduitMesh(scene)!;
    expect(conduits.count).toBe(2);
    for (let i = 0; i < conduits.count; i += 1) {
      const t = translation(conduits, i);
      // Both run from the housing flank down-and-back toward the coupling.
      expect(t.y).toBeLessThan(NAC_HOUSING.y * NEURAL_ASSEMBLY_CORE_SCALE + NAC_HOUSING.length * 0.5 * NEURAL_ASSEMBLY_CORE_SCALE);
      const axis = yAxisColumn(conduits, i);
      expect(axis.x).toBeGreaterThan(0);
      expect(Math.abs(axis.x)).toBeGreaterThan(Math.abs(axis.y));
    }
    expect(Math.abs(translation(conduits, 0).z)).toBeCloseTo(NAC_CONDUIT.z * NEURAL_ASSEMBLY_CORE_SCALE, 6);
    expect(Math.abs(translation(conduits, 1).z)).toBeCloseTo(NAC_CONDUIT.z * NEURAL_ASSEMBLY_CORE_SCALE, 6);
  });

  it("carries one heavy rear AFC connector with a brass ring and cyan contact tip", () => {
    const { scene } = build();
    expect(couplingMesh(scene)!.count).toBe(1);
    expect(couplingRingMesh(scene)!.count).toBe(1);
    expect(couplingTipMesh(scene)!.count).toBe(1);
    expect(translation(couplingMesh(scene)!, 0).x).toBeLessThan(0);
    const tipMaterial = materialOf(couplingTipMesh(scene)!);
    expect(tipMaterial.emissive.b).toBeGreaterThan(tipMaterial.emissive.r);
  });
});

describe("neural assembly core module envelope", () => {
  it("sits on the pad top rather than sinking through it", () => {
    const { scene } = build();
    expect(envelope(scene).minY).toBeGreaterThanOrEqual(-0.01);
  });

  it("stays inside the module height cap, its tallest point the gimbal peak", () => {
    const { scene } = build();
    const MODULE_HEIGHT_CAP = 0.34;
    const env = envelope(scene);
    expect(env.maxY).toBeLessThanOrEqual(MODULE_HEIGHT_CAP);
    // The neural head reads as a floated sphere over a low pod: it clears the
    // 0.30 floor, and the peak of the gimbal's outer hoop carries the top of the
    // envelope — the whole head protruding from the same rounded pod every other
    // family docks with.
    expect(env.maxY).toBeGreaterThan(0.3);
    expect(env.maxY).toBeGreaterThan(NAC_POD_CROWN * NEURAL_ASSEMBLY_CORE_SCALE + 0.1);
    expect(env.maxY).toBeCloseTo(NAC_TOWER_TOP * NEURAL_ASSEMBLY_CORE_SCALE, 4);
  });

  it("publishes its height as the peak of the gimbal frame", () => {
    const { scene } = build();
    const env = envelope(scene);
    const published = NEURAL_ASSEMBLY_CORE_MODULE_HEIGHT;
    // Geometry stores vertices as Float32, so the tessellated gimbal peak can
    // jitter a hair above the exact published height.
    expect(published).toBeGreaterThanOrEqual(env.maxY - 1e-6);
    expect(published).toBeCloseTo(NAC_TOWER_TOP * NEURAL_ASSEMBLY_CORE_SCALE, 6);
  });

  it("keeps the widest elevated part inside the AFC bay, its width the arm elbows", () => {
    const { scene } = build();
    // The shared seat lip deliberately overhangs the bay, exactly as on every
    // other family, so it is skipped by parameter and checked on its own below.
    for (const mesh of instancedMeshes(scene)) {
      if (params(mesh).type === "TorusGeometry" && (params(mesh).parameters as { radius: number }).radius === 0.12) continue;
      expect(bounds(mesh).maxRadius).toBeLessThan(AFC_BAY_INNER_RADIUS);
    }
    // The gimbal cradles the sphere tightly, and the four conductor arms stick
    // out past it: the seated elbows set this family's width.
    const elbows = elbowMesh(scene)!;
    const gimbal = gimbalOuterMesh(scene)!;
    const sphere = sphereMesh(scene)!;
    expect(bounds(elbows).maxRadius).toBeGreaterThan(0.07);
    expect(bounds(elbows).maxRadius).toBeGreaterThan(bounds(gimbal).maxRadius);
    expect(bounds(sphere).maxRadius).toBeLessThan(0.06);
  });

  it("docks on the same circular seat as the rest of the ring", () => {
    const { scene } = build();
    expect(bounds(baseMesh(scene)!).maxRadius).toBeCloseTo(0.105 * NEURAL_ASSEMBLY_CORE_SCALE, 6);
    expect(NEURAL_ASSEMBLY_CORE_BASE_RADIUS).toBeLessThan(AFC_BAY_INNER_RADIUS);
  });
});

describe("neural assembly core module lifecycle", () => {
  it("clears every slot", () => {
    const { scene, overlay } = build(2);
    overlay.clear();
    overlay.commit();
    for (const mesh of instancedMeshes(scene)) expect(mesh.count).toBe(0);
  });

  it("caps its instance count", () => {
    const { overlay } = build(1);
    expect(overlay.addInstance(9, 9, 0, 0, 0, 0)).toBe(-1);
  });

  it("removes and frees everything it owns on dispose", () => {
    const { scene, overlay } = build(1);
    const meshes = instancedMeshes(scene);
    expect(meshes.length).toBeGreaterThan(0);
    overlay.dispose();
    expect(instancedMeshes(scene).length).toBe(0);
  });

  it("renders once and holds still — update is a no-op", () => {
    const { scene, overlay } = build(2);
    const before = instancedMeshes(scene).map((mesh) => mesh.instanceMatrix.array.slice());
    overlay.update(4000);
    const after = instancedMeshes(scene).map((mesh) => mesh.instanceMatrix.array.slice());
    expect(after).toEqual(before);
  });
});

describe("neural assembly core module docking", () => {
  it("spaces instances apart on the socket ring, and yaws each about its own dock point", () => {
    const { scene } = build(2);
    const pod = podMesh(scene)!;
    expect(pod.count).toBe(2);
    const a = translation(pod, 0);
    const b = translation(pod, 1);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(0.5, 6);
    // The four conductor elbows sit at the cardinal azimuths, exactly symmetric
    // about the module's own centre line — their midpoint must land on the
    // socket itself. Fold the origin into the yaw and that midpoint lands on
    // the SOCKET'S ROTATION instead, a different point whenever yaw ≠ 0.
    const yawed = new Scene();
    const overlay = createNeuralAssemblyCoreModuleOverlay(yawed, 1);
    overlay.addInstance(3, -2, 0, 1.1, 0, 0);
    overlay.commit();
    const yawedElbows = elbowMesh(yawed)!;
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < yawedElbows.count; i += 1) {
      cx += translation(yawedElbows, i).x;
      cz += translation(yawedElbows, i).z;
    }
    expect(cx / 4).toBeCloseTo(3, 6);
    expect(cz / 4).toBeCloseTo(-2, 6);
  });

  it("docks on the real AFC socket ring without swinging off its socket", () => {
    const afcScene = new Scene();
    const afc = createFabricationComplexOverlay(afcScene, 1);
    const afcIndex = afc.addInstance(0, 0, 0, 4, 0);
    afc.commit();
    const attachment = afc.moduleSocketAttachments(afcIndex)[3]!;

    const scene = new Scene();
    const overlay = createNeuralAssemblyCoreModuleOverlay(scene, 1);
    overlay.addInstance(attachment.x, attachment.z, attachment.y, attachment.yaw, 0, 0);
    overlay.commit();

    // The pod's own origin is the socket point — not the world origin pulled
    // through the yaw.
    const pod = podMesh(scene)!;
    const podOrigin = translation(pod, 0);
    expect(Math.hypot(podOrigin.x, podOrigin.z)).toBeCloseTo(Math.hypot(attachment.x, attachment.z), 5);
    // The sphere hangs dead-centre over the socket (it sits on the module's own
    // centre line), keeping its full height lift through the dock yaw.
    const sphere = sphereMesh(scene)!;
    const sphereT = translation(sphere, 0);
    expect(sphereT.x).toBeCloseTo(attachment.x, 5);
    expect(sphereT.z).toBeCloseTo(attachment.z, 5);
    expect(sphereT.y).toBeCloseTo(attachment.y + NAC_GLASS.y * NEURAL_ASSEMBLY_CORE_SCALE, 5);
    // The four conductor elbows bracket the socket symmetrically: their midpoint
    // is the socket point even yawed onto the ring.
    const elbows = elbowMesh(scene)!;
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < elbows.count; i += 1) {
      cx += translation(elbows, i).x;
      cz += translation(elbows, i).z;
    }
    expect(cx / 4).toBeCloseTo(attachment.x, 5);
    expect(cz / 4).toBeCloseTo(attachment.z, 5);
  });
});
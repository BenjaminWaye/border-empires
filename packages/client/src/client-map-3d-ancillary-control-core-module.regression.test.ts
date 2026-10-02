// Regression tests for the Ancillary Control Core (ACC) AFC module overlay.
//
// These pin the things that are easy to break by accident and invisible in a
// screenshot: that the family really is a vertical CONTROL CORE tower ringed by
// four articulated arms rather than a low stack of rings, that the four relay
// blocks sit evenly on the cardinal azimuths with their arms tied back to the
// central housing, that the glow behind the cage is genuinely cyan and
// restrained (a controller's light, not a power plant's), and that the whole
// assembly stays inside the shared bay.

import { describe, expect, it } from "vitest";
import { Scene } from "three";
import {
  ANCILLARY_CONTROL_CORE_BASE_RADIUS,
  ANCILLARY_CONTROL_CORE_MODULE_HEIGHT,
  ANCILLARY_CONTROL_CORE_SCALE,
  createAncillaryControlCoreModuleOverlay
} from "./client-map-3d-ancillary-control-core-module.js";
import {
  ACC_ARM,
  ACC_CAGE,
  ACC_CAGE_HOOP_Y,
  ACC_CLAMP_Y,
  ACC_CORE,
  ACC_CORE_TOP,
  ACC_FIN_Y,
  ACC_GLOW,
  ACC_POD_CROWN
} from "./client-map-3d-ancillary-control-core-parts.js";
import { AFC_BAY_INNER_RADIUS, createFabricationComplexOverlay } from "./client-map-3d-fabrication-complex.js";
import {
  baseMesh,
  bounds,
  cageHoopMesh,
  cageRodMesh,
  clampMesh,
  conduitMesh,
  coreMesh,
  couplingMesh,
  couplingRingMesh,
  couplingTipMesh,
  cylinderStandsVertical,
  elbowMesh,
  envelope,
  finMesh,
  glowMesh,
  instancedMeshes,
  lowerArmMesh,
  materialOf,
  params,
  podMesh,
  relayCollarMesh,
  relayMesh,
  ringWrapsY,
  shoulderMesh,
  translation,
  upperArmMesh,
  yAxisColumn
} from "./client-map-3d-ancillary-control-core-inspect.js";

const build = (instances = 1): { scene: Scene; overlay: ReturnType<typeof createAncillaryControlCoreModuleOverlay> } => {
  const scene = new Scene();
  const overlay = createAncillaryControlCoreModuleOverlay(scene, instances);
  for (let i = 0; i < instances; i += 1) overlay.addInstance(i * 0.5, 0, 0, 0, 0, 0);
  overlay.commit();
  return { scene, overlay };
};

describe("ancillary control core module construction", () => {
  it("builds every part of the silhouette: seat, pod, core, fins, clamps, cage, arms, relays, coupling", () => {
    const { scene } = build();
    expect(podMesh(scene)).toBeDefined();
    expect(baseMesh(scene)).toBeDefined();
    expect(coreMesh(scene)).toBeDefined();
    expect(finMesh(scene)).toBeDefined();
    expect(clampMesh(scene)).toBeDefined();
    expect(glowMesh(scene)).toBeDefined();
    expect(cageRodMesh(scene)).toBeDefined();
    expect(cageHoopMesh(scene)).toBeDefined();
    expect(shoulderMesh(scene)).toBeDefined();
    expect(elbowMesh(scene)).toBeDefined();
    expect(upperArmMesh(scene)).toBeDefined();
    expect(lowerArmMesh(scene)).toBeDefined();
    expect(relayMesh(scene)).toBeDefined();
    expect(relayCollarMesh(scene)).toBeDefined();
    expect(conduitMesh(scene)).toBeDefined();
    expect(couplingMesh(scene)).toBeDefined();
    expect(couplingRingMesh(scene)).toBeDefined();
    expect(couplingTipMesh(scene)).toBeDefined();
  });

  it("towers the vertical processor housing clear of the pod crown, sunk through it", () => {
    // MAIN_READ: the housing must tower over the pod crown by a real margin (or
    // the family reads as a low hub half-buried in its base) while its lower
    // half still passes through the crown, so it reads as mounted through the
    // pod rather than balanced on top of it.
    const { scene } = build();
    expect(cylinderStandsVertical(coreMesh(scene)!)).toBe(true);
    const coreT = translation(coreMesh(scene)!, 0);
    expect(coreT.x).toBeCloseTo(0, 6);
    expect(coreT.z).toBeCloseTo(0, 6);
    expect(coreT.y).toBeCloseTo(ACC_CORE.y * ANCILLARY_CONTROL_CORE_SCALE, 6);
    expect(ACC_CORE_TOP - ACC_POD_CROWN).toBeGreaterThan(0.03);
    expect(ACC_CORE.y - ACC_CORE.length * 0.5).toBeLessThan(ACC_POD_CROWN);
  });

  it("clamps the housing with two brass bands wrapping Y and stands three cooling fins", () => {
    const { scene } = build();
    const clamps = clampMesh(scene)!;
    expect(clamps.count).toBe(2);
    for (let i = 0; i < clamps.count; i += 1) expect(ringWrapsY(clamps, i)).toBe(true);
    const clampYs = [translation(clamps, 0).y, translation(clamps, 1).y].sort((a, b) => a - b);
    for (let i = 0; i < 2; i += 1) expect(clampYs[i]!).toBeCloseTo(ACC_CLAMP_Y[i]! * ANCILLARY_CONTROL_CORE_SCALE, 6);
    const fins = finMesh(scene)!;
    expect(fins.count).toBe(3);
    for (let i = 0; i < fins.count; i += 1) expect(cylinderStandsVertical(fins, i)).toBe(true);
    const finYs = [0, 1, 2].map((i) => translation(fins, i).y).sort((a, b) => a - b);
    for (let i = 0; i < 3; i += 1) expect(finYs[i]!).toBeCloseTo(ACC_FIN_Y[i]! * ANCILLARY_CONTROL_CORE_SCALE, 6);
  });

  it("exposes a restrained cyan glow core behind a reinforced brass cage", () => {
    const { scene } = build();
    const glow = glowMesh(scene)!;
    expect(glow.count).toBe(1);
    expect(cylinderStandsVertical(glow, 0)).toBe(true);
    const glowT = translation(glow, 0);
    expect(glowT.x).toBeCloseTo(0, 6);
    expect(glowT.z).toBeCloseTo(0, 6);
    expect(glowT.y).toBeCloseTo(ACC_GLOW.y * ANCILLARY_CONTROL_CORE_SCALE, 6);
    // Four thin brass rods at the diagonal azimuths, then two brass hoops: the
    // cage reads as a lattice around the glow, not a wall hiding it.
    const rods = cageRodMesh(scene)!;
    expect(rods.count).toBe(4);
    for (let i = 0; i < rods.count; i += 1) expect(cylinderStandsVertical(rods, i)).toBe(true);
    const rodRadii = [0, 1, 2, 3].map((i) => Math.hypot(translation(rods, i).x, translation(rods, i).z));
    for (const radius of rodRadii) expect(radius).toBeCloseTo(ACC_CAGE.radius * ANCILLARY_CONTROL_CORE_SCALE, 6);
    const hoops = cageHoopMesh(scene)!;
    expect(hoops.count).toBe(2);
    for (let i = 0; i < hoops.count; i += 1) expect(ringWrapsY(hoops, i)).toBe(true);
    // Genuinely cyan and restrained — a controller's control light, not a lamp.
    const glowMaterial = materialOf(glow);
    expect(glowMaterial.emissive.b).toBeGreaterThan(glowMaterial.emissive.r);
    expect(glowMaterial.emissiveIntensity).toBeLessThan(1.5);
    // The cage is aged brass, the glow's material is the dark cyan metal.
    expect(materialOf(rods).metalness).toBeGreaterThan(0.7);
    expect(glowMaterial.metalness).toBeLessThan(0.3);
  });

  it("spreads four relay blocks evenly on the cardinal azimuths, each tied back by an articulated arm", () => {
    const { scene } = build();
    const relays = relayMesh(scene)!;
    expect(relays.count).toBe(4);
    // Emitted in azimuth order: +X, +Z, -X, -Z.
    const expectedT = [
      { x: ACC_ARM.relayCenterR, z: 0 },
      { x: 0, z: ACC_ARM.relayCenterR },
      { x: -ACC_ARM.relayCenterR, z: 0 },
      { x: 0, z: -ACC_ARM.relayCenterR }
    ];
    for (let i = 0; i < 4; i += 1) {
      const t = translation(relays, i);
      expect(t.x).toBeCloseTo(expectedT[i]!.x * ANCILLARY_CONTROL_CORE_SCALE, 6);
      expect(t.z).toBeCloseTo(expectedT[i]!.z * ANCILLARY_CONTROL_CORE_SCALE, 6);
      expect(cylinderStandsVertical(relays, i)).toBe(true);
    }
    // Each relay meets the central housing through one shoulder joint, one
    // thick upper run, one elbow and one kinked lower run — all on the same
    // azimuth as their relay, all of which read as one machine reaching in four
    // directions.
    const shoulders = shoulderMesh(scene)!;
    const elbows = elbowMesh(scene)!;
    const uppers = upperArmMesh(scene)!;
    const lowers = lowerArmMesh(scene)!;
    expect(shoulders.count).toBe(4);
    expect(elbows.count).toBe(4);
    expect(uppers.count).toBe(4);
    expect(lowers.count).toBe(4);
    for (let i = 0; i < 4; i += 1) {
      const sDir = translation(shoulders, i);
      const eDir = translation(elbows, i);
      const rDir = translation(relays, i);
      const dot = (sDir.x * rDir.x + sDir.z * rDir.z) / (Math.hypot(sDir.x, sDir.z) * Math.hypot(rDir.x, rDir.z));
      expect(dot).toBeGreaterThan(0.999);
      const eDot = (eDir.x * rDir.x + eDir.z * rDir.z) / (Math.hypot(eDir.x, eDir.z) * Math.hypot(rDir.x, rDir.z));
      expect(eDot).toBeGreaterThan(0.999);
      // Upper run is a mostly-horizontal thick conduit; the lower run kinks
      // down to reach its relay.
      const upperAxis = yAxisColumn(uppers, i);
      expect(Math.hypot(upperAxis.x, upperAxis.z)).toBeGreaterThan(Math.abs(upperAxis.y));
      const lowerAxis = yAxisColumn(lowers, i);
      expect(lowerAxis.y).toBeLessThan(0);
    }
    // Each relay wears a brass collar tying it back to the core.
    const collars = relayCollarMesh(scene)!;
    expect(collars.count).toBe(4);
    for (let i = 0; i < collars.count; i += 1) expect(ringWrapsY(collars, i)).toBe(true);
  });

  it("rises two thick power conduits around the rear flank", () => {
    const { scene } = build();
    const conduits = conduitMesh(scene)!;
    expect(conduits.count).toBe(2);
    for (let i = 0; i < conduits.count; i += 1) {
      const t = translation(conduits, i);
      // Both on the rear (-X) half, flanking the coupling, and angled up.
      expect(t.x).toBeLessThan(0);
      const axis = yAxisColumn(conduits, i);
      expect(axis.y).toBeGreaterThan(Math.abs(axis.x));
    }
  });

  it("carries one heavy rear AFC connector with a brass ring and cyan contact tip", () => {
    const { scene } = build();
    expect(couplingMesh(scene)!.count).toBe(1);
    expect(couplingRingMesh(scene)!.count).toBe(1);
    expect(couplingTipMesh(scene)!.count).toBe(1);
    expect(translation(couplingMesh(scene)!, 0).x).toBeLessThan(0);
    // The family's restrained cyan accent also lands on the contact point.
    const tipMaterial = materialOf(couplingTipMesh(scene)!);
    expect(tipMaterial.emissive.b).toBeGreaterThan(tipMaterial.emissive.r);
  });
});

describe("ancillary control core module envelope", () => {
  it("sits on the pad top rather than sinking through it", () => {
    const { scene } = build();
    expect(envelope(scene).minY).toBeGreaterThanOrEqual(-0.01);
  });

  it("stays inside the module height cap, its tallest point the cage's top hoop", () => {
    const { scene } = build();
    const MODULE_HEIGHT_CAP = 0.34;
    const env = envelope(scene);
    expect(env.maxY).toBeLessThanOrEqual(MODULE_HEIGHT_CAP);
    // The control tower reads tall over a low pod but stays a compact module.
    expect(env.maxY).toBeGreaterThan(0.25);
    expect(env.maxY).toBeGreaterThan(0.05 + ACC_CORE.y * ANCILLARY_CONTROL_CORE_SCALE);
    // The cage by itself carries the top of the envelope.
    expect(envelope(scene).maxY).toBeCloseTo((ACC_CAGE_HOOP_Y[1] + ACC_CAGE.hoopTube) * ANCILLARY_CONTROL_CORE_SCALE, 5);
  });

  it("publishes its height as the top of the cage", () => {
    const { scene } = build();
    const env = envelope(scene);
    const published = ANCILLARY_CONTROL_CORE_MODULE_HEIGHT;
    expect(published).toBeGreaterThanOrEqual(env.maxY - 1e-9);
    expect(published).toBeCloseTo((ACC_CAGE_HOOP_Y[1] + ACC_CAGE.hoopTube) * ANCILLARY_CONTROL_CORE_SCALE, 6);
  });

  it("keeps the widest elevated part inside the AFC bay", () => {
    const { scene } = build();
    // The shared seat lip deliberately overhangs the bay, exactly as on every
    // other family, so it is skipped by parameter and checked on its own below.
    for (const mesh of instancedMeshes(scene)) {
      if (params(mesh).type === "TorusGeometry" && (params(mesh).parameters as { radius: number }).radius === 0.12) continue;
      expect(bounds(mesh).maxRadius).toBeLessThan(AFC_BAY_INNER_RADIUS);
    }
    // The relay blocks are what set this family's width.
    const relays = relayMesh(scene)!;
    expect(bounds(relays).maxRadius).toBeLessThan(AFC_BAY_INNER_RADIUS);
    expect(bounds(relays).maxRadius).toBeGreaterThan(0.11);
  });

  it("docks on the same circular seat as the rest of the ring", () => {
    const { scene } = build();
    expect(bounds(baseMesh(scene)!).maxRadius).toBeCloseTo(0.105 * ANCILLARY_CONTROL_CORE_SCALE, 6);
    expect(ANCILLARY_CONTROL_CORE_BASE_RADIUS).toBeLessThan(AFC_BAY_INNER_RADIUS);
  });
});

describe("ancillary control core module lifecycle", () => {
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

describe("ancillary control core docking", () => {
  it("spaces instances apart on the socket ring, and yaws each about its own dock point", () => {
    const { scene } = build(2);
    const pod = podMesh(scene)!;
    expect(pod.count).toBe(2);
    const a = translation(pod, 0);
    const b = translation(pod, 1);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(0.5, 6);
    // The +Z and -Z relay blocks sit at local z = ±0.084, exactly symmetric
    // about the module's own centre line — their midpoint must land on the
    // socket itself. Fold the origin into the yaw and that midpoint lands on
    // the SOCKET'S ROTATION instead, a different point whenever yaw ≠ 0.
    const yawed = new Scene();
    const overlay = createAncillaryControlCoreModuleOverlay(yawed, 1);
    overlay.addInstance(3, -2, 0, 1.1, 0, 0);
    overlay.commit();
    const yawedRelays = relayMesh(yawed)!;
    // Instance 1 is +Z and instance 3 is -Z in azimuth emission order.
    expect((translation(yawedRelays, 1).x + translation(yawedRelays, 3).x) * 0.5).toBeCloseTo(3, 6);
    expect((translation(yawedRelays, 1).z + translation(yawedRelays, 3).z) * 0.5).toBeCloseTo(-2, 6);
  });

  it("docks on the real AFC socket ring without swinging off its socket", () => {
    const afcScene = new Scene();
    const afc = createFabricationComplexOverlay(afcScene, 1);
    const afcIndex = afc.addInstance(0, 0, 0, 4, 0);
    afc.commit();
    const attachment = afc.moduleSocketAttachments(afcIndex)[3]!;

    const scene = new Scene();
    const overlay = createAncillaryControlCoreModuleOverlay(scene, 1);
    overlay.addInstance(attachment.x, attachment.z, attachment.y, attachment.yaw, 0, 0);
    overlay.commit();

    // The pod's own origin is the socket point — not the world origin pulled
    // through the yaw.
    const pod = podMesh(scene)!;
    const podOrigin = translation(pod, 0);
    expect(Math.hypot(podOrigin.x, podOrigin.z)).toBeCloseTo(Math.hypot(attachment.x, attachment.z), 5);
    // The control core's centre lands exactly on the socket too (it sits on the
    // module's own centre line), and it stays vertical through the dock yaw.
    const core = coreMesh(scene)!;
    const coreT = translation(core, 0);
    expect(coreT.x).toBeCloseTo(attachment.x, 5);
    expect(coreT.z).toBeCloseTo(attachment.z, 5);
    expect(cylinderStandsVertical(core, 0)).toBe(true);
    // The two lateral relay blocks bracket the socket symmetrically: their
    // midpoint is the socket point even yawed onto the ring.
    const relays = relayMesh(scene)!;
    expect((translation(relays, 1).x + translation(relays, 3).x) * 0.5).toBeCloseTo(attachment.x, 5);
    expect((translation(relays, 1).z + translation(relays, 3).z) * 0.5).toBeCloseTo(attachment.z, 5);
  });
});
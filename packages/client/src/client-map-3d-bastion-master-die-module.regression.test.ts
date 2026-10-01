// Regression tests for the Bastion Master-Die (BMD) AFC module overlay.
//
// These pin the things that are easy to break by accident and invisible in a
// screenshot: that the family really is ONE giant armor stamping press on top
// of the pod — two broad opposing platen slabs with only a NARROW gap between
// them holding a thin restrained orange heat seam (not a slab of hot metal, a
// seam), that the oversized hydraulic ram rides directly on the upper die and
// is driven by a heavy header carried by two hydraulic legs that straddle the
// dies in Z rather than blocking the feed, that the reinforced feed tray faces
// FORWARD on the lower bulk of the die stack, and that the whole assembly —
// header and all — stays inside the shared bay and under the height cap.

import { describe, expect, it } from "vitest";
import { Scene } from "three";
import {
  BASTION_MASTER_DIE_BASE_RADIUS,
  BASTION_MASTER_DIE_MODULE_HEIGHT,
  BASTION_MASTER_DIE_SCALE as S,
  createBastionMasterDieModuleOverlay
} from "./client-map-3d-bastion-master-die-module.js";
import {
  BMD_FEED,
  BMD_FEED_CHEEK,
  BMD_HEADER,
  BMD_LEG,
  BMD_LEG_CAP,
  BMD_LOWER_DIE,
  BMD_POD_CROWN,
  BMD_RAM,
  BMD_RAM_COLLAR,
  BMD_SEAM,
  BMD_TOWER_TOP,
  BMD_UPPER_DIE,
  BMD_GAP
} from "./client-map-3d-bastion-master-die-parts.js";
import { AFC_BAY_INNER_RADIUS, createFabricationComplexOverlay } from "./client-map-3d-fabrication-complex.js";
import {
  baseMesh,
  bounds,
  couplingMesh,
  couplingRingMesh,
  couplingTipMesh,
  envelope,
  feedCheekMesh,
  feedMesh,
  headerMesh,
  instancedMeshes,
  legCapMesh,
  legMesh,
  lowerDieMesh,
  materialOf,
  params,
  podMesh,
  ramCollarMesh,
  ramMesh,
  seamMesh,
  translation,
  upperDieMesh
} from "./client-map-3d-bastion-master-die-inspect.js";

const build = (instances = 1): { scene: Scene; overlay: ReturnType<typeof createBastionMasterDieModuleOverlay> } => {
  const scene = new Scene();
  const overlay = createBastionMasterDieModuleOverlay(scene, instances);
  for (let i = 0; i < instances; i += 1) overlay.addInstance(i * 0.5, 0, 0, 0, 0, 0);
  overlay.commit();
  return { scene, overlay };
};

describe("bastion master die module construction", () => {
  it("builds every part of the silhouette: seat, pod, both dies, heat seam, ram, collar, header, legs, caps, feed slot, coupling", () => {
    const { scene } = build();
    expect(podMesh(scene)).toBeDefined();
    expect(baseMesh(scene)).toBeDefined();
    expect(lowerDieMesh(scene)).toBeDefined();
    expect(upperDieMesh(scene)).toBeDefined();
    expect(seamMesh(scene)).toBeDefined();
    expect(ramMesh(scene)).toBeDefined();
    expect(ramCollarMesh(scene)).toBeDefined();
    expect(headerMesh(scene)).toBeDefined();
    expect(legMesh(scene)).toBeDefined();
    expect(legCapMesh(scene)).toBeDefined();
    expect(feedMesh(scene)).toBeDefined();
    expect(feedCheekMesh(scene)).toBeDefined();
    expect(couplingMesh(scene)).toBeDefined();
    expect(couplingRingMesh(scene)).toBeDefined();
    expect(couplingTipMesh(scene)).toBeDefined();
  });

  it("caps a low rounded pod with the armored lower platen, not a gap", () => {
    // MAIN_READ: the giant press is INTEGRATED into the module body — the broad
    // lower armor-bed platen sits across the pod's crown, sealed (they overlap
    // slightly) rather than floating free as a separate machine.
    const { scene } = build();
    const podTop = bounds(podMesh(scene)!).maxY;
    const dieBottom = translation(lowerDieMesh(scene)!, 0).y - (BMD_LOWER_DIE.h * S) / 2;
    expect(podTop).toBeCloseTo(BMD_POD_CROWN * S, 3);
    expect(dieBottom).toBeLessThan(podTop);
    expect(podTop - dieBottom).toBeLessThan(0.012);
  });

  it("bites a narrow gap between the two platen slabs, a heat seam shard mid-bite", () => {
    // MAIN_READ: the press bites TIGHT — the opposing platens leave a 0.016
    // local gap (0.021 world) between them, and the thin orange seam is a sliver
    // that sits exactly mid-bite and stays INSIDE the bite footprint (narrower
    // than the platens in every direction), never a separate block of hot metal.
    const { scene } = build();
    const upperBottom = translation(upperDieMesh(scene)!, 0).y - (BMD_UPPER_DIE.h * S) / 2;
    const lowerTop = translation(lowerDieMesh(scene)!, 0).y + (BMD_LOWER_DIE.h * S) / 2;
    expect(upperBottom - lowerTop).toBeCloseTo(BMD_GAP * S, 6);
    expect(translation(seamMesh(scene)!, 0).y).toBeCloseTo(BMD_SEAM.y * S, 6);
    expect(BMD_SEAM.h).toBeLessThan(BMD_UPPER_DIE.h);
    expect(BMD_UPPER_DIE.h).toBeLessThan(BMD_LOWER_DIE.h);
    expect(BMD_SEAM.w).toBeLessThan(BMD_LOWER_DIE.w);
    expect(BMD_SEAM.d).toBeLessThan(BMD_LOWER_DIE.d);
  });

  it("hangs the upper die directly beneath the oversized hydraulic ram", () => {
    // The upper platen is the ram's load: its top meets the ram's bottom dead on,
    // and nothing else rises into the ram — the seam and the lower platen stay
    // well clear of the ram body.
    const { scene } = build();
    const ramBottom = translation(ramMesh(scene)!, 0).y - (BMD_RAM.length * S) / 2;
    const dieTop = translation(upperDieMesh(scene)!, 0).y + (BMD_UPPER_DIE.h * S) / 2;
    expect(ramBottom).toBeCloseTo(dieTop, 6);
    const seamTop = translation(seamMesh(scene)!, 0).y + (BMD_SEAM.h * S) / 2;
    const lowerTop = translation(lowerDieMesh(scene)!, 0).y + (BMD_LOWER_DIE.h * S) / 2;
    expect(ramBottom - seamTop).toBeGreaterThan(0.02);
    expect(ramBottom - lowerTop).toBeGreaterThan(0.03);
  });

  it("drives one oversized ram through a brass collar under a heavy crown header", () => {
    // MAIN_READ: the header is the towering crown of the press. It rides the ram
    // top dead-on (header bottom == ram top), and a brass collar bands the ram
    // where it meets the header — between the two, and fatter than the ram.
    const { scene } = build();
    const headerBottom = translation(headerMesh(scene)!, 0).y - (BMD_HEADER.h * S) / 2;
    const ramTop = translation(ramMesh(scene)!, 0).y + (BMD_RAM.length * S) / 2;
    expect(headerBottom).toBeCloseTo(ramTop, 6);
    const collarY = translation(ramCollarMesh(scene)!, 0).y;
    expect(collarY).toBeGreaterThan(translation(ramMesh(scene)!, 0).y);
    expect(collarY).toBeLessThan(translation(headerMesh(scene)!, 0).y);
    // The collar is a fat band: its tube radius ring is wider than the ram whose
    // top it wraps.
    expect(BMD_RAM_COLLAR.radius).toBeGreaterThan(BMD_RAM.radius);
  });

  it("straddles the press with two hydraulic legs and brass caps", () => {
    const { scene } = build();
    const legs = legMesh(scene)!;
    const caps = legCapMesh(scene)!;
    expect(legs.count).toBe(2);
    expect(caps.count).toBe(2);
    const legZs = [0, 1].map((i) => translation(legs, i).z).sort((a, b) => a - b);
    expect(legZs[0]!).toBeCloseTo(-BMD_LEG.z * S, 6);
    expect(legZs[1]!).toBeCloseTo(BMD_LEG.z * S, 6);
    for (const i of [0, 1]) {
      // Both legs hug the press centre line along the socket direction and rise
      // to the same height.
      expect(Math.abs(translation(legs, i).x)).toBeLessThan(0.005);
      expect(translation(legs, i).y).toBeCloseTo(BMD_LEG.center * S, 6);
      const capT = translation(caps, i);
      expect(capT.z).toBeCloseTo(translation(legs, i).z, 6);
      expect(capT.y).toBeCloseTo(BMD_LEG_CAP.y * S, 6);
    }
  });

  it("rises each leg up into the header — the frame carries the crown", () => {
    const { scene } = build();
    const legs = legMesh(scene)!;
    for (const i of [0, 1]) {
      const top = translation(legs, i).y + (BMD_LEG.length * S) / 2;
      const bottom = translation(legs, i).y - (BMD_LEG.length * S) / 2;
      const headerBottom = translation(headerMesh(scene)!, 0).y - (BMD_HEADER.h * S) / 2;
      expect(top).toBeCloseTo(headerBottom, 6);
      expect(bottom).toBeLessThan(headerBottom - 0.09);
    }
  });

  it("rides one reinforced feed tray on the lower bulk of the die stack", () => {
    // MAIN_READ: the reinforced feed tray is a purpose-built blank intake at the
    // MOUTH of the press — its base seals to the top of the lower platen and its
    // crown peaks right at the heat seam's height, feeding raw blanks straight
    // into the bite from the side.
    const { scene } = build();
    const feedT = translation(feedMesh(scene)!, 0);
    const lowerTop = translation(lowerDieMesh(scene)!, 0).y + (BMD_LOWER_DIE.h * S) / 2;
    const feedBottom = feedT.y - (BMD_FEED.h * S) / 2;
    expect(feedBottom).toBeCloseTo(lowerTop, 6);
    const feedTop = feedT.y + (BMD_FEED.h * S) / 2;
    const seamY = translation(seamMesh(scene)!, 0).y;
    expect(feedTop - seamY).toBeLessThan(0.005);
  });

  it("faces the feed tray FORWARD (+X) along the socket", () => {
    const { scene } = build();
    const feedT = translation(feedMesh(scene)!, 0);
    expect(feedT.x).toBeGreaterThan(0.05 * S);
    expect(Math.abs(feedT.z)).toBeLessThan(0.001);
  });

  it("flanks the feed tray with two brass cheeks", () => {
    const { scene } = build();
    const cheeks = feedCheekMesh(scene)!;
    expect(cheeks.count).toBe(2);
    const cheekXs = [0, 1].map((i) => translation(cheeks, i).x);
    const cheekZs = [0, 1].map((i) => translation(cheeks, i).z);
    expect(cheekXs[0]!).toBeCloseTo(cheekXs[1]!, 6);
    expect(Math.abs(cheekZs[0]!)).toBeCloseTo(BMD_FEED_CHEEK.z * S, 6);
    expect(Math.abs(cheekZs[1]!)).toBeCloseTo(BMD_FEED_CHEEK.z * S, 6);
    // One cheek on each flank of the tray.
    expect(cheekZs[0]! * cheekZs[1]!).toBeLessThan(0);
    expect(Math.abs(cheekXs[0]! - translation(feedMesh(scene)!, 0).x)).toBeLessThan(0.005);
  });

  it("carries one heavy rear AFC connector with a brass ring and cyan contact tip", () => {
    // The connector stack runs REARWARD in line: the heavy steel stub bands with
    // a brass collar ring near its front, and the cyan contact tip hangs past the
    // stub's rear end.
    const { scene } = build();
    expect(couplingMesh(scene)!.count).toBe(1);
    expect(couplingRingMesh(scene)!.count).toBe(1);
    expect(couplingTipMesh(scene)!.count).toBe(1);
    const stubRear = translation(couplingMesh(scene)!, 0).x - (0.05 * S) / 2;
    expect(translation(couplingTipMesh(scene)!, 0).x).toBeLessThan(stubRear);
    expect(stubRear).toBeLessThan(translation(couplingRingMesh(scene)!, 0).x);
    expect(translation(couplingRingMesh(scene)!, 0).x).toBeLessThan(0);
    const tipMaterial = materialOf(couplingTipMesh(scene)!);
    expect(tipMaterial.emissive.b).toBeGreaterThan(tipMaterial.emissive.r);
  });

  it("uses armor-grade titanium steel for the die bed and ram frame, brass only for fittings", () => {
    // The dies and the feed tray are tooled from the same light titanium-grey
    // armor steel, while the press frame (ram, header, legs) is the dark steel of
    // the ring and every decorative fitting is aged brass.
    const { scene } = build();
    const dieMaterial = materialOf(lowerDieMesh(scene)!);
    expect(dieMaterial).toBe(materialOf(upperDieMesh(scene)!));
    expect(dieMaterial).toBe(materialOf(feedMesh(scene)!));
    // The armour steel reads as a visibly light titanium-grey (linear-space g is
    // well above the dark iron/steel family), so the press block pops off the pod.
    expect(dieMaterial.color.g).toBeGreaterThan(0.25);
    expect(materialOf(ramMesh(scene)!).metalness).toBeGreaterThan(0.4);
    expect(materialOf(ramCollarMesh(scene)!)).toBe(materialOf(legCapMesh(scene)!));
    expect(materialOf(ramCollarMesh(scene)!).metalness).toBeGreaterThan(0.7);
  });
});

describe("bastion master die module envelope", () => {
  it("sits on the pad top rather than sinking through it", () => {
    const { scene } = build();
    expect(envelope(scene).minY).toBeGreaterThanOrEqual(-0.01);
    expect(bounds(baseMesh(scene)!).minY).toBeCloseTo(0, 4);
  });

  it("stays inside the module height cap, its tallest point the press header", () => {
    const { scene } = build();
    const MODULE_HEIGHT_CAP = 0.34;
    const env = envelope(scene);
    expect(env.maxY).toBeLessThanOrEqual(MODULE_HEIGHT_CAP);
    // The stamping press reads as a giant crown over a low pod: it clears the
    // 0.3 floor and lifts the header's top clear of the crown by a real margin.
    expect(env.maxY).toBeGreaterThan(0.3);
    expect(env.maxY).toBeGreaterThan(BMD_POD_CROWN * S + 0.1);
    expect(env.maxY).toBeCloseTo(BMD_TOWER_TOP * S, 4);
  });

  it("publishes its height as the top of the press header", () => {
    const { scene } = build();
    const env = envelope(scene);
    const published = BASTION_MASTER_DIE_MODULE_HEIGHT;
    expect(published).toBeGreaterThanOrEqual(env.maxY - 1e-9);
    expect(published).toBeCloseTo(BMD_TOWER_TOP * S, 6);
  });

  it("keeps the widest elevated part inside the AFC bay, its width the header", () => {
    const { scene } = build();
    // The shared seat lip deliberately overhangs the bay, exactly as on every
    // other family, so it is skipped by parameter and checked on its own below.
    for (const mesh of instancedMeshes(scene)) {
      if (params(mesh).type === "TorusGeometry" && (params(mesh).parameters as { radius: number }).radius === 0.12) continue;
      expect(bounds(mesh).maxRadius).toBeLessThan(AFC_BAY_INNER_RADIUS);
    }
    // The crown header's corners are the widest elevated points of the press —
    // broader than the legs and the feed, but still inside the bay.
    const header = headerMesh(scene)!;
    expect(bounds(header).maxRadius).toBeLessThan(AFC_BAY_INNER_RADIUS);
    expect(bounds(header).maxRadius).toBeGreaterThan(0.09);
    expect(bounds(header).maxRadius).toBeGreaterThan(bounds(legMesh(scene)!).maxRadius);
    expect(bounds(header).maxRadius).toBeGreaterThan(bounds(feedMesh(scene)!).maxRadius);
  });

  it("docks on the same circular seat as the rest of the ring", () => {
    const { scene } = build();
    expect(bounds(baseMesh(scene)!).maxRadius).toBeCloseTo(0.105 * S, 6);
    expect(BASTION_MASTER_DIE_BASE_RADIUS).toBeLessThan(AFC_BAY_INNER_RADIUS);
  });
});

describe("bastion master die module palette", () => {
  it("keeps the family heat restrained to one orange seam and one cyan link tip", () => {
    // The master-die glow budget is strict: exactly the feeding rose-glow seam in
    // the press bite (banded 0.4..0.9) and exactly the cyan AFC tip (unity).
    // Nothing else in the family emits — no hot-metal slabs, no pulsing core.
    // (Default emissiveIntensity is 1 with a BLACK emissive, so the presence of
    // a lit material is decided by the emissive colour, not the intensity.)
    const { scene } = build();
    const lit: { intensity: number; isCyan?: boolean }[] = [];
    for (const mesh of instancedMeshes(scene)) {
      const m = materialOf(mesh);
      if (m.emissive.r > 0 || m.emissive.g > 0 || m.emissive.b > 0) lit.push({ intensity: m.emissiveIntensity, isCyan: m.emissive.b > m.emissive.r });
    }
    expect(lit.length).toBe(2);
    const seamMaterial = materialOf(seamMesh(scene)!);
    expect(seamMaterial.emissiveIntensity).toBeGreaterThan(0.4);
    expect(seamMaterial.emissiveIntensity).toBeLessThan(0.9);
    expect(seamMaterial.emissive.r).toBeGreaterThan(seamMaterial.emissive.b);
    const tipMaterial = materialOf(couplingTipMesh(scene)!);
    expect(tipMaterial.emissiveIntensity).toBeCloseTo(1, 6);
    expect(tipMaterial.emissive.b).toBeGreaterThan(tipMaterial.emissive.r);
    // No individual emissive ever exceeds the safe ceiling.
    for (const mesh of instancedMeshes(scene)) expect(materialOf(mesh).emissiveIntensity).toBeLessThan(1.1);
  });
});

describe("bastion master die module lifecycle", () => {
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
    // A static family: the press mass-produces armor from its silhouette, and
    // nothing stamps on the clock. Any drift over a long render window is a bug.
    const { scene, overlay } = build(2);
    const before = instancedMeshes(scene).map((mesh) => mesh.instanceMatrix.array.slice());
    overlay.update(4000);
    const after = instancedMeshes(scene).map((mesh) => mesh.instanceMatrix.array.slice());
    expect(after).toEqual(before);
  });
});

describe("bastion master die module docking", () => {
  it("spaces instances apart on the socket ring, yaws each about its own dock point", () => {
    const { scene } = build(2);
    const pod = podMesh(scene)!;
    expect(pod.count).toBe(2);
    const a = translation(pod, 0);
    const b = translation(pod, 1);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(0.5, 6);
    // The pod's origin is the module's dock point: yaw it hard and the pod must
    // stay exactly on the socket, not swing around the world origin.
    const yawed = new Scene();
    const overlay = createBastionMasterDieModuleOverlay(yawed, 1);
    overlay.addInstance(3, -2, 0, 1.1, 0, 0);
    overlay.commit();
    const yawedPod = translation(podMesh(yawed)!, 0);
    expect(yawedPod.x).toBeCloseTo(3, 6);
    expect(yawedPod.z).toBeCloseTo(-2, 6);
  });

  it("docks on the real AFC socket ring without swinging off its socket", () => {
    const afcScene = new Scene();
    const afc = createFabricationComplexOverlay(afcScene, 1);
    const afcIndex = afc.addInstance(0, 0, 0, 4, 0);
    afc.commit();
    const attachment = afc.moduleSocketAttachments(afcIndex)[3]!;

    const scene = new Scene();
    const overlay = createBastionMasterDieModuleOverlay(scene, 1);
    overlay.addInstance(attachment.x, attachment.z, attachment.y, attachment.yaw, 0, 0);
    overlay.commit();

    // The pod's own origin is the socket point — not the world origin pulled
    // through the yaw.
    const podOrigin = translation(podMesh(scene)!, 0);
    expect(Math.hypot(podOrigin.x, podOrigin.z)).toBeCloseTo(Math.hypot(attachment.x, attachment.z), 5);
    // The module runs outward down the socket: the feed tray rides further from
    // the AFC core than the pod, and the rear coupling hangs closer to it.
    const feedOrigin = translation(feedMesh(scene)!, 0);
    const couplingOrigin = translation(couplingMesh(scene)!, 0);
    expect(Math.hypot(feedOrigin.x, feedOrigin.z)).toBeGreaterThan(Math.hypot(podOrigin.x, podOrigin.z) + 0.05);
    expect(Math.hypot(couplingOrigin.x, couplingOrigin.z)).toBeLessThan(Math.hypot(podOrigin.x, podOrigin.z) - 0.05);
  });
});
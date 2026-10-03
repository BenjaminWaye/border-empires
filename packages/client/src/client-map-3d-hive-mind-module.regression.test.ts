// Regression tests for the Hive Mind (HMM) AFC module overlay.
//
// These pin the things that are easy to break by accident and invisible in a
// screenshot: that the family really is ONE distributed command network — one
// large faceted dark command orb braced in a heavy three-claw brass frame, three
// relay nodes evenly spaced around it at 120°, each piped into the orb by a
// thick rigid conduit and marked with a cyan signal light facing outward (a
// coordinator receiving battlefield information from multiple sources and
// radiating command back out, deliberately distinct from generic artificial
// intelligence or power generation) — that a slim brass scan ring precesses
// slowly around the orb (the family's one moving part) — and that the whole
// assembly stays inside the shared bay.

import { describe, expect, it } from "vitest";
import { Matrix4, Quaternion, Scene, Vector3 } from "three";
import {
  HIVE_MIND_BASE_RADIUS,
  HIVE_MIND_MODULE_HEIGHT,
  HIVE_MIND_SCALE as S,
  createHiveMindModuleOverlay
} from "./client-map-3d-hive-mind-module.js";
import {
  HMM_CONDUIT,
  HMM_CORE,
  HMM_CRADLE,
  HMM_POD_CROWN,
  HMM_RELAY,
  HMM_RELAY_AZIMUTHS,
  HMM_SENSOR_RING,
  HMM_SENSOR_RING_SPEED_MS,
  HMM_SENSOR_RING_START_ROLL,
  HMM_SIGNAL_LIGHT,
  HMM_TOWER_TOP
} from "./client-map-3d-hive-mind-parts.js";
import { AFC_BAY_INNER_RADIUS, createFabricationComplexOverlay } from "./client-map-3d-fabrication-complex.js";
import {
  baseMesh,
  bounds,
  clawMesh,
  conduitMesh,
  coreMesh,
  couplingMesh,
  couplingRingMesh,
  couplingTipMesh,
  envelope,
  instancedMeshes,
  lightMesh,
  materialOf,
  matrixAt,
  params,
  podMesh,
  relayMesh,
  sensorRingMesh,
  translation,
  zAxisColumn
} from "./client-map-3d-hive-mind-inspect.js";

const build = (instances = 1): { scene: Scene; overlay: ReturnType<typeof createHiveMindModuleOverlay> } => {
  const scene = new Scene();
  const overlay = createHiveMindModuleOverlay(scene, instances);
  for (let i = 0; i < instances; i += 1) overlay.addInstance(i * 0.5, 0, 0, 0, 0, 0);
  overlay.commit();
  return { scene, overlay };
};

describe("hive mind module construction", () => {
  it("builds every part of the silhouette: seat, pod, orb, claws, scan ring, relays, conduits, lights, coupling", () => {
    const { scene } = build();
    expect(podMesh(scene)).toBeDefined();
    expect(baseMesh(scene)).toBeDefined();
    expect(coreMesh(scene)).toBeDefined();
    expect(clawMesh(scene)).toBeDefined();
    expect(sensorRingMesh(scene)).toBeDefined();
    expect(relayMesh(scene)).toBeDefined();
    expect(conduitMesh(scene)).toBeDefined();
    expect(lightMesh(scene)).toBeDefined();
    expect(couplingMesh(scene)).toBeDefined();
    expect(couplingRingMesh(scene)).toBeDefined();
    expect(couplingTipMesh(scene)).toBeDefined();
  });

  it("mounts ONE large faceted command orb above the pod crown — the module's tallest point", () => {
    // MAIN_READ: the command node is THE piece that matters — a single dark
    // low-poly faceted orb floating over the pod, capped as the tallest thing on
    // the module so the coordination reads first at strategy-game distance.
    const { scene } = build();
    expect(coreMesh(scene)!.count).toBe(1);
    const t = translation(coreMesh(scene)!, 0);
    expect(t.x).toBeCloseTo(0, 6);
    expect(t.z).toBeCloseTo(0, 6);
    expect(t.y).toBeCloseTo(HMM_CORE.y * S, 6);
    // A low-poly faceted ball, not a smooth data orb: 20 flat dark faces.
    const coreGeo = params(coreMesh(scene)!);
    expect(coreGeo.type).toBe("IcosahedronGeometry");
    expect(coreGeo.parameters.detail).toBe(0);
    // The orb clears the pod's crown by a real margin.
    expect(bounds(coreMesh(scene)!).minY).toBeGreaterThan(HMM_POD_CROWN * S + 0.01);
    // And its crown tops the whole module.
    expect(bounds(coreMesh(scene)!).maxY).toBeCloseTo(HMM_TOWER_TOP * S, 4);
    expect(bounds(coreMesh(scene)!).maxY).toBeLessThan(0.34);
  });

  it("braces the orb in a heavy brass support frame of three claws gripping from outside", () => {
    const { scene } = build();
    const claws = clawMesh(scene)!;
    expect(claws.count).toBe(3);
    // Three claws: symmetric and distinct (a frame, not one ring).
    expect(matrixAt(claws, 0)).not.toEqual(matrixAt(claws, 1));
    expect(matrixAt(claws, 1)).not.toEqual(matrixAt(claws, 2));
    // Each claw is a horizontal band run around the module's vertical axis.
    for (const i of [0, 1, 2]) {
      const hole = zAxisColumn(claws, i);
      expect(Math.abs(hole.y)).toBeGreaterThan(Math.abs(hole.x) * 5);
      expect(Math.abs(hole.y)).toBeGreaterThan(Math.abs(hole.z) * 5);
    }
    // Heavy brass.
    expect(materialOf(claws).metalness).toBeGreaterThan(0.7);
  });

  it("holds three relay nodes evenly spaced at 120° around the orb — the multi-source inputs", () => {
    const { scene } = build();
    const relays = relayMesh(scene)!;
    expect(relays.count).toBe(3);
    const angles = [0, 1, 2]
      .map((i) => translation(relays, i))
      .map((t) => Math.atan2(t.z, t.x))
      .sort((a, b) => a - b);
    expect(angles[1]! - angles[0]!).toBeCloseTo((Math.PI * 2) / 3, 3);
    expect(angles[2]! - angles[1]!).toBeCloseTo((Math.PI * 2) / 3, 3);
    expect(angles[0]! + Math.PI * 2 - angles[2]!).toBeCloseTo((Math.PI * 2) / 3, 3);
    for (const i of [0, 1, 2]) {
      const t = translation(relays, i);
      expect(Math.hypot(t.x, t.z)).toBeCloseTo(HMM_RELAY.radius * S, 6);
      expect(t.y).toBeCloseTo(HMM_RELAY.y * S, 6);
    }
  });

  it("pipes each relay into the orb with a thick rigid conduit, sealed end to end", () => {
    const { scene } = build();
    const conduits = conduitMesh(scene)!;
    expect(conduits.count).toBe(3);
    // Thick, not wire: a slab a third the relay node's own diameter wide.
    expect(params(conduits).parameters.height).toBeCloseTo(HMM_CONDUIT.thickness, 6);
    expect(HMM_CONDUIT.thickness).toBeGreaterThanOrEqual(0.008);
    for (const i of [0, 1, 2]) {
      // Each conduit rides out along its relay's own azimuth.
      const c = translation(conduits, i);
      const r = translation(relayMesh(scene)!, i);
      expect(Math.atan2(c.z, c.x)).toBeCloseTo(Math.atan2(r.z, r.x), 4);
      // Sealed: the conduit's outer face lands on the relay's inner face.
      const conduitOuter = Math.hypot(c.x, c.z) + (HMM_CONDUIT.len * S) / 2;
      const relayInner = HMM_RELAY.radius * S - HMM_RELAY.r * S;
      expect(Math.abs(conduitOuter - relayInner)).toBeLessThan(0.003);
      // And the inner face reaches INTO the orb's own body — the line visibly
      // joins the node, not floating clear of it.
      const conduitInner = Math.hypot(c.x, c.z) - (HMM_CONDUIT.len * S) / 2;
      expect(conduitInner).toBeLessThan(bounds(coreMesh(scene)!).maxRadius + 0.004);
    }
  });

  it("marks each relay with a restrained cyan signal light facing outward", () => {
    const { scene } = build();
    const lights = lightMesh(scene)!;
    expect(lights.count).toBe(3);
    for (const i of [0, 1, 2]) {
      const l = translation(lights, i);
      const r = translation(relayMesh(scene)!, i);
      // On the relay's own azimuth, proud of its outer face.
      expect(Math.atan2(l.z, l.x)).toBeCloseTo(Math.atan2(r.z, r.x), 4);
      expect(l.y).toBeCloseTo(r.y, 6);
      expect(Math.hypot(l.x, l.z)).toBeGreaterThan(Math.hypot(r.x, r.z));
      expect(Math.hypot(l.x, l.z)).toBeCloseTo(HMM_SIGNAL_LIGHT.radius * S, 6);
    }
    // The restrained cyan command-glow, not white or violet.
    const mat = materialOf(lights);
    expect(mat.emissive.b).toBeGreaterThan(mat.emissive.g);
    expect(mat.emissive.g).toBeGreaterThan(mat.emissive.r);
    expect(mat.emissiveIntensity).toBeLessThanOrEqual(1);
  });

  it("keeps the relay ring clear of the pod, riding up into the orb's own height", () => {
    const { scene } = build();
    // The relays stand well above the pod's crown — no horizontal clipping.
    expect(bounds(relayMesh(scene)!).minY).toBeGreaterThan(HMM_POD_CROWN * S + 0.02);
    // And their tops climb into the orb's height, so the conduits read as
    // wiring them straight into the node rather than dangling below it.
    expect(bounds(relayMesh(scene)!).maxY).toBeLessThan(bounds(coreMesh(scene)!).maxY);
  });

  it("spins the slim scan ring around the orb, clearing the orb inside and the claws outside", () => {
    const { scene } = build();
    const ring = sensorRingMesh(scene)!;
    expect(ring.count).toBe(1);
    // Tilted out of the horizontal, not a flat band lying around the orb.
    const b = bounds(ring);
    expect(b.maxY - (HMM_SENSOR_RING.y + b.maxRadius) * S).toBeLessThan(-0.01);
    // Clear of the orb's surface: the ring's inner edge stays outside the orb.
    expect(bounds(coreMesh(scene)!).maxRadius).toBeLessThan((HMM_SENSOR_RING.radius - HMM_SENSOR_RING.tube) * S - 0.002);
    // Clear of the claw frame: the ring precesses inside the claw inner edge.
    expect(b.maxRadius).toBeLessThan((HMM_CRADLE.radius - HMM_CRADLE.tube) * S - 0.002);
    // The ring rides the orb's own height above the pod.
    expect(bounds(ring).minY).toBeGreaterThan(HMM_POD_CROWN * S + 0.02);
  });
});

describe("hive mind module envelope", () => {
  it("sits on the pad top rather than sinking through it", () => {
    const { scene } = build();
    expect(envelope(scene).minY).toBeGreaterThanOrEqual(-0.01);
    expect(bounds(baseMesh(scene)!).minY).toBeCloseTo(0, 4);
  });

  it("stays inside the module height cap, its tallest point the command orb's crown", () => {
    const { scene } = build();
    const MODULE_HEIGHT_CAP = 0.34;
    const env = envelope(scene);
    expect(env.maxY).toBeLessThanOrEqual(MODULE_HEIGHT_CAP);
    // The command network reads as a tall coordinator over a low pod: it clears
    // the 0.3 floor and the orb towers clear of the scan ring and claw frame.
    expect(env.maxY).toBeGreaterThan(0.3);
    expect(env.maxY).toBeGreaterThan(HMM_POD_CROWN * S + 0.1);
    expect(env.maxY).toBeCloseTo(HMM_TOWER_TOP * S, 4);
    expect(env.maxY).toBeGreaterThan(bounds(sensorRingMesh(scene)!).maxY);
    expect(env.maxY).toBeGreaterThan(bounds(clawMesh(scene)!).maxY);
  });

  it("publishes its height as the crown of the command orb", () => {
    const { scene } = build();
    const env = envelope(scene);
    const published = HIVE_MIND_MODULE_HEIGHT;
    expect(published).toBeGreaterThanOrEqual(env.maxY - 1e-9);
    expect(published).toBeCloseTo(HMM_TOWER_TOP * S, 6);
  });

  it("keeps the widest elevated part inside the AFC bay, its width the signal lights", () => {
    const { scene } = build();
    // The shared seat lip deliberately overhangs the bay, exactly as on every
    // other family, so it is skipped by parameter and checked on its own below.
    for (const mesh of instancedMeshes(scene)) {
      if (params(mesh).type === "TorusGeometry" && (params(mesh).parameters as { radius: number }).radius === 0.12) continue;
      expect(bounds(mesh).maxRadius).toBeLessThan(AFC_BAY_INNER_RADIUS);
    }
    // The outward cyan signal lights are the widest elevated point — past the
    // relays, the claw frame and the orb — but still under the bay: their outer
    // faces read 0.102 local off-axis (corner-bulge included) and the bay inner
    // radius is 0.14 world.
    expect(bounds(lightMesh(scene)!).maxRadius).toBeGreaterThan(0.135);
    expect(bounds(lightMesh(scene)!).maxRadius).toBeLessThan(AFC_BAY_INNER_RADIUS);
    expect(bounds(lightMesh(scene)!).maxRadius).toBeGreaterThan(bounds(relayMesh(scene)!).maxRadius);
    expect(bounds(relayMesh(scene)!).maxRadius).toBeGreaterThan(bounds(clawMesh(scene)!).maxRadius);
    expect(bounds(clawMesh(scene)!).maxRadius).toBeGreaterThan(bounds(coreMesh(scene)!).maxRadius);
  });

  it("docks on the same circular seat as the rest of the ring", () => {
    const { scene } = build();
    expect(bounds(baseMesh(scene)!).maxRadius).toBeCloseTo(0.105 * S, 6);
    expect(HIVE_MIND_BASE_RADIUS).toBeLessThan(AFC_BAY_INNER_RADIUS);
  });
});

describe("hive mind module palette", () => {
  it("keeps the glow cyan and restrained to the signal lights plus the AFC tip", () => {
    // The command-glow budget is strict: only the three relay signal lights and
    // the cyan AFC contact tip emit — no glowing orb, no lit conduits. (Default
    // emissiveIntensity is 1 with a BLACK emissive, so the presence of a lit
    // material is decided by the emissive colour, not the intensity.)
    const { scene } = build();
    const lit: { isCyan: boolean }[] = [];
    for (const mesh of instancedMeshes(scene)) {
      const m = materialOf(mesh);
      if (m.emissive.r > 0 || m.emissive.g > 0 || m.emissive.b > 0) lit.push({ isCyan: m.emissive.b > m.emissive.r });
    }
    expect(lit.length).toBe(2);
    expect(lit.every((entry) => entry.isCyan)).toBe(true);
    for (const mesh of instancedMeshes(scene)) expect(materialOf(mesh).emissiveIntensity).toBeLessThan(1.1);
  });
});

describe("hive mind module lifecycle", () => {
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
});

describe("hive mind module scan-ring animation", () => {
  it("precesses the slim brass scan ring around the orb and holds everything else still", () => {
    const { scene, overlay } = build(2);
    const ringBefore = [0, 1].map((i) => matrixAt(sensorRingMesh(scene)!, i));
    const podBefore = [0, 1].map((i) => matrixAt(podMesh(scene)!, i));
    const clawBefore = [0, 1, 2].map((i) => matrixAt(clawMesh(scene)!, i));
    overlay.update(5000);
    const ringAfter = [0, 1].map((i) => matrixAt(sensorRingMesh(scene)!, i));
    expect(ringAfter).not.toEqual(ringBefore);
    // Only the ring moves: the pods and claws stay exactly as emitted.
    expect([0, 1].map((i) => matrixAt(podMesh(scene)!, i))).toEqual(podBefore);
    expect([0, 1, 2].map((i) => matrixAt(clawMesh(scene)!, i))).toEqual(clawBefore);
  });

  it("keeps the whole family's part counts stable across updates", () => {
    const { scene, overlay } = build(2);
    const countsBefore = instancedMeshes(scene).map((mesh) => mesh.count);
    overlay.update(1000);
    overlay.update(2000);
    expect(sensorRingMesh(scene)!.count).toBe(2);
    expect(instancedMeshes(scene).map((mesh) => mesh.count)).toEqual(countsBefore);
  });

  it("advances deterministically with the clock: same time re-renders identically, later time differs", () => {
    const { scene, overlay } = build(1);
    overlay.update(1200);
    const at = matrixAt(sensorRingMesh(scene)!, 0);
    overlay.update(1200);
    expect(matrixAt(sensorRingMesh(scene)!, 0)).toEqual(at);
    overlay.update(4800);
    expect(matrixAt(sensorRingMesh(scene)!, 0)).not.toEqual(at);
  });

  it("rides a real precession about the module's vertical axis, not a static tilt", () => {
    // The ring spins around the orb: its orientation at any time is exactly the
    // composed precession — qRoll(now)·qTilt·qHoleUp — re-derived here from the
    // same constants. A static tilt or a flat band would never match.
    const { scene, overlay } = build(1);
    const nowMs = 3333;
    overlay.update(nowMs);
    const roll = HMM_SENSOR_RING_START_ROLL + nowMs * HMM_SENSOR_RING_SPEED_MS;
    const qHoleUp = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(0, 1, 0));
    const qTilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), HMM_SENSOR_RING.tilt);
    const qRoll = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), roll);
    const q = qRoll.clone().multiply(qTilt).multiply(qHoleUp);
    const expected = new Matrix4().compose(new Vector3(0, HMM_SENSOR_RING.y * S, 0), q, new Vector3(S, S, S)).elements;
    const actual = matrixAt(sensorRingMesh(scene)!, 0);
    for (let i = 0; i < 16; i += 1) expect(actual[i]).toBeCloseTo(expected[i]!, 4);
  });
});

describe("hive mind module docking", () => {
  it("spaces instances apart on the socket ring, yaws each about its own dock point", () => {
    const { scene } = build(2);
    const pod = podMesh(scene)!;
    expect(pod.count).toBe(2);
    const a = translation(pod, 0);
    const b = translation(pod, 1);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(0.5, 6);
    // The pod's origin is the module's dock point: yaw it hard and the orb must
    // stay exactly on the socket, not swing around the world origin.
    const yawed = new Scene();
    const overlay = createHiveMindModuleOverlay(yawed, 1);
    overlay.addInstance(3, -2, 0, 1.1, 0, 0);
    overlay.commit();
    const yawedPod = translation(podMesh(yawed)!, 0);
    expect(yawedPod.x).toBeCloseTo(3, 6);
    expect(yawedPod.z).toBeCloseTo(-2, 6);
  });

  it("docks on the real AFC socket ring with the command network running outward", () => {
    const afcScene = new Scene();
    const afc = createFabricationComplexOverlay(afcScene, 1);
    const afcIndex = afc.addInstance(0, 0, 0, 4, 0);
    afc.commit();
    const attachment = afc.moduleSocketAttachments(afcIndex)[3]!;

    const scene = new Scene();
    const overlay = createHiveMindModuleOverlay(scene, 1);
    overlay.addInstance(attachment.x, attachment.z, attachment.y, attachment.yaw, 0, 0);
    overlay.commit();

    // The pod's own origin is the socket point — not the world origin pulled
    // through the yaw.
    const podOrigin = translation(podMesh(scene)!, 0);
    const podDist = Math.hypot(podOrigin.x, podOrigin.z);
    expect(podDist).toBeCloseTo(Math.hypot(attachment.x, attachment.z), 5);
    // The network runs outward down the socket: the forward-facing signal light
    // rides further from the AFC core than the pod, the cross relays hang
    // closer, and the rear coupling hangs closest of all.
    const lightRadii = [0, 1, 2].map((i) => Math.hypot(translation(lightMesh(scene)!, i).x, translation(lightMesh(scene)!, i).z));
    expect(Math.max(...lightRadii)).toBeGreaterThan(podDist + 0.03);
    expect(Math.min(...lightRadii)).toBeLessThan(podDist - 0.03);
    const couplingOrigin = translation(couplingMesh(scene)!, 0);
    expect(Math.hypot(couplingOrigin.x, couplingOrigin.z)).toBeLessThan(podDist - 0.05);
  });
});
// Regression tests for the Hive Mind II (HMM2) AFC module overlay.
//
// These pin the things that are easy to break by accident and invisible in a
// screenshot: that the family really is TWO coordinated command minds — one
// paired command assembly of two identical faceted dark-steel cores standing
// side by side above the pod inside a shared brass gimbal frame, linked by a
// thick synchronization bridge with a cyan pulse sliding along it — that a
// broad flat brass signal ring girdles the pair with three orbiting teeth
// making its rotation legible (the family's moving parts) — that four relay
// nodes sit symmetrically at the 45° diagonals, each piped into its own nearest
// core by a short rigid conduit and marked with a cyan signal light facing
// outward (a coordinator receiving battlefield information and radiating
// command back out, deliberately distinct from generic artificial intelligence
// or power generation) — and that the whole assembly stays inside the shared
// bay.

import { describe, expect, it } from "vitest";
import { Scene, Vector3 } from "three";
import {
  HIVE_MIND_II_BASE_RADIUS,
  HIVE_MIND_II_MODULE_HEIGHT,
  HIVE_MIND_II_SCALE as S,
  createHiveMindIiModuleOverlay
} from "./client-map-3d-hive-mind-ii-module.js";
import {
  HMM2_BRIDGE,
  HMM2_CONDUIT,
  HMM2_CORE,
  HMM2_GIMBAL,
  HMM2_GIMBAL_SPINE,
  HMM2_POD_CROWN,
  HMM2_RELAY,
  HMM2_RELAY_AZIMUTHS,
  HMM2_RING,
  HMM2_SIGNAL_LIGHT,
  HMM2_TOOTH,
  HMM2_TOWER_TOP,
  HMM2_TWIN
} from "./client-map-3d-hive-mind-ii-parts.js";
import { AFC_BAY_INNER_RADIUS, createFabricationComplexOverlay } from "./client-map-3d-fabrication-complex.js";
import {
  baseMesh,
  bounds,
  bridgeMesh,
  conduitMesh,
  coreMesh,
  couplingMesh,
  couplingRingMesh,
  couplingTipMesh,
  envelope,
  gimbalMesh,
  gimbalSpineMesh,
  instancedMeshes,
  lightMesh,
  materialOf,
  matrixAt,
  params,
  podMesh,
  pulseMesh,
  relayMesh,
  ringMesh,
  toothMesh,
  translation,
  yAxisColumn,
  zAxisColumn
} from "./client-map-3d-hive-mind-ii-inspect.js";

const build = (instances = 1): { scene: Scene; overlay: ReturnType<typeof createHiveMindIiModuleOverlay> } => {
  const scene = new Scene();
  const overlay = createHiveMindIiModuleOverlay(scene, instances);
  for (let i = 0; i < instances; i += 1) overlay.addInstance(i * 0.5, 0, 0, 0, 0, 0);
  overlay.commit();
  return { scene, overlay };
};

describe("hive mind ii module construction", () => {
  it("builds every part of the silhouette: seat, pod, twin cores, gimbal, spine, bridge, pulse, signal ring, teeth, relays, conduits, lights, coupling", () => {
    const { scene } = build();
    expect(podMesh(scene)).toBeDefined();
    expect(baseMesh(scene)).toBeDefined();
    expect(coreMesh(scene)).toBeDefined();
    expect(gimbalMesh(scene)).toBeDefined();
    expect(gimbalSpineMesh(scene)).toBeDefined();
    expect(bridgeMesh(scene)).toBeDefined();
    expect(pulseMesh(scene)).toBeDefined();
    expect(ringMesh(scene)).toBeDefined();
    expect(toothMesh(scene)).toBeDefined();
    expect(relayMesh(scene)).toBeDefined();
    expect(conduitMesh(scene)).toBeDefined();
    expect(lightMesh(scene)).toBeDefined();
    expect(couplingMesh(scene)).toBeDefined();
    expect(couplingRingMesh(scene)).toBeDefined();
    expect(couplingTipMesh(scene)).toBeDefined();
  });

  it("mounts TWO faceted command cores side by side above the pod crown — the module's tallest point", () => {
    // MAIN_READ: the command assembly is THE piece that matters — a PAIR of
    // identical dark low-poly faceted orbs floating over the pod, spread across
    // the module's own Z axis, crowned as the tallest things on the module so
    // the coordination reads first at strategy-game distance.
    const { scene } = build();
    expect(coreMesh(scene)!.count).toBe(2);
    const t0 = translation(coreMesh(scene)!, 0);
    const t1 = translation(coreMesh(scene)!, 1);
    expect(t0.x).toBeCloseTo(0, 6);
    expect(t1.x).toBeCloseTo(0, 6);
    expect(t0.y).toBeCloseTo(HMM2_TWIN.y * S, 6);
    expect(t1.y).toBeCloseTo(HMM2_TWIN.y * S, 6);
    // Side by side: one on each flank of the centre line, mirrored about it.
    expect(Math.abs(Math.abs(t0.z) - HMM2_TWIN.dz * S)).toBeLessThan(1e-6);
    expect(t1.z).toBeCloseTo(-t0.z, 6);
    // A low-poly faceted ball, not a smooth data orb: 20 flat dark faces.
    const coreGeo = params(coreMesh(scene)!);
    expect(coreGeo.type).toBe("IcosahedronGeometry");
    expect(coreGeo.parameters.detail).toBe(0);
    // The cores clear the pod's crown by a real margin.
    expect(bounds(coreMesh(scene)!).minY).toBeGreaterThan(HMM2_POD_CROWN * S + 0.01);
    // And their crown tops the whole module.
    expect(bounds(coreMesh(scene)!).maxY).toBeCloseTo(HMM2_TOWER_TOP * S, 4);
    expect(bounds(coreMesh(scene)!).maxY).toBeLessThan(0.34);
  });

  it("links the twin cores with a thick steel synchronization bridge that reaches both spheres", () => {
    const { scene } = build();
    const bridge = bridgeMesh(scene)!;
    expect(bridge.count).toBe(1);
    // A thick slab, not a wire.
    expect(params(bridge).parameters.height).toBeCloseTo(HMM2_BRIDGE.thickness, 6);
    expect(HMM2_BRIDGE.thickness).toBeGreaterThanOrEqual(0.008);
    // Centred on the seam between the two cores, at their own height.
    const t = translation(bridge, 0);
    expect(t.x).toBeCloseTo(0, 6);
    expect(t.z).toBeCloseTo(0, 6);
    expect(t.y).toBeCloseTo(HMM2_TWIN.y * S, 6);
    // Its length bridges the full span between the two cores' centre lines.
    expect((HMM2_BRIDGE.length * S) / 2).toBeCloseTo(HMM2_TWIN.dz * S, 6);
  });

  it("cradles both cores in a shared flat brass gimbal frame", () => {
    const { scene } = build();
    const gimbals = gimbalMesh(scene)!;
    expect(gimbals.count).toBe(2);
    // Two cradles, one under each core, mirrored about the centre line.
    const g0 = translation(gimbals, 0);
    const g1 = translation(gimbals, 1);
    expect(g0.y).toBeCloseTo(HMM2_GIMBAL.y * S, 6);
    expect(g1.y).toBeCloseTo(HMM2_GIMBAL.y * S, 6);
    expect(g1.z).toBeCloseTo(-g0.z, 6);
    expect(Math.abs(Math.abs(g0.z) - HMM2_TWIN.dz * S)).toBeLessThan(1e-6);
    // Each is a flat horizontal band (hole up), riding the module's vertical
    // axis.
    for (const i of [0, 1]) {
      const hole = zAxisColumn(gimbals, i);
      expect(Math.abs(hole.y)).toBeGreaterThan(Math.abs(hole.x) * 5);
      expect(Math.abs(hole.y)).toBeGreaterThan(Math.abs(hole.z) * 5);
    }
    // Heavy aged brass.
    expect(materialOf(gimbals).metalness).toBeGreaterThan(0.7);
    // The frame is genuinely SHARED: one central brass spine threads the gap
    // between the two cores, running from the pod crown up to the bridge
    // underside, so both orbs hang on a single brass mechanism.
    const spines = gimbalSpineMesh(scene)!;
    expect(spines.count).toBe(1);
    const st = translation(spines, 0);
    expect(st.x).toBeCloseTo(0, 6);
    expect(st.z).toBeCloseTo(0, 6);
    expect(st.y).toBeCloseTo(((HMM2_GIMBAL_SPINE.y0 + HMM2_GIMBAL_SPINE.y1) / 2) * S, 6);
    // Its length exactly spans pod crown to bridge underside along the Y axis.
    const axis = yAxisColumn(spines, 0);
    expect(Math.abs(axis.x)).toBeLessThan(1e-9);
    expect(Math.abs(axis.z)).toBeLessThan(1e-9);
    expect(axis.length()).toBeCloseTo((HMM2_GIMBAL_SPINE.y1 - HMM2_GIMBAL_SPINE.y0) * S, 6);
    // Thin enough to pass through the 0.036-wide gap between the two cores.
    expect(HMM2_GIMBAL_SPINE.radius * 2).toBeLessThan(2 * HMM2_TWIN.dz - 2 * HMM2_CORE.r);
    // Same heavy aged brass as the crescents.
    expect(materialOf(spines).metalness).toBeGreaterThan(0.7);
  });

  it("girdles the pair with a broad flat brass signal ring, clear of the cores inside", () => {
    const { scene } = build();
    const ring = ringMesh(scene)!;
    expect(ring.count).toBe(1);
    // Flat, not tilted: the ring is a band lying around the cores' height.
    const hole = zAxisColumn(ring, 0);
    expect(Math.abs(hole.y)).toBeGreaterThan(Math.abs(hole.x) * 5);
    expect(Math.abs(hole.y)).toBeGreaterThan(Math.abs(hole.z) * 5);
    // Clear of the cores: the ring's inner edge stays outside the pair.
    expect(bounds(coreMesh(scene)!).maxRadius).toBeLessThan((HMM2_RING.radius - HMM2_RING.tube) * S - 0.002);
    // Its own band reads at the published radius.
    expect(bounds(ring).maxRadius).toBeCloseTo((HMM2_RING.radius + HMM2_RING.tube) * S, 4);
    // And it rides above the pod crown on the cores' own band.
    expect(bounds(ring).minY).toBeGreaterThan(HMM2_POD_CROWN * S + 0.02);
  });

  it("plants three brass teeth on the ring's outer edge to make its rotation legible", () => {
    const { scene } = build();
    const teeth = toothMesh(scene)!;
    expect(teeth.count).toBe(3);
    // Three distinct teeth, one orbit per 120°.
    expect(matrixAt(teeth, 0)).not.toEqual(matrixAt(teeth, 1));
    expect(matrixAt(teeth, 1)).not.toEqual(matrixAt(teeth, 2));
    for (const i of [0, 1, 2]) {
      const t = translation(teeth, i);
      expect(t.y).toBeCloseTo(HMM2_TOOTH.y * S, 6);
      // Mounted on the ring's outer edge, proud of the ring band.
      expect(Math.hypot(t.x, t.z)).toBeCloseTo(HMM2_TOOTH.radius * S, 6);
    }
    expect(materialOf(teeth).metalness).toBeGreaterThan(0.7);
  });

  it("arranges four relay nodes symmetrically at the 45° diagonals around the pair", () => {
    const { scene } = build();
    const relays = relayMesh(scene)!;
    expect(relays.count).toBe(4);
    const angles = [0, 1, 2, 3]
      .map((i) => translation(relays, i))
      .map((t) => Math.atan2(t.z, t.x))
      .sort((a, b) => a - b);
    expect(angles[1]! - angles[0]!).toBeCloseTo(Math.PI / 2, 3);
    expect(angles[2]! - angles[1]!).toBeCloseTo(Math.PI / 2, 3);
    expect(angles[3]! - angles[2]!).toBeCloseTo(Math.PI / 2, 3);
    expect(angles[0]! + Math.PI * 2 - angles[3]!).toBeCloseTo(Math.PI / 2, 3);
    for (const i of [0, 1, 2, 3]) {
      const t = translation(relays, i);
      expect(Math.hypot(t.x, t.z)).toBeCloseTo(HMM2_RELAY.radius * S, 6);
      expect(t.y).toBeCloseTo(HMM2_RELAY.y * S, 6);
    }
  });

  it("seals each relay to its own nearest core with a short rigid conduit", () => {
    const { scene } = build();
    const conduits = conduitMesh(scene)!;
    expect(conduits.count).toBe(4);
    // Thick, not wire.
    expect(params(conduits).parameters.radiusTop).toBeCloseTo(HMM2_CONDUIT.radius, 6);
    for (const i of [0, 1, 2, 3]) {
      const c = translation(conduits, i);
      const r = translation(relayMesh(scene)!, i);
      // Each conduit is a rod from its relay's centre to the core on that
      // relay's own Z side — its near end lands on the relay, its far end on
      // the paired core.
      const nearEnd = c.clone().sub(yAxisColumn(conduits, i).clone().multiplyScalar(0.5));
      const farEnd = c.clone().add(yAxisColumn(conduits, i).clone().multiplyScalar(0.5));
      expect(nearEnd.distanceTo(r)).toBeLessThan(1e-4);
      expect(farEnd.x).toBeCloseTo(0, 4);
      expect(farEnd.y).toBeCloseTo(HMM2_TWIN.y * S, 4);
      expect(farEnd.z).toBeCloseTo(Math.sign(Math.sin(HMM2_RELAY_AZIMUTHS[i]!)) * HMM2_TWIN.dz * S, 4);
    }
  });

  it("marks each relay with a restrained cyan signal light facing outward", () => {
    const { scene } = build();
    const lights = lightMesh(scene)!;
    expect(lights.count).toBe(4);
    for (const i of [0, 1, 2, 3]) {
      const l = translation(lights, i);
      const r = translation(relayMesh(scene)!, i);
      // On the relay's own azimuth, proud of its outer face.
      expect(Math.atan2(l.z, l.x)).toBeCloseTo(Math.atan2(r.z, r.x), 4);
      expect(l.y).toBeCloseTo(r.y, 6);
      expect(Math.hypot(l.x, l.z)).toBeGreaterThan(Math.hypot(r.x, r.z));
      expect(Math.hypot(l.x, l.z)).toBeCloseTo(HMM2_SIGNAL_LIGHT.radius * S, 6);
    }
    // The restrained cyan command-glow, not white or violet.
    const mat = materialOf(lights);
    expect(mat.emissive.b).toBeGreaterThan(mat.emissive.g);
    expect(mat.emissive.g).toBeGreaterThan(mat.emissive.r);
    expect(mat.emissiveIntensity).toBeLessThanOrEqual(1);
  });

  it("keeps the relay ring below the signal ring and clear of the pod, riding up into the cores' height", () => {
    const { scene } = build();
    // The relays stand well above the pod's crown — no horizontal clipping.
    expect(bounds(relayMesh(scene)!).minY).toBeGreaterThan(HMM2_POD_CROWN * S + 0.005);
    // Their tops climb into the cores' height, so the conduits read as wiring
    // them straight into the pair rather than dangling below it.
    expect(bounds(relayMesh(scene)!).maxY).toBeLessThan(bounds(coreMesh(scene)!).maxY);
    // And they sit fully BELOW the broad signal ring that girdles the cores.
    expect(bounds(relayMesh(scene)!).maxY).toBeLessThan(bounds(ringMesh(scene)!).minY);
  });
});

describe("hive mind ii module envelope", () => {
  it("sits on the pad top rather than sinking through it", () => {
    const { scene } = build();
    expect(envelope(scene).minY).toBeGreaterThanOrEqual(-0.01);
    expect(bounds(baseMesh(scene)!).minY).toBeCloseTo(0, 4);
  });

  it("stays inside the module height cap, its tallest point the twin cores' crown", () => {
    const { scene } = build();
    const MODULE_HEIGHT_CAP = 0.34;
    const env = envelope(scene);
    expect(env.maxY).toBeLessThanOrEqual(MODULE_HEIGHT_CAP);
    // The command assembly reads as a tall pair over a low pod: it clears the
    // 0.29 floor and the two cores tower clear of the signal ring and bridge.
    expect(env.maxY).toBeGreaterThan(0.29);
    expect(env.maxY).toBeGreaterThan(HMM2_POD_CROWN * S + 0.09);
    expect(env.maxY).toBeCloseTo(HMM2_TOWER_TOP * S, 4);
    expect(env.maxY).toBeGreaterThan(bounds(ringMesh(scene)!).maxY);
    expect(env.maxY).toBeGreaterThan(bounds(bridgeMesh(scene)!).maxY);
    expect(env.maxY).toBeGreaterThan(bounds(toothMesh(scene)!).maxY);
  });

  it("publishes its height as the crown of the twin cores", () => {
    const { scene } = build();
    const env = envelope(scene);
    const published = HIVE_MIND_II_MODULE_HEIGHT;
    // Tolerance covers float evaluation-order drift: the measured crown is the
    // translation plus the pole vertex scaled separately, published is the
    // summed local top scaled once — they agree to ~1e-9.
    expect(published).toBeGreaterThanOrEqual(env.maxY - 1e-6);
    expect(published).toBeCloseTo(HMM2_TOWER_TOP * S, 6);
  });

  it("keeps the widest elevated part inside the AFC bay, its width the ring's teeth", () => {
    const { scene } = build();
    // The shared seat lip deliberately overhangs the bay, exactly as on every
    // other family, so it is skipped by parameter and checked on its own below.
    for (const mesh of instancedMeshes(scene)) {
      if (params(mesh).type === "TorusGeometry" && (params(mesh).parameters as { radius: number }).radius === 0.12) continue;
      expect(bounds(mesh).maxRadius).toBeLessThan(AFC_BAY_INNER_RADIUS);
    }
    // The ring's orbiting teeth are the widest elevated point — past the signal
    // ring, the signal lights and the relays — but still under the bay: their
    // outer faces read 0.1015 local off-axis and the bay inner radius is 0.14
    // world.
    expect(bounds(toothMesh(scene)!).maxRadius).toBeGreaterThan(0.13);
    expect(bounds(toothMesh(scene)!).maxRadius).toBeLessThan(AFC_BAY_INNER_RADIUS);
    expect(bounds(toothMesh(scene)!).maxRadius).toBeGreaterThan(bounds(ringMesh(scene)!).maxRadius);
    expect(bounds(ringMesh(scene)!).maxRadius).toBeGreaterThan(bounds(lightMesh(scene)!).maxRadius);
    expect(bounds(lightMesh(scene)!).maxRadius).toBeGreaterThan(bounds(relayMesh(scene)!).maxRadius);
    expect(bounds(relayMesh(scene)!).maxRadius).toBeGreaterThan(bounds(coreMesh(scene)!).maxRadius);
  });

  it("docks on the same circular seat as the rest of the ring", () => {
    const { scene } = build();
    expect(bounds(baseMesh(scene)!).maxRadius).toBeCloseTo(0.105 * S, 6);
    expect(HIVE_MIND_II_BASE_RADIUS).toBeLessThan(AFC_BAY_INNER_RADIUS);
  });
});

describe("hive mind ii module palette", () => {
  it("keeps the glow cyan and restrained to the signal lights, the bridge pulse and the AFC tip", () => {
    // The command-glow budget is strict: only the four relay signal lights, the
    // bridge pulse and the cyan AFC contact tip emit — no glowing cores, no lit
    // ring, no lit conduits. (Default emissiveIntensity is 1 with a BLACK
    // emissive, so the presence of a lit material is decided by the emissive
    // colour, not the intensity.)
    const { scene } = build();
    const lit: { isCyan: boolean }[] = [];
    for (const mesh of instancedMeshes(scene)) {
      const m = materialOf(mesh);
      if (m.emissive.r > 0 || m.emissive.g > 0 || m.emissive.b > 0) lit.push({ isCyan: m.emissive.b > m.emissive.r });
    }
    expect(lit.length).toBe(3);
    expect(lit.every((entry) => entry.isCyan)).toBe(true);
    for (const mesh of instancedMeshes(scene)) expect(materialOf(mesh).emissiveIntensity).toBeLessThan(1.1);
  });
});

describe("hive mind ii module lifecycle", () => {
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

describe("hive mind ii module docking", () => {
  it("spaces instances apart on the socket ring, yaws each about its own dock point", () => {
    const { scene } = build(2);
    const pod = podMesh(scene)!;
    expect(pod.count).toBe(2);
    const a = translation(pod, 0);
    const b = translation(pod, 1);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(0.5, 6);
    // The pod's origin is the module's dock point: yaw it hard and the cores
    // must stay exactly on the socket, not swing around the world origin.
    const yawed = new Scene();
    const overlay = createHiveMindIiModuleOverlay(yawed, 1);
    overlay.addInstance(3, -2, 0, 1.1, 0, 0);
    overlay.commit();
    const yawedPod = translation(podMesh(yawed)!, 0);
    expect(yawedPod.x).toBeCloseTo(3, 6);
    expect(yawedPod.z).toBeCloseTo(-2, 6);
  });

  it("docks on the real AFC socket ring with the command assembly running outward", () => {
    const afcScene = new Scene();
    const afc = createFabricationComplexOverlay(afcScene, 1);
    const afcIndex = afc.addInstance(0, 0, 0, 4, 0);
    afc.commit();
    const attachment = afc.moduleSocketAttachments(afcIndex)[3]!;

    const scene = new Scene();
    const overlay = createHiveMindIiModuleOverlay(scene, 1);
    overlay.addInstance(attachment.x, attachment.z, attachment.y, attachment.yaw, 0, 0);
    overlay.commit();

    // The pod's own origin is the socket point — not the world origin pulled
    // through the yaw.
    const podOrigin = translation(podMesh(scene)!, 0);
    const podDist = Math.hypot(podOrigin.x, podOrigin.z);
    expect(podDist).toBeCloseTo(Math.hypot(attachment.x, attachment.z), 5);
    // The network runs outward down the socket. The four signal lights sit at
    // the 45° diagonals, so their radial reach is azimuth-dependent: projected
    // onto the socket's outward radial axis, the forward pair rides further
    // from the AFC core than the pod and the rear pair hangs closer.
    const outward = podOrigin.clone().divideScalar(podDist);
    const projections = [0, 1, 2, 3].map((i) => {
      const offset = translation(lightMesh(scene)!, i).clone().sub(podOrigin);
      return offset.dot(outward);
    });
    expect(Math.max(...projections)).toBeGreaterThan(0.03);
    expect(Math.min(...projections)).toBeLessThan(-0.03);
    const couplingOrigin = translation(couplingMesh(scene)!, 0);
    expect(Math.hypot(couplingOrigin.x, couplingOrigin.z)).toBeLessThan(podDist - 0.05);
  });
});
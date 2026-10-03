// Regression tests for the Reserve Lattice (RL) AFC module overlay.
//
// These pin the things that are easy to break by accident and invisible in a
// screenshot: that the family really is one oversized cage-like lattice drum
// laid HORIZONTALLY across the pod rather than a tall tower or a low ring, that
// the brass ribs and steel bars actually form a lattice around a dark inner
// cylinder, that the stored glow inside the lattice is dimmer and more
// contained than the cyan indicator nodes on the ridge (stored capacity, not a
// power plant), and that the whole assembly stays inside the shared bay.

import { describe, expect, it } from "vitest";
import { Scene } from "three";
import {
  RESERVE_LATTICE_BASE_RADIUS,
  RESERVE_LATTICE_MODULE_HEIGHT,
  RESERVE_LATTICE_SCALE,
  createReserveLatticeModuleOverlay
} from "./client-map-3d-reserve-lattice-module.js";
import {
  RL_BAR,
  RL_BAR_AZIMUTHS,
  RL_CLAMP_Z,
  RL_CONDUIT,
  RL_DRUM,
  RL_DRUM_CORE,
  RL_DRUM_TOP,
  RL_GLOW,
  RL_NODE,
  RL_NODE_Z,
  RL_POD,
  RL_POD_CROWN,
  RL_RIB_Z,
  RL_TOWER_TOP
} from "./client-map-3d-reserve-lattice-parts.js";
import { AFC_BAY_INNER_RADIUS, createFabricationComplexOverlay } from "./client-map-3d-fabrication-complex.js";
import {
  barMesh,
  baseMesh,
  bounds,
  clampMesh,
  conduitMesh,
  couplingMesh,
  couplingRingMesh,
  couplingTipMesh,
  cylinderAlongZ,
  cylinderHorizontal,
  drumCoreMesh,
  envelope,
  glowMesh,
  instancedMeshes,
  materialOf,
  nodeMesh,
  params,
  podMesh,
  ribMesh,
  ringWrapsZ,
  translation,
  yAxisColumn
} from "./client-map-3d-reserve-lattice-inspect.js";

const build = (instances = 1): { scene: Scene; overlay: ReturnType<typeof createReserveLatticeModuleOverlay> } => {
  const scene = new Scene();
  const overlay = createReserveLatticeModuleOverlay(scene, instances);
  for (let i = 0; i < instances; i += 1) overlay.addInstance(i * 0.5, 0, 0, 0, 0, 0);
  overlay.commit();
  return { scene, overlay };
};

describe("reserve lattice module construction", () => {
  it("builds every part of the silhouette: seat, pod, drum core, ribs, bars, clamps, glow, nodes, conduits, coupling", () => {
    const { scene } = build();
    expect(podMesh(scene)).toBeDefined();
    expect(baseMesh(scene)).toBeDefined();
    expect(drumCoreMesh(scene)).toBeDefined();
    expect(ribMesh(scene)).toBeDefined();
    expect(barMesh(scene)).toBeDefined();
    expect(clampMesh(scene)).toBeDefined();
    expect(glowMesh(scene)).toBeDefined();
    expect(nodeMesh(scene)).toBeDefined();
    expect(conduitMesh(scene)).toBeDefined();
    expect(couplingMesh(scene)).toBeDefined();
    expect(couplingRingMesh(scene)).toBeDefined();
    expect(couplingTipMesh(scene)).toBeDefined();
  });

  it("lays one oversized lattice drum horizontally across the pod's crown", () => {
    // MAIN_READ: the barrel must lie ALONG the local Z axis (across the pod),
    // tower clear of the crown by a real margin, and dip through the crown so it
    // reads as mounted through the pod rather than balanced on it — and it must
    // be longer than the pod is wide, an oversized thing parked across the body.
    const { scene } = build();
    expect(cylinderAlongZ(drumCoreMesh(scene)!, 0)).toBe(true);
    const drumT = translation(drumCoreMesh(scene)!, 0);
    expect(drumT.x).toBeCloseTo(0, 6);
    expect(drumT.z).toBeCloseTo(0, 6);
    expect(drumT.y).toBeCloseTo(RL_DRUM.y * RESERVE_LATTICE_SCALE, 6);
    expect(RL_DRUM.y - RL_DRUM.radius).toBeLessThan(RL_POD_CROWN);
    expect(RL_DRUM_TOP - RL_POD_CROWN).toBeGreaterThan(0.05);
    expect(RL_DRUM.halfLength).toBeGreaterThan(RL_POD.radius);
  });

  it("wraps a dark steel inner cylinder with four evenly spaced brass ribs", () => {
    const { scene } = build();
    const ribs = ribMesh(scene)!;
    expect(ribs.count).toBe(4);
    const ribZs = [0, 1, 2, 3].map((i) => translation(ribs, i).z).sort((a, b) => a - b);
    const expected = [...RL_RIB_Z].sort((a, b) => a - b);
    for (let i = 0; i < 4; i += 1) {
      expect(ribZs[i]!).toBeCloseTo(expected[i]! * RESERVE_LATTICE_SCALE, 6);
      expect(ringWrapsZ(ribs, i)).toBe(true);
    }
    // The dark inner cylinder reads as a steel bank through the cage.
    const core = drumCoreMesh(scene)!;
    expect(core.count).toBe(1);
    const coreMat = materialOf(core);
    expect(coreMat.metalness).toBeGreaterThan(0.4);
    // The ribs are the aged brass of the ring.
    expect(materialOf(ribs).metalness).toBeGreaterThan(0.7);
  });

  it("ties the ribs into a lattice with seven thin rails around the cage circle", () => {
    const { scene } = build();
    const bars = barMesh(scene)!;
    expect(bars.count).toBe(RL_BAR_AZIMUTHS.length);
    for (let i = 0; i < bars.count; i += 1) {
      expect(cylinderAlongZ(bars, i)).toBe(true);
      const t = translation(bars, i);
      // Every rail sits on the cage circle centred on the drum axis.
      const radial = Math.hypot(t.x, t.y - RL_DRUM.y * RESERVE_LATTICE_SCALE);
      expect(radial).toBeCloseTo(RL_DRUM.radius * RESERVE_LATTICE_SCALE, 6);
      expect(Math.abs(t.z)).toBeLessThan(RL_DRUM.halfLength * RESERVE_LATTICE_SCALE);
    }
    // No rail dips below the pod crown (the cardinal nadir is deliberately
    // omitted, so the drum rests on the pod cleanly).
    for (let i = 0; i < bars.count; i += 1) {
      const t = translation(bars, i);
      expect(t.y - RL_BAR.radius * RESERVE_LATTICE_SCALE).toBeGreaterThan(RL_POD_CROWN * RESERVE_LATTICE_SCALE);
    }
  });

  it("ends the drum with one compact locking clamp at either end", () => {
    const { scene } = build();
    const clamps = clampMesh(scene)!;
    expect(clamps.count).toBe(2);
    const clampZs = [0, 1].map((i) => translation(clamps, i).z).sort((a, b) => a - b);
    expect(clampZs[0]!).toBeCloseTo(RL_CLAMP_Z[0]! * RESERVE_LATTICE_SCALE, 6);
    expect(clampZs[1]!).toBeCloseTo(RL_CLAMP_Z[1]! * RESERVE_LATTICE_SCALE, 6);
    for (let i = 0; i < clamps.count; i += 1) {
      expect(ringWrapsZ(clamps, i)).toBe(true);
      expect(translation(clamps, i).y).toBeCloseTo(RL_DRUM.y * RESERVE_LATTICE_SCALE, 6);
    }
  });

  it("reads stored capacity through a faint contained glow under cyan indicator nodes", () => {
    const { scene } = build();
    // Five cyan-lit nodes on the drum's top ridge, spaced evenly along the frame.
    const nodes = nodeMesh(scene)!;
    expect(nodes.count).toBe(RL_NODE_Z.length);
    const nodeYs = [0, 1, 2, 3, 4].map((i) => translation(nodes, i).y);
    for (const y of nodeYs) expect(y).toBeCloseTo((RL_DRUM_TOP + RL_NODE.lift) * RESERVE_LATTICE_SCALE, 6);
    for (let i = 0; i < nodes.count; i += 1) {
      expect(translation(nodes, i).x).toBeCloseTo(0, 6);
      expect(translation(nodes, i).z).toBeCloseTo(RL_NODE_Z[i]! * RESERVE_LATTICE_SCALE, 6);
    }
    // The stored glow is a single faint element sitting just above the steel
    // bank, held inside the lattice below the cage's top rail.
    const glow = glowMesh(scene)!;
    expect(glow.count).toBe(1);
    expect(cylinderAlongZ(glow, 0)).toBe(true);
    const glowT = translation(glow, 0);
    expect(glowT.x).toBeCloseTo(0, 6);
    expect(glowT.z).toBeCloseTo(0, 6);
    // Still inside the cage circle: the glow's centre stays between the inner
    // cylinder and the lattice, never above the cage's top rail.
    const glowRadial = glowT.y - RL_DRUM.y * RESERVE_LATTICE_SCALE;
    expect(glowRadial).toBeGreaterThan(RL_DRUM_CORE.radius * RESERVE_LATTICE_SCALE);
    expect(glowRadial).toBeLessThan(RL_DRUM.radius * RESERVE_LATTICE_SCALE);
    expect(glowT.y + RL_GLOW.radius * RESERVE_LATTICE_SCALE).toBeLessThan(RL_DRUM_TOP * RESERVE_LATTICE_SCALE);
    // Both genuine cyan, and the stored glow is dimmer than the indicator nodes
    // — a reserve bank's lights, not a reactor's.
    const nodeMat = materialOf(nodes);
    const glowMat = materialOf(glow);
    expect(nodeMat.emissive.b).toBeGreaterThan(nodeMat.emissive.r);
    expect(glowMat.emissive.b).toBeGreaterThan(glowMat.emissive.r);
    expect(glowMat.emissiveIntensity).toBeLessThan(nodeMat.emissiveIntensity);
    expect(glowMat.emissiveIntensity).toBeLessThan(1.1);
    expect(nodeMat.emissiveIntensity).toBeLessThan(1.1);
  });

  it("rises two heavy retaining conduits from the drum low into the rear pod flank", () => {
    const { scene } = build();
    const conduits = conduitMesh(scene)!;
    expect(conduits.count).toBe(2);
    for (let i = 0; i < conduits.count; i += 1) {
      const t = translation(conduits, i);
      // Both brace the drum low on the flanks, running forward-and-up from the
      // rear pod foot (near the coupling) to the barrel's lower front skin.
      expect(t.y).toBeLessThan(RL_DRUM.y * RESERVE_LATTICE_SCALE);
      const axis = yAxisColumn(conduits, i);
      expect(axis.x).toBeGreaterThan(0);
      expect(Math.abs(axis.x)).toBeGreaterThan(Math.abs(axis.y));
    }
    expect(Math.abs(translation(conduits, 0).z)).toBeCloseTo(RL_CONDUIT.z * RESERVE_LATTICE_SCALE, 6);
    expect(Math.abs(translation(conduits, 1).z)).toBeCloseTo(RL_CONDUIT.z * RESERVE_LATTICE_SCALE, 6);
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

describe("reserve lattice module envelope", () => {
  it("sits on the pad top rather than sinking through it", () => {
    const { scene } = build();
    expect(envelope(scene).minY).toBeGreaterThanOrEqual(-0.01);
  });

  it("stays inside the module height cap, its tallest point the indicator nodes", () => {
    const { scene } = build();
    const MODULE_HEIGHT_CAP = 0.34;
    const env = envelope(scene);
    expect(env.maxY).toBeLessThanOrEqual(MODULE_HEIGHT_CAP);
    // The reserve drum reads as an oversized barrel over a low pod: it clears
    // the 0.25 floor, and the nodes riding the cage's top rail carry the top of
    // the envelope.
    expect(env.maxY).toBeGreaterThan(0.3);
    expect(env.maxY).toBeGreaterThan(RL_POD_CROWN * RESERVE_LATTICE_SCALE + 0.1);
    expect(env.maxY).toBeCloseTo(RL_TOWER_TOP * RESERVE_LATTICE_SCALE, 4);
  });

  it("publishes its height as the top of the indicator nodes", () => {
    const { scene } = build();
    const env = envelope(scene);
    const published = RESERVE_LATTICE_MODULE_HEIGHT;
    expect(published).toBeGreaterThanOrEqual(env.maxY - 1e-9);
    expect(published).toBeCloseTo(RL_TOWER_TOP * RESERVE_LATTICE_SCALE, 6);
  });

  it("keeps the widest elevated part inside the AFC bay, its width the end clamps", () => {
    const { scene } = build();
    // The shared seat lip deliberately overhangs the bay, exactly as on every
    // other family, so it is skipped by parameter and checked on its own below.
    for (const mesh of instancedMeshes(scene)) {
      if (params(mesh).type === "TorusGeometry" && (params(mesh).parameters as { radius: number }).radius === 0.12) continue;
      expect(bounds(mesh).maxRadius).toBeLessThan(AFC_BAY_INNER_RADIUS);
    }
    // The end clamps set this family's width: their outer corners are the widest
    // elevated points of the drum.
    const clamps = clampMesh(scene)!;
    expect(bounds(clamps).maxRadius).toBeLessThan(AFC_BAY_INNER_RADIUS);
    expect(bounds(clamps).maxRadius).toBeGreaterThan(0.12);
  });

  it("docks on the same circular seat as the rest of the ring", () => {
    const { scene } = build();
    expect(bounds(baseMesh(scene)!).maxRadius).toBeCloseTo(0.105 * RESERVE_LATTICE_SCALE, 6);
    expect(RESERVE_LATTICE_BASE_RADIUS).toBeLessThan(AFC_BAY_INNER_RADIUS);
  });
});

describe("reserve lattice module lifecycle", () => {
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

describe("reserve lattice module docking", () => {
  it("spaces instances apart on the socket ring, and yaws each about its own dock point", () => {
    const { scene } = build(2);
    const pod = podMesh(scene)!;
    expect(pod.count).toBe(2);
    const a = translation(pod, 0);
    const b = translation(pod, 1);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(0.5, 6);
    // The two end clamps sit at local z = ±0.084, exactly symmetric about the
    // module's own centre line — their midpoint must land on the socket itself.
    // Fold the origin into the yaw and that midpoint lands on the SOCKET'S
    // ROTATION instead, a different point whenever yaw ≠ 0.
    const yawed = new Scene();
    const overlay = createReserveLatticeModuleOverlay(yawed, 1);
    overlay.addInstance(3, -2, 0, 1.1, 0, 0);
    overlay.commit();
    const yawedClamps = clampMesh(yawed)!;
    expect((translation(yawedClamps, 0).x + translation(yawedClamps, 1).x) * 0.5).toBeCloseTo(3, 6);
    expect((translation(yawedClamps, 0).z + translation(yawedClamps, 1).z) * 0.5).toBeCloseTo(-2, 6);
  });

  it("docks on the real AFC socket ring without swinging off its socket", () => {
    const afcScene = new Scene();
    const afc = createFabricationComplexOverlay(afcScene, 1);
    const afcIndex = afc.addInstance(0, 0, 0, 4, 0);
    afc.commit();
    const attachment = afc.moduleSocketAttachments(afcIndex)[3]!;

    const scene = new Scene();
    const overlay = createReserveLatticeModuleOverlay(scene, 1);
    overlay.addInstance(attachment.x, attachment.z, attachment.y, attachment.yaw, 0, 0);
    overlay.commit();

    // The pod's own origin is the socket point — not the world origin pulled
    // through the yaw.
    const pod = podMesh(scene)!;
    const podOrigin = translation(pod, 0);
    expect(Math.hypot(podOrigin.x, podOrigin.z)).toBeCloseTo(Math.hypot(attachment.x, attachment.z), 5);
    // The drum's centre lands exactly on the socket too (it lies across the
    // module's own centre line), and it stays horizontal through the dock yaw.
    const drum = drumCoreMesh(scene)!;
    const drumT = translation(drum, 0);
    expect(drumT.x).toBeCloseTo(attachment.x, 5);
    expect(drumT.z).toBeCloseTo(attachment.z, 5);
    expect(cylinderHorizontal(drum, 0)).toBe(true);
    // The two end clamps bracket the socket symmetrically: their midpoint is the
    // socket point even yawed onto the ring.
    const clamps = clampMesh(scene)!;
    expect((translation(clamps, 0).x + translation(clamps, 1).x) * 0.5).toBeCloseTo(attachment.x, 5);
    expect((translation(clamps, 0).z + translation(clamps, 1).z) * 0.5).toBeCloseTo(attachment.z, 5);
  });
});
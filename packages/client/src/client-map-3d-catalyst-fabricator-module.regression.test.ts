// Regression tests for the Catalyst Fabricator (CAT) AFC module overlay.
//
// These pin the things that are easy to break by accident and invisible in a
// screenshot: that the family really is a horizontal multi-chamber drum rather
// than a stack of rings, that the three chambers carry three DISTINCT glows,
// that the barrel stays inside the shared bay, and — the one that matters most —
// that the drum's port arcs actually ROTATE. The rotation check reads the swept
// azimuth back out of the rendered matrices, and it was confirmed to fail when
// the update is stubbed out and when the speed is zeroed: a mutation that stops
// the rotor leaves every geometry parameter identical, and only a matrix-level
// check catches it.

import { describe, expect, it } from "vitest";
import { Scene, Vector3 } from "three";
import { createCatalystFabricatorModuleOverlay, CATALYST_FABRICATOR_BASE_RADIUS, CATALYST_FABRICATOR_MODULE_HEIGHT, CATALYST_FABRICATOR_SCALE } from "./client-map-3d-catalyst-fabricator-module.js";
import { CAT_CANISTER, CAT_DRUM, CAT_DRUM_SPEED_MS, CAT_DRUM_START_AZIMUTH, CAT_DRUM_TOP_Y, CAT_END_RING, CAT_OUTPUT, CAT_PARTITION, CAT_POD_CROWN, CAT_SEGMENT, CAT_SEGMENT_Z, CAT_WINDOW, CAT_WINDOW_OFFSET } from "./client-map-3d-catalyst-fabricator-parts.js";
import { AFC_BAY_INNER_RADIUS, createFabricationComplexOverlay } from "./client-map-3d-fabrication-complex.js";
import { arcAzimuth, barrelMesh, baseMesh, bounds, canisterCollarMesh, canisterMesh, cylinderLiesAlongZ, endRingMesh, envelope, instancedMeshes, materialOf, outputMesh, outputPortMesh, params, partitionMesh, podMesh, ringWrapsZ, segmentMeshes, translation, valveKnobMesh, windowMeshes, yAxisColumn } from "./client-map-3d-catalyst-fabricator-inspect.js";

const build = (instances = 1): { scene: Scene; overlay: ReturnType<typeof createCatalystFabricatorModuleOverlay> } => {
  const scene = new Scene();
  const overlay = createCatalystFabricatorModuleOverlay(scene, instances);
  for (let i = 0; i < instances; i += 1) overlay.addInstance(i * 0.5, 0, 0, 0, 0, 0);
  overlay.commit();
  return { scene, overlay };
};

const norm = (x: number): number => (((x + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

const emissiveHex = (mesh: { material: unknown }): string => (mesh.material as { emissive: { getHexString: () => string } }).emissive.getHexString();

describe("catalyst fabricator module construction", () => {
  it("builds every part of the silhouette: seat, pod, drum, chambers, ports, canisters, output", () => {
    const { scene } = build();
    expect(podMesh(scene)).toBeDefined();
    expect(baseMesh(scene)).toBeDefined();
    expect(barrelMesh(scene)).toBeDefined();
    expect(segmentMeshes(scene)).toHaveLength(3);
    expect(windowMeshes(scene)).toHaveLength(3);
    expect(partitionMesh(scene)).toBeDefined();
    expect(endRingMesh(scene)).toBeDefined();
    expect(canisterMesh(scene)).toBeDefined();
    expect(canisterCollarMesh(scene)).toBeDefined();
    expect(outputMesh(scene)).toBeDefined();
    expect(outputPortMesh(scene)).toBeDefined();
    expect(valveKnobMesh(scene)).toBeDefined();
  });

  it("lays the drum across the pod on the world Z axis, wider than it is tall", () => {
    const { scene } = build();
    expect(cylinderLiesAlongZ(barrelMesh(scene)!)).toBe(true);
    for (let i = 0; i < segmentMeshes(scene).length; i += 1) expect(cylinderLiesAlongZ(segmentMeshes(scene)[i]!)).toBe(true);
    // A barrel that was really a standing stack would still pass every geometry
    // check, so the shape has to be a horizontal one as well.
    expect(CAT_DRUM.length).toBeGreaterThan(CAT_DRUM.radius * 2);
    const box = bounds(barrelMesh(scene)!);
    expect(box.maxRadius).toBeGreaterThan(0.1);
  });

  it("towers the drum clear of the pod crown", () => {
    // MAIN_READ: the drum's curtain must clear the pod crown by more than a
    // chamber's own radius, or the family reads as a low barrel half-buried in
    // its own base instead of an oversized fabrication drum.
    expect(CAT_DRUM_TOP_Y - CAT_POD_CROWN).toBeGreaterThan(CAT_SEGMENT.radius);
  });

  it("divides the drum into exactly three chambers, each with its own glow", () => {
    const { scene } = build();
    const segments = segmentMeshes(scene);
    expect(segments.length).toBe(3);
    for (const segment of segments) expect(segment.count).toBe(1);
    // Three genuinely distinct coloured glows — the "different internal glow or
    // material feed" each chamber is specified to carry.
    const hexes = segments.map((s) => emissiveHex(s));
    expect(new Set(hexes).size).toBe(3);
    // Subdued, as specified: charged enough to tell the chambers apart, never
    // bright enough to read as lamps.
    for (const segment of segments) {
      const material = materialOf(segment);
      expect(material.emissiveIntensity).toBeLessThan(1.2);
    }
  });

  it("spreads the three chambers side by side along the drum axis", () => {
    const { scene } = build();
    const segments = segmentMeshes(scene);
    const zs = segments.flatMap((segment) => [translation(segment, 0).z]).sort((a, b) => a - b);
    expect(zs).toHaveLength(3);
    expect(zs[0]!).toBeCloseTo(CAT_SEGMENT_Z[0]! * CATALYST_FABRICATOR_SCALE, 6);
    expect(zs[1]!).toBeCloseTo(CAT_SEGMENT_Z[1]! * CATALYST_FABRICATOR_SCALE, 6);
    expect(zs[2]!).toBeCloseTo(CAT_SEGMENT_Z[2]! * CATALYST_FABRICATOR_SCALE, 6);
  });

  it("carries one bright port arc per chamber, each over its own chamber", () => {
    const { scene } = build();
    const windows = windowMeshes(scene);
    expect(windows.length).toBe(3);
    // The ports are genuinely partial arcs, not full rings pressed onto the drum.
    const arcLength = (params(windows[0]!).parameters as { thetaLength: number }).thetaLength;
    expect(arcLength).toBeCloseTo(CAT_WINDOW.thetaLength, 6);
    expect(arcLength).toBeLessThan(Math.PI);
    // Each port rides its chamber: the same three z positions.
    const winZs = windows.map((w) => translation(w, 0).z).sort((a, b) => a - b);
    const segZs = segmentMeshes(scene).map((s) => translation(s, 0).z).sort((a, b) => a - b);
    for (let i = 0; i < 3; i += 1) expect(winZs[i]!).toBeCloseTo(segZs[i]!, 6);
    // Bright ports over dark chambers: each port's emissive lifts far above its
    // chamber's, and the three ports are themselves three distinct colours.
    for (const w of windows) expect(materialOf(w).emissiveIntensity).toBeGreaterThan(1.8);
    expect(new Set(windows.map((w) => emissiveHex(w))).size).toBe(3);
  });

  it("clamps the barrel with two partition rings between chambers and two end rings", () => {
    const { scene } = build();
    const partitions = partitionMesh(scene)!;
    const ends = endRingMesh(scene)!;
    expect(partitions.count).toBe(2);
    expect(ends.count).toBe(2);
    for (let i = 0; i < partitions.count; i += 1) expect(ringWrapsZ(partitions, i)).toBe(true);
    for (let i = 0; i < ends.count; i += 1) expect(ringWrapsZ(ends, i)).toBe(true);
    const partZs = [translation(partitions, 0).z, translation(partitions, 1).z].sort((a, b) => a - b);
    expect(partZs[0]!).toBeCloseTo(-CAT_PARTITION.z * CATALYST_FABRICATOR_SCALE, 6);
    expect(partZs[1]!).toBeCloseTo(CAT_PARTITION.z * CATALYST_FABRICATOR_SCALE, 6);
    const endZs = [translation(ends, 0).z, translation(ends, 1).z].sort((a, b) => a - b);
    expect(endZs[0]!).toBeCloseTo(-CAT_END_RING.z * CATALYST_FABRICATOR_SCALE, 6);
    expect(endZs[1]!).toBeCloseTo(CAT_END_RING.z * CATALYST_FABRICATOR_SCALE, 6);
  });

  it("stands one canister at each chamber's apex, feeding it from above", () => {
    const { scene } = build();
    const canisters = canisterMesh(scene)!;
    expect(canisters.count).toBe(3);
    const canZs = [0, 1, 2].map((i) => translation(canisters, i).z).sort((a, b) => a - b);
    for (let i = 0; i < 3; i += 1) expect(canZs[i]!).toBeCloseTo(CAT_SEGMENT_Z[i]! * CATALYST_FABRICATOR_SCALE, 6);
    for (let i = 0; i < canisters.count; i += 1) {
      // Vertical chutes above the drum's centre line.
      const axis = yAxisColumn(canisters, i);
      expect(axis.y).toBeCloseTo(CATALYST_FABRICATOR_SCALE, 4);
      expect(Math.abs(axis.x)).toBeLessThan(1e-6);
      // Tapered upward so they read as feed chutes, not plain pipes.
      const geo = params(canisters).parameters;
      expect(geo.radiusTop as number).toBeLessThan(geo.radiusBottom as number);
    }
  });

  it("puts the output chamber alone on the drum's far +Z end, port beyond the end ring", () => {
    const { scene } = build();
    const output = outputMesh(scene)!;
    expect(output.count).toBe(1);
    expect(outputPortMesh(scene)!.count).toBe(1);
    const outZ = translation(output, 0).z;
    const endRingOuterZ = (CAT_END_RING.z + CAT_END_RING.tube) * CATALYST_FABRICATOR_SCALE;
    expect(outZ).toBeCloseTo(CAT_OUTPUT.z * CATALYST_FABRICATOR_SCALE, 6);
    expect(outZ).toBeGreaterThan(endRingOuterZ);
    // The product port reads violet, the family's output accent.
    const portMaterial = materialOf(outputPortMesh(scene)!);
    expect(portMaterial.emissive.b).toBeGreaterThan(portMaterial.emissive.r);
  });
});

describe("catalyst fabricator module envelope", () => {
  it("sits on the pad top rather than sinking through it", () => {
    const { scene } = build();
    expect(envelope(scene).minY).toBeGreaterThanOrEqual(-0.01);
  });

  it("stays inside the module height cap, taller than the low families", () => {
    const { scene } = build();
    const MODULE_HEIGHT_CAP = 0.34;
    const env = envelope(scene);
    expect(env.maxY).toBeLessThanOrEqual(MODULE_HEIGHT_CAP);
    // The canisters are what set the height, and they clear a low pod silhouette.
    expect(env.maxY).toBeGreaterThan(0.28);
  });

  it("publishes its height as the top of the feed canisters", () => {
    const { scene } = build();
    const env = envelope(scene);
    const published = CATALYST_FABRICATOR_MODULE_HEIGHT;
    expect(published).toBeGreaterThanOrEqual(env.maxY - 1e-9);
    expect(published).toBeCloseTo((CAT_CANISTER.y + CAT_CANISTER.length * 0.5) * CATALYST_FABRICATOR_SCALE, 6);
  });

  it("keeps the widest elevated part inside the AFC bay", () => {
    const { scene } = build();
    // The shared seat lip deliberately overhangs the bay, exactly as on every
    // other family, so it is skipped by parameter and checked on its own below.
    for (const mesh of instancedMeshes(scene)) {
      if (params(mesh).type === "TorusGeometry" && (params(mesh).parameters as { radius: number }).radius === 0.12) continue;
      expect(bounds(mesh).maxRadius).toBeLessThan(AFC_BAY_INNER_RADIUS);
    }
    // The far ends of the drum are what set this family's width.
    const ends = endRingMesh(scene)!;
    expect(bounds(ends).maxRadius).toBeLessThan(AFC_BAY_INNER_RADIUS);
    expect(bounds(ends).maxRadius).toBeGreaterThan(0.1);
  });

  it("docks on the same circular seat as the rest of the ring", () => {
    const { scene } = build();
    expect(bounds(baseMesh(scene)!).maxRadius).toBeCloseTo(0.105 * CATALYST_FABRICATOR_SCALE, 6);
    expect(CATALYST_FABRICATOR_BASE_RADIUS).toBeLessThan(AFC_BAY_INNER_RADIUS);
  });
});

describe("catalyst fabricator rotor", () => {
  it("sweeps the port arcs as time advances, and nothing else moves", () => {
    const { scene, overlay } = build();
    const windows = windowMeshes(scene);
    const before = windows.map((w) => w.instanceMatrix.array.slice());
    const staticBefore = [
      podMesh(scene)!.instanceMatrix.array.slice(),
      canisterMesh(scene)!.instanceMatrix.array.slice(),
      segmentMeshes(scene)[0]!.instanceMatrix.array.slice(),
      outputMesh(scene)!.instanceMatrix.array.slice()
    ];
    overlay.update(3000);
    const after = windows.map((w) => w.instanceMatrix.array.slice());
    const staticAfter = [
      podMesh(scene)!.instanceMatrix.array.slice(),
      canisterMesh(scene)!.instanceMatrix.array.slice(),
      segmentMeshes(scene)[0]!.instanceMatrix.array.slice(),
      outputMesh(scene)!.instanceMatrix.array.slice()
    ];
    // The rotor visibly moved.
    expect(after).not.toEqual(before);
    // The rest of the module is genuinely static: a mutation that rotates the
    // whole drum with the ports would be caught here.
    expect(staticAfter).toEqual(staticBefore);
  });

  it("points each arc at the rotor angle plus its own offset", () => {
    const { scene, overlay } = build();
    const t1 = 3200;
    overlay.update(t1);
    const windows = windowMeshes(scene);
    for (let i = 0; i < windows.length; i += 1) {
      const expected = CAT_DRUM_START_AZIMUTH + t1 * CAT_DRUM_SPEED_MS + CAT_WINDOW_OFFSET[i]!;
      expect(norm(arcAzimuth(windows[i]!, 0))).toBeCloseTo(norm(expected), 3);
    }
  });

  it("advances each arc by the drum speed between two frames", () => {
    const { scene, overlay } = build();
    const t1 = 3200;
    const t2 = 6400;
    overlay.update(t1);
    const before = windowMeshes(scene).map((w) => arcAzimuth(w, 0));
    overlay.update(t2);
    const after = windowMeshes(scene).map((w) => arcAzimuth(w, 0));
    for (let i = 0; i < 3; i += 1) {
      expect(norm(after[i]! - before[i]!)).toBeCloseTo((t2 - t1) * CAT_DRUM_SPEED_MS, 3);
    }
  });

  it("keeps the arcs riding horizontally on the drum while they sweep", () => {
    const { scene, overlay } = build();
    overlay.update(4000);
    for (const w of windowMeshes(scene)) {
      // The band's length axis must never pitch up or down — it rotates around
      // the drum, so it sweeps the horizontal plane but never leaves it.
      const axis = yAxisColumn(w, 0);
      expect(Math.abs(axis.y)).toBeLessThan(1e-6);
    }
    // And at build time (rotor at its start azimuth) the band lies cleanly on
    // the drum's Z axis, exactly as the construction checks expect.
    const staticScene = new Scene();
    const staticOverlay = createCatalystFabricatorModuleOverlay(staticScene, 1);
    staticOverlay.addInstance(0, 0, 0, 0, 0, 0);
    staticOverlay.commit();
    for (const w of windowMeshes(staticScene)) expect(cylinderLiesAlongZ(w, 0)).toBe(true);
    staticOverlay.dispose();
  });
});

describe("catalyst fabricator module lifecycle", () => {
  it("clears every slot including the rotor slots", () => {
    const { scene, overlay } = build(2);
    overlay.update(2500);
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

describe("catalyst fabricator docking", () => {
  it("spaces instances apart on the socket ring, and yaws each about its own dock point", () => {
    const { scene } = build(2);
    const pod = podMesh(scene)!;
    expect(pod.count).toBe(2);
    const a = translation(pod, 0);
    const b = translation(pod, 1);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(0.5, 6);
    // Asserting the pod's DISTANCE from the world origin proves nothing about a
    // folded origin: a rotation preserves that distance, so both a correct
    // composition and yaw·(origin + local) pass it. What distinguishes them is
    // a laterally offset part. The two outer canisters sit at local z = ±0.0433,
    // so they are exactly symmetric about the module's own centre line — and
    // their midpoint must therefore land on the socket itself. Fold the origin
    // and that midpoint lands on the SOCKET'S ROTATION instead, which is a
    // different point whenever yaw ≠ 0.
    const yawed = new Scene();
    const overlay = createCatalystFabricatorModuleOverlay(yawed, 1);
    overlay.addInstance(3, -2, 0, 1.1, 0, 0);
    overlay.commit();
    // The two canisters at the drum's ends sit at local z = ±0.0433, so they are
    // exactly symmetric about the module's own centre line — their midpoint must
    // land on the socket itself. (The third sits on the module's centre line.)
    const yawedCanisters = canisterMesh(yawed)!;
    expect((translation(yawedCanisters, 0).x + translation(yawedCanisters, 2).x) * 0.5).toBeCloseTo(3, 6);
    expect((translation(yawedCanisters, 0).z + translation(yawedCanisters, 2).z) * 0.5).toBeCloseTo(-2, 6);
  });

  it("docks on the real AFC socket ring without swinging off its socket", () => {
    const afcScene = new Scene();
    const afc = createFabricationComplexOverlay(afcScene, 1);
    const afcIndex = afc.addInstance(0, 0, 0, 4, 0);
    afc.commit();
    const attachment = afc.moduleSocketAttachments(afcIndex)[3]!;

    const scene = new Scene();
    const overlay = createCatalystFabricatorModuleOverlay(scene, 1);
    overlay.addInstance(attachment.x, attachment.z, attachment.y, attachment.yaw, 0, 0);
    overlay.commit();

    // The drum lies across the socket, and the pod's own origin is the socket
    // point — not the world origin pulled through the yaw.
    const pod = podMesh(scene)!;
    const podOrigin = translation(pod, 0);
    expect(Math.hypot(podOrigin.x, podOrigin.z)).toBeCloseTo(Math.hypot(attachment.x, attachment.z), 5);
    // Through a real dock yaw the barrel (local +Z) is no longer the WORLD Z
    // axis — it stays horizontal and runs tangential to the socket ring,
    // perpendicular to the socket's outward radial. A barrel that had swung
    // upright or wrapped around the core would fail both of these.
    const radial = new Vector3(attachment.x, 0, attachment.z).normalize();
    const barrelAxis = yAxisColumn(barrelMesh(scene)!, 0);
    expect(barrelAxis.y).toBeCloseTo(0, 5);
    expect(Math.abs(barrelAxis.dot(radial))).toBeLessThan(1e-6);
    const canisters = canisterMesh(scene)!;
    expect((translation(canisters, 0).x + translation(canisters, 2).x) * 0.5).toBeCloseTo(attachment.x, 5);
    expect((translation(canisters, 0).z + translation(canisters, 2).z) * 0.5).toBeCloseTo(attachment.z, 5);
  });
});
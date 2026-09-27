import { describe, expect, it } from "vitest";
import { CylinderGeometry, InstancedMesh, Matrix4, Scene, Vector3 } from "three";
import { AFC_BAY_INNER_RADIUS, createFabricationComplexOverlay } from "./client-map-3d-fabrication-complex.js";
import { MATTERWRIGHT_RETORT_BASE_RADIUS, MATTERWRIGHT_RETORT_MODULE_HEIGHT, MATTERWRIGHT_RETORT_SCALE, createMatterwrightRetortModuleOverlay } from "./client-map-3d-matterwright-retort-module.js";
import {
  bandMesh,
  bounds,
  condenserGlassMesh,
  condenserMesh,
  envelope,
  feedFunnelMesh,
  findByParams,
  insideRetort,
  instancedMeshes,
  params,
  pipeMesh,
  podMesh,
  retortMesh,
  seamMesh,
  spokeMesh,
  translation,
  valveStemMesh,
  valveWheelMesh,
  yAxisColumn,
  zAxisColumn
} from "./client-map-3d-matterwright-retort-inspect.js";

describe("matterwright retort overlay", () => {
  it("commits a fully assembled module with the retort dominant over the pod", () => {
    const scene = new Scene();
    const overlay = createMatterwrightRetortModuleOverlay(scene, 2);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const meshes = instancedMeshes(scene);
    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) {
      expect(mesh.count).toBeGreaterThan(0);
    }

    // One vessel, one seam, one valve, one feed port, one rear coupling.
    expect(retortMesh(scene)!.count).toBe(1);
    expect(seamMesh(scene)!.count).toBe(1);
    expect(bandMesh(scene, 0.083)!.count).toBe(1);
    expect(bandMesh(scene, 0.081)!.count).toBe(1);
    expect(valveWheelMesh(scene)!.count).toBe(1);
    expect(feedFunnelMesh(scene)!.count).toBe(1);
    // A handwheel with real spokes, not a bare hoop.
    expect(spokeMesh(scene)!.count).toBe(4);
    // Two condensers, each ringed foot and cap.
    expect(condenserMesh(scene)!.count).toBe(2);
    expect(condenserGlassMesh(scene)!.count).toBe(2);
    expect(bandMesh(scene, 0.0255)!.count).toBe(4);
    // Two short heavy process pipes.
    expect(pipeMesh(scene)!.count).toBe(2);

    overlay.dispose();
  });

  it("keeps every piece inside the shared dock envelope", () => {
    const scene = new Scene();
    const overlay = createMatterwrightRetortModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const { minY, maxY } = envelope(scene);
    // Nothing dips below the pad top.
    expect(minY).toBeGreaterThan(-0.005);
    // The dock envelope caps a module at 0.34 world units tall.
    expect(maxY).toBeLessThanOrEqual(0.34);
    expect(maxY).toBeCloseTo(MATTERWRIGHT_RETORT_MODULE_HEIGHT, 2);
    // The seat base seats inside the AFC bay. (The flat brass locking lip
    // overhangs the bay radius in every family — only the elevated parts have to
    // stay inside the clearance envelope, which the next check pins.)
    expect(MATTERWRIGHT_RETORT_BASE_RADIUS).toBeLessThan(AFC_BAY_INNER_RADIUS);

    // Every elevated part — vessel, valve, condensers — stays inside the bay's
    // clearance radius, so the raised silhouette never crowds a neighbouring
    // socket. The pod and the seat are measured against the pod's own radius.
    const podRadius = podMesh(scene) ? bounds(podMesh(scene)!).maxRadius : Infinity;
    for (const mesh of instancedMeshes(scene)) {
      if (mesh.count === 0) continue;
      const geo = params(mesh);
      const isSeatLip = geo.type === "TorusGeometry" && (geo.parameters as { radius: number }).radius === 0.12;
      if (isSeatLip) continue;
      const maxRadius = bounds(mesh).maxRadius;
      if (maxRadius <= podRadius + 1e-6) continue;
      expect(maxRadius).toBeLessThan(AFC_BAY_INNER_RADIUS);
    }

    overlay.dispose();
  });

  it("stands one oversized retort wider than the pod it is cast onto", () => {
    const scene = new Scene();
    const overlay = createMatterwrightRetortModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const retort = bounds(retortMesh(scene)!);
    const pod = bounds(podMesh(scene)!);

    // The vessel is the widest thing on the module — that is what makes it the
    // dominant read rather than the pod.
    expect(retort.maxRadius).toBeGreaterThan(pod.maxRadius);
    // The vessel's belly is buried in the pod crown, so it is cast onto the pod
    // instead of balanced on it.
    expect(retort.minY).toBeLessThan(pod.maxY);
    expect(retort.maxY).toBeGreaterThan(pod.maxY);
    // The pod is squashed hard: short and wide, keeping the shared 0.075
    // radius footprint every other family docks with.
    expect(pod.maxY - pod.minY).toBeLessThan(pod.maxRadius * 2);
    expect(pod.maxRadius).toBeCloseTo(0.075 * MATTERWRIGHT_RETORT_SCALE, 3);

    overlay.dispose();
  });

  it("wraps the reaction seam between two brass hoops at the vessel's waist", () => {
    const scene = new Scene();
    const overlay = createMatterwrightRetortModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const seam = seamMesh(scene)!;
    const lower = bandMesh(scene, 0.083)!;
    const upper = bandMesh(scene, 0.081)!;
    const retort = bounds(retortMesh(scene)!);

    // All three hoops circle the vessel horizontally, stacked in order.
    for (const mesh of [seam, lower, upper]) {
      const normal = zAxisColumn(mesh, 0);
      expect(Math.abs(normal.y)).toBeCloseTo(normal.length(), 5);
    }
    expect(lower.getMatrixAt(0, new Matrix4()));
    const lowerY = translation(lower, 0).y;
    const seamY = translation(seam, 0).y;
    const upperY = translation(upper, 0).y;
    expect(lowerY).toBeLessThan(seamY);
    expect(seamY).toBeLessThan(upperY);

    // The seam sits at the vessel's waist, between the hoops, and pokes proud of
    // the hull so its light is not swallowed by the vessel's own skin.
    const seamBounds = bounds(seam);
    expect(seamY).toBeCloseTo((retort.minY + retort.maxY) / 2, 2);
    expect(seamBounds.maxRadius).toBeGreaterThan(retort.maxRadius);

    overlay.dispose();
  });

  it("puts the bright violet light in the seam only, and the dimmer violet in the sight-glasses", () => {
    const scene = new Scene();
    const overlay = createMatterwrightRetortModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const emissive = (mesh: InstancedMesh | undefined): { hex: number; intensity: number } => {
      const mat = mesh!.material as unknown as { emissive: { getHex: () => number }; emissiveIntensity: number };
      return { hex: mat.emissive.getHex(), intensity: mat.emissiveIntensity };
    };

    // The waist seam is the one bright source in the module.
    const seamGlow = emissive(seamMesh(scene));
    expect(seamGlow.hex).not.toBe(0x000000);
    expect(seamGlow.intensity).toBeGreaterThan(2.5);
    // (MeshStandardMaterial defaults emissiveIntensity to 1 even with a black
    // emissive, so the emissive colour is what distinguishes a glowing piece.)
    // The porthole and the two condenser sight-glasses reuse the dimmer violet.
    const windowGlow = emissive(findByParams(scene, (geo) => geo.type === "CylinderGeometry" && (geo.parameters as { height: number }).height === 0.004));
    expect(windowGlow.hex).not.toBe(0x000000);
    expect(windowGlow.hex).not.toBe(seamGlow.hex);
    expect(windowGlow.intensity).toBeLessThan(seamGlow.intensity);
    const glassGlow = emissive(condenserGlassMesh(scene));
    expect(glassGlow.hex).toBe(windowGlow.hex);

    // The vessel's own skin and its brass hoops carry no glow at all: this is a
    // pressure still, not an emitter.
    expect(emissive(retortMesh(scene)).hex).toBe(0x000000);
    expect(emissive(bandMesh(scene, 0.083)).hex).toBe(0x000000);
    expect(emissive(valveWheelMesh(scene)).hex).toBe(0x000000);

    overlay.dispose();
  });

  it("runs each process pipe from the vessel's flank down into a condenser cap", () => {
    const scene = new Scene();
    const overlay = createMatterwrightRetortModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const pipes = pipeMesh(scene)!;
    const retort = retortMesh(scene)!;
    expect(pipes.count).toBe(2);

    for (let i = 0; i < pipes.count; i += 1) {
      // translation() is the rod's midpoint: walk out to both tips.
      const mid = translation(pipes, i);
      const axis = yAxisColumn(pipes, i);
      const half = axis.length() / 2;
      const dir = axis.clone().normalize();
      const start = mid.clone().addScaledVector(dir, -half);
      const end = mid.clone().addScaledVector(dir, half);
      // One end is seated in the vessel's hull, the other breaks its cap.
      expect(insideRetort(retort, start)).toBe(true);
      expect(insideRetort(retort, end)).toBe(false);
      // It leaves the vessel low and to one side, then drops into the tank.
      expect(Math.abs(start.z)).toBeGreaterThan(Math.abs(start.x));
      expect(end.z * start.z).toBeGreaterThan(0);
      expect(end.y).toBeLessThan(start.y);
      // Short and heavy, not a sprawling pipe run.
      expect(axis.length()).toBeLessThan(0.06 * MATTERWRIGHT_RETORT_SCALE);
    }

    // Both tanks stand on the pod's shoulders, to either side and below the
    // vessel's waist, so the vessel keeps the silhouette's top note.
    const tanks = condenserMesh(scene)!;
    for (let i = 0; i < tanks.count; i += 1) {
      const centre = translation(tanks, i);
      expect(Math.abs(centre.z)).toBeGreaterThan(centre.x);
      expect(centre.y).toBeLessThan(bounds(retort).maxY);
    }
    expect(tanks.count).toBe(2);
    expect(translation(tanks, 0).z * translation(tanks, 1).z).toBeLessThan(0);

    overlay.dispose();
  });

  it("seats the valve handwheel clear of the vessel on its stem, as the module's high point", () => {
    const scene = new Scene();
    const overlay = createMatterwrightRetortModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const stem = valveStemMesh(scene)!;
    const wheel = valveWheelMesh(scene)!;
    const retort = retortMesh(scene)!;
    const mount = translation(stem, 0);
    const hub = translation(wheel, 0);

    // The stem starts on the vessel's own skin.
    expect(insideRetort(retort, mount.clone().addScaledVector(yAxisColumn(stem, 0).clone().normalize(), -yAxisColumn(stem, 0).length() / 2))).toBe(true);
    // The wheel rides beyond the stem's far end, so it stands clear of the hull.
    expect(hub.distanceTo(mount)).toBeGreaterThan(yAxisColumn(stem, 0).length() * 0.9);
    // The wheel's hole faces along the stem.
    const stemDir = yAxisColumn(stem, 0).clone().normalize();
    const wheelNormal = zAxisColumn(wheel, 0).clone().normalize();
    expect(Math.abs(wheelNormal.dot(stemDir))).toBeCloseTo(1, 3);
    // The spokes lie in the wheel's own plane, so the handwheel reads as a
    // handwheel rather than a bare hoop.
    for (let i = 0; i < spokeMesh(scene)!.count; i += 1) {
      const spoke = yAxisColumn(spokeMesh(scene)!, i).clone().normalize();
      expect(Math.abs(spoke.dot(wheelNormal))).toBeCloseTo(0, 3);
    }
    // Angled up and out, and the highest point on the whole module.
    expect(stemDir.y).toBeGreaterThan(0);
    expect(stemDir.x).toBeGreaterThan(0);
    let highest = -Infinity;
    for (const mesh of instancedMeshes(scene)) {
      if (mesh.count > 0) highest = Math.max(highest, bounds(mesh).maxY);
    }
    expect(bounds(wheel).maxY).toBeGreaterThan(bounds(retort).maxY);
    expect(highest).toBeCloseTo(bounds(wheel).maxY, 5);

    overlay.dispose();
  });

  it("angles the reinforced feed port down and forward off the vessel", () => {
    const scene = new Scene();
    const overlay = createMatterwrightRetortModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const funnel = feedFunnelMesh(scene)!;
    const axis = yAxisColumn(funnel, 0).clone().normalize();
    // The funnel keeps its baked height: its real length is the geometry height
    // times the Y scale the matrix carries. Stretching a baked-height piece along
    // a direction with a unit-rod helper would scale that height by itself and
    // crush the intake flat, so pin the length explicitly.
    const funnelLength = (funnel.geometry as CylinderGeometry).parameters.height! * yAxisColumn(funnel, 0).length();
    expect(funnelLength).toBeCloseTo(0.026 * MATTERWRIGHT_RETORT_SCALE, 5);
    // The mouth faces forward and down, so raw material is fed in low on the
    // front of the vessel.
    expect(axis.x).toBeGreaterThan(0.5);
    expect(axis.y).toBeLessThan(-0.2);
    expect(Math.abs(axis.z)).toBeLessThan(Math.abs(axis.x));

    // The funnel is buried at its throat in the vessel's hull, and its mouth
    // stands clear of it. The funnel keeps its baked 0.026 height, so its half
    // length is half of that, grown by the family scale.
    const retort = retortMesh(scene)!;
    const half = 0.013 * MATTERWRIGHT_RETORT_SCALE;
    const throat = translation(funnel, 0).clone().addScaledVector(axis, -half);
    expect(insideRetort(retort, throat)).toBe(true);
    const mouth = translation(funnel, 0).clone().addScaledVector(axis, half);
    expect(insideRetort(retort, mouth)).toBe(false);

    // The beaded rim rings the mouth, and the brace lands the port on the pod.
    const rim = bandMesh(scene, 0.021)!;
    expect(rim.count).toBe(1);
    expect(translation(rim, 0).distanceTo(mouth)).toBeLessThan(0.006 * MATTERWRIGHT_RETORT_SCALE);
    const stub = findByParams(scene, (geo) => geo.type === "CylinderGeometry" && (geo.parameters as { height: number }).height === 1 && (geo.parameters as { radiusTop: number }).radiusTop === 0.006)!;
    const stubAxis = yAxisColumn(stub, 0);
    const stubEnds = [translation(stub, 0).clone().addScaledVector(stubAxis.clone().normalize(), -stubAxis.length() / 2), translation(stub, 0).clone().addScaledVector(stubAxis.clone().normalize(), stubAxis.length() / 2)];
    // Its foot is down on the pod crown, well below the port's mouth.
    expect(Math.min(...stubEnds.map((end) => end.y))).toBeLessThan(mouth.y - 0.01);

    overlay.dispose();
  });

  it("docks on the real AFC socket ring without swinging off its socket", () => {
    // Yaw must turn the module about its OWN dock point. Folding the dock
    // origin into the rotation instead swings the whole module around the world
    // origin, which on a real socket ring lands each module most of a bay away
    // from the socket it was handed.
    const scene = new Scene();
    const afc = createFabricationComplexOverlay(scene, 1);
    const afcIndex = afc.addInstance(0, 0, 0, 0, 0);
    afc.commit();
    const attachments = afc.moduleSocketAttachments(afcIndex);
    expect(attachments.length).toBeGreaterThan(4);

    const overlay = createMatterwrightRetortModuleOverlay(scene, attachments.length);
    for (const attachment of attachments) {
      overlay.addInstance(attachment.x, attachment.z, attachment.y, attachment.yaw, 0, 0);
    }
    overlay.commit();

    // The vessel stands on the module's axis, so it sits dead over its socket's
    // own axis — raised by its own height, but never swung off the pad.
    const vessel = retortMesh(scene)!;
    attachments.forEach((attachment, i) => {
      const centre = translation(vessel, i);
      expect(Math.hypot(centre.x - attachment.x, centre.z - attachment.z)).toBeCloseTo(0, 5);
      expect(centre.y).toBeGreaterThan(attachment.y);
    });

    // The feed port is the module's forward end, so it points outboard along
    // the socket's own radial — never toward a different socket. It sits on the
    // vessel's curved flank, so it is aimed a little off the centreline; what
    // matters is that it stays within a modest angle of its own radial.
    const funnel = feedFunnelMesh(scene)!;
    attachments.forEach((attachment, i) => {
      const offset = translation(funnel, i).sub(new Vector3(attachment.x, attachment.y, attachment.z));
      const radial = Math.hypot(offset.x, offset.z);
      expect(radial).toBeGreaterThan(0.05 * MATTERWRIGHT_RETORT_SCALE);
      const dot = (offset.x * Math.cos(attachment.yaw) + offset.z * Math.sin(attachment.yaw)) / radial;
      expect(Math.acos(Math.min(1, Math.max(-1, dot)))).toBeLessThan(0.35);
    });

    afc.dispose();
    overlay.dispose();
  });

  it("rotates the whole module with the socket yaw", () => {
    const scene = new Scene();
    const overlay = createMatterwrightRetortModuleOverlay(scene, 2);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.addInstance(6, -3, 0, Math.PI / 2, 0, 0);
    overlay.commit();

    const funnel = feedFunnelMesh(scene)!;
    // Instance 0 is unyawed, so the feed port sits out to the front (+X); a
    // +90° socket yaw carries it onto +Z. The port is deliberately angled a
    // little off the module's centreline, so the assertions compare horizontal
    // DIRECTION, not an exact axis. Each port is measured against its own
    // module's dock origin, so this is about the module's yaw and not the
    // socket's world position.
    const forward = translation(funnel, 0);
    const forwardYawed = translation(funnel, 1).sub(new Vector3(6, 0, -3));
    const unyawedRadial = Math.hypot(forward.x, forward.z);
    const yawedRadial = Math.hypot(forwardYawed.x, forwardYawed.z);
    expect(unyawedRadial).toBeGreaterThan(0.05 * MATTERWRIGHT_RETORT_SCALE);
    expect(yawedRadial).toBeGreaterThan(0.05 * MATTERWRIGHT_RETORT_SCALE);
    // Out front (+X) when unyawed, and onto +Z after a +90° socket yaw, each to
    // within the port's designed off-centreline angle.
    expect(Math.acos(Math.min(1, forward.x / unyawedRadial))).toBeLessThan(0.35);
    expect(Math.acos(Math.min(1, forwardYawed.z / yawedRadial))).toBeLessThan(0.35);
    // A +90° socket yaw carries the port off +X and onto +Z, by the same
    // horizontal distance it had before.
    expect(forwardYawed.x).toBeCloseTo(0, 1);
    expect(Math.abs(forwardYawed.z)).toBeCloseTo(unyawedRadial, 1);

    // The condensers keep their pair on either side of the vessel, and the
    // pair's separation axis turns with the socket: unyawed it runs along Z,
    // after a +90° yaw it runs along X.
    const tanks = condenserMesh(scene)!;
    const unyawed = [translation(tanks, 0), translation(tanks, 1)];
    expect(unyawed[0]!.z * unyawed[1]!.z).toBeLessThan(0);
    expect(Math.abs(unyawed[0]!.z)).toBeGreaterThan(Math.abs(unyawed[0]!.x));
    // Both pairs are measured against their own module's dock origin, so this is
    // about the module's yaw and not where the module happens to stand.
    const secondOrigin = new Vector3(6, 0, -3);
    const yawed = [translation(tanks, 2).sub(secondOrigin), translation(tanks, 3).sub(secondOrigin)];
    expect(yawed[0]!.x * yawed[1]!.x).toBeLessThan(0);
    expect(Math.abs(yawed[0]!.x)).toBeGreaterThan(Math.abs(yawed[0]!.z));
    // The pair stays the same distance apart — yaw is rigid.
    expect(yawed[0]!.distanceTo(yawed[1]!)).toBeCloseTo(unyawed[0]!.distanceTo(unyawed[1]!), 5);

    // The module's own geometry is rigid under yaw: the vessel stays over its
    // dock point (raised by its own height, which yaw does not change) and
    // keeps its Y squash.
    const vessel = retortMesh(scene)!;
    const first = translation(vessel, 0);
    const second = translation(vessel, 1).sub(secondOrigin);
    expect(Math.hypot(first.x, first.z)).toBeCloseTo(0, 5);
    expect(Math.hypot(second.x, second.z)).toBeCloseTo(0, 5);
    expect(second.y - first.y).toBeCloseTo(0, 5);
    const squashA = yAxisColumn(vessel, 0).length();
    const squashB = yAxisColumn(vessel, 1).length();
    expect(squashB).toBeCloseTo(squashA, 5);
    // The vessel is squashed well below the sphere's own Y radius, which is what
    // lets the oversized chamber fit under the dock height cap.
    expect(squashA).toBeLessThan(0.6 * MATTERWRIGHT_RETORT_SCALE + 1e-6);

    overlay.dispose();
  });

  it("keeps the retort static on update (no idle animation)", () => {
    const scene = new Scene();
    const overlay = createMatterwrightRetortModuleOverlay(scene, 1);

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
    const overlay = createMatterwrightRetortModuleOverlay(scene, 2);

    expect(overlay.addInstance(0, 0, 0, 0, 0, 0)).toBe(0);
    expect(overlay.addInstance(4, 4, 0, 0.4, 0, 0)).toBe(1);
    expect(overlay.addInstance(8, 8, 0, 0.8, 0, 0)).toBe(-1);
    overlay.commit();
    expect(retortMesh(scene)!.count).toBe(2);
    expect(condenserMesh(scene)!.count).toBe(4);
    expect(spokeMesh(scene)!.count).toBe(8);

    overlay.clear();
    overlay.commit();
    for (const mesh of instancedMeshes(scene)) {
      expect(mesh.count).toBe(0);
    }

    overlay.dispose();
    expect(scene.children.filter((child) => child instanceof InstancedMesh)).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { CylinderGeometry, IcosahedronGeometry, InstancedMesh, OctahedronGeometry, Scene, TorusGeometry } from "three";
import {
  AFC_BAY_INNER_RADIUS,
  AFC_MODULE_DOCK_HEIGHT,
  AFC_SOCKET_COUNT,
  AFC_SOCKET_RING_RADIUS,
  createFabricationComplexOverlay
} from "./client-map-3d-fabrication-complex.js";

const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

const coreMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "IcosahedronGeometry" &&
      (mesh.geometry as IcosahedronGeometry).parameters.radius === 0.13
  );

const dotMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "OctahedronGeometry" &&
      (mesh.geometry as OctahedronGeometry).parameters.radius === 0.022
  );

const socketRingMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "CylinderGeometry" &&
      (mesh.geometry as CylinderGeometry).parameters.radiusTop === 0.16 &&
      (mesh.geometry as CylinderGeometry).parameters.openEnded === true
  );

describe("fabrication complex overlay", () => {
  it("commits a fully assembled AFC with visible pieces", () => {
    const scene = new Scene();
    const overlay = createFabricationComplexOverlay(scene, 3);

    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.addInstance(0, 0, 0, 1, 0);
    overlay.commit();

    const renderedPieces = instancedMeshes(scene).reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBeGreaterThan(0);

    const socketRing = socketRingMesh(scene);
    expect(socketRing).toBeDefined();
    // 2 instances × 8 identical socket rings each.
    expect(socketRing!.count).toBe(2 * AFC_SOCKET_COUNT);

    overlay.dispose();
  });

  it("clears instance counts without removing meshes from the scene", () => {
    const scene = new Scene();
    const overlay = createFabricationComplexOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.commit();
    overlay.clear();
    overlay.commit();

    const renderedPieces = instancedMeshes(scene).reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBe(0);
    expect(instancedMeshes(scene).length).toBeGreaterThan(0);

    overlay.dispose();
  });

  it("does not allocate instance capacity proportional to per-tile piece count", () => {
    // The AFC emits 70 pieces per instance (central printer, 8 sockets,
    // cables and 4 arms); caps are sized to that worst case and stay far
    // under a 64MB budget even for a fully stocked viewport.
    const scene = new Scene();
    const overlay = createFabricationComplexOverlay(scene, 14_000);

    const totalBytes = instancedMeshes(scene).reduce(
      (total, mesh) => total + mesh.instanceMatrix.array.length * 4,
      0
    );
    expect(totalBytes).toBeLessThan(64 * 1024 * 1024);

    overlay.dispose();
  });

  it("uploads only the instances actually used, not the whole buffer", () => {
    const scene = new Scene();
    const overlay = createFabricationComplexOverlay(scene, 14_000);

    overlay.addInstance(0, 0, 0, 5, 5);
    overlay.commit();

    const drawn = instancedMeshes(scene).filter((mesh) => mesh.count > 0);
    expect(drawn.length).toBeGreaterThan(0);
    for (const mesh of drawn) {
      const ranges = mesh.instanceMatrix.updateRanges;
      expect(ranges).toHaveLength(1);
      expect(ranges[0]).toEqual({ start: 0, count: mesh.count * 16 });
      expect(ranges[0]!.count).toBeLessThan(mesh.instanceMatrix.array.length);
    }

    overlay.dispose();
  });

  it("breathes the core and orbits chamber emitters on update with a partial upload", () => {
    const scene = new Scene();
    const overlay = createFabricationComplexOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 3, 7);
    overlay.commit();

    const core = coreMesh(scene);
    const dot = dotMesh(scene);
    expect(core).toBeDefined();
    expect(core!.count).toBe(1);
    expect(dot).toBeDefined();
    expect(dot!.count).toBe(2);

    const coreBefore = Array.from(core!.instanceMatrix.array.slice(0, 16));
    const dotBefore = Array.from(dot!.instanceMatrix.array.slice(0, 32));
    overlay.update(1000);
    const coreAfter = Array.from(core!.instanceMatrix.array.slice(0, 16));
    const dotAfter = Array.from(dot!.instanceMatrix.array.slice(0, 32));

    expect(coreAfter).not.toEqual(coreBefore);
    expect(dotAfter).not.toEqual(dotBefore);
    expect(core!.count).toBe(1);

    for (const mesh of [core!, dot!]) {
      const ranges = mesh.instanceMatrix.updateRanges;
      expect(ranges).toHaveLength(1);
      expect(ranges[0]!.count).toBe(mesh.count * 16);
      expect(ranges[0]!.count).toBeLessThan(mesh.instanceMatrix.array.length);
      expect(mesh.instanceMatrix.version).toBeGreaterThan(0);
    }

    overlay.dispose();
  });

  it("breathes factories on different tiles out of phase", () => {
    const scene = new Scene();
    const overlay = createFabricationComplexOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 3, 7);
    overlay.addInstance(5, 0, 0, 11, 1);
    overlay.commit();
    overlay.update(1000);

    const core = coreMesh(scene);
    expect(core).toBeDefined();
    expect(core!.count).toBe(2);
    const factoryOne = Array.from(core!.instanceMatrix.array.slice(0, 16));
    const factoryTwo = Array.from(core!.instanceMatrix.array.slice(16, 32));
    expect(factoryOne).not.toEqual(factoryTwo);

    overlay.dispose();
  });

  it("exposes eight common attachment points on a 45-degree ring", () => {
    const scene = new Scene();
    const overlay = createFabricationComplexOverlay(scene, 2);

    overlay.addInstance(10, 25, 2, 3, 7);
    const attachments = overlay.moduleSocketAttachments(0);

    expect(attachments).toHaveLength(AFC_SOCKET_COUNT);
    for (const point of attachments) {
      const radialX = point.x - 10;
      const radialZ = point.z - 25;
      const radius = Math.hypot(radialX, radialZ);
      expect(radius).toBeCloseTo(AFC_SOCKET_RING_RADIUS, 6);
      expect(point.y).toBeCloseTo(2 + AFC_MODULE_DOCK_HEIGHT, 6);
      expect(point.bayInnerRadius).toBe(AFC_BAY_INNER_RADIUS);
    }

    const sorted = [...attachments].sort((a, b) => a.yaw - b.yaw);
    for (let k = 1; k < sorted.length; k += 1) {
      expect(sorted[k]!.yaw - sorted[k - 1]!.yaw).toBeCloseTo(Math.PI / 4, 6);
    }
    // Identical geometry for every socket means identical bay inner radius.
    expect(new Set(attachments.map((a) => a.bayInnerRadius)).size).toBe(1);

    overlay.dispose();
  });

  it("shifts attachment points with the instance center and rejects bad indices", () => {
    const scene = new Scene();
    const overlay = createFabricationComplexOverlay(scene, 2);

    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.addInstance(3, -2, 1, 4, 9);

    const first = overlay.moduleSocketAttachments(0);
    const second = overlay.moduleSocketAttachments(1);
    expect(first[0]!.x).toBeCloseTo(AFC_SOCKET_RING_RADIUS, 6);
    expect(first[0]!.z).toBeCloseTo(0, 6);
    expect(second[0]!.x).toBeCloseTo(3 + AFC_SOCKET_RING_RADIUS, 6);
    expect(second[0]!.z).toBeCloseTo(-2, 6);

    expect(overlay.moduleSocketAttachments(-1)).toEqual([]);
    expect(overlay.moduleSocketAttachments(2)).toEqual([]);

    overlay.dispose();
  });

  it("sizes the transparent chamber and brass collar geometry for one per instance", () => {
    const scene = new Scene();
    const overlay = createFabricationComplexOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.commit();

    const chamber = instancedMeshes(scene).find(
      (mesh) => mesh.geometry.type === "CylinderGeometry" && (mesh.geometry as CylinderGeometry).parameters.openEnded === true && (mesh.geometry as CylinderGeometry).parameters.radiusTop === 0.3
    );
    expect(chamber).toBeDefined();
    expect(chamber!.count).toBe(1);
    expect((chamber!.material as { transparent?: boolean }).transparent).toBe(true);

    const collar = instancedMeshes(scene).find(
      (mesh) =>
        mesh.geometry.type === "TorusGeometry" &&
        (mesh.geometry as TorusGeometry).parameters.radius === 0.16
    );
    expect(collar).toBeDefined();
    expect(collar!.count).toBe(AFC_SOCKET_COUNT);

    overlay.dispose();
  });
});
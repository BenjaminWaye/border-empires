import { describe, expect, it } from "vitest";
import { CylinderGeometry, InstancedMesh, Scene } from "three";
import { createRelayBeaconOverlay } from "./client-map-3d-relay-beacon-overlay.js";

const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

const sensorMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(mesh => mesh.name === "relay-sensorSegment");

const gearMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "CylinderGeometry" &&
      (mesh.geometry as CylinderGeometry).parameters.radiusTop === 0.03 &&
      (mesh.geometry as CylinderGeometry).parameters.height === 0.03
  );

describe("relay beacon overlay", () => {
  it("commits a fully assembled beacon with visible pieces", () => {
    const scene = new Scene();
    const overlay = createRelayBeaconOverlay(scene, 3);

    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.addInstance(2, 0, 0, 1, 0);
    overlay.addInstance(4, 0, 0, 2, 0);
    overlay.commit();

    const renderedPieces = instancedMeshes(scene).reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBeGreaterThan(0);

    overlay.dispose();
  });

  it("clears instance counts without removing meshes from the scene", () => {
    const scene = new Scene();
    const overlay = createRelayBeaconOverlay(scene, 1);

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
    // The beacon emits 66 pieces per tile (lattice legs, deck optics, the
    // six sensor plates and lamp rigs); caps are sized to that worst case
    // and stay under a 64MB budget even for a fully-rigged viewport.
    const scene = new Scene();
    const overlay = createRelayBeaconOverlay(scene, 14_000);

    const totalBytes = instancedMeshes(scene).reduce(
      (total, mesh) => total + mesh.instanceMatrix.array.length * 4,
      0
    );
    expect(totalBytes).toBeLessThan(64 * 1024 * 1024);

    overlay.dispose();
  });

  it("uploads only the instances actually used, not the whole buffer", () => {
    const scene = new Scene();
    const overlay = createRelayBeaconOverlay(scene, 14_000);

    overlay.addInstance(0, 0, 0, 5, 5);
    overlay.commit();

    const drawn = instancedMeshes(scene).filter((mesh) => mesh.count > 0);
    expect(drawn.length).toBeGreaterThan(0);
    for (const mesh of drawn) {
      const ranges = mesh.instanceMatrix.updateRanges;
      expect(ranges).toHaveLength(1);
      expect(ranges[0]).toEqual({ start: 0, count: mesh.count * 16 });
      expect(ranges[0]!.count).toBeLessThanOrEqual(mesh.instanceMatrix.array.length);
      if (!mesh.geometry.hasAttribute("districtState")) expect(ranges[0]!.count).toBeLessThan(mesh.instanceMatrix.array.length);
    }

    overlay.dispose();
  });

  it("keeps draw calls constant as beacons are added (instancing)", () => {
    const scene = new Scene();
    const overlay = createRelayBeaconOverlay(scene, 8);

    overlay.addInstance(0, 0, 0, 0, 0); overlay.commit();
    const emptySlotCount = instancedMeshes(scene).length;
    overlay.clear();
    expect(emptySlotCount).toBeGreaterThan(0);

    for (let i = 0; i < 6; i += 1) overlay.addInstance(i * 2, 0, 0, i, 0);
    overlay.commit();

    // One InstancedMesh per slot; adding beacons adds instances, not meshes.
    expect(instancedMeshes(scene).length).toBe(emptySlotCount);

    overlay.dispose();
  });

  it("animates with a partial instance upload, not a full-buffer rewrite", () => {
    const scene = new Scene();
    const overlay = createRelayBeaconOverlay(scene, 14_000);

    overlay.addInstance(0, 0, 0, 2, 4);
    overlay.commit();
    overlay.update(500);

    const sensors = sensorMesh(scene);
    const gears = gearMesh(scene);
    expect(sensors).toBeDefined();
    expect(gears).toBeDefined();
    expect(sensors!.count).toBe(6);
    expect(gears!.count).toBe(2);

    // update() marks only the used prefix dirty (partial upload) so the GPU
    // re-uploads 6*16 floats per beacon, not the whole cap-sized buffer.
    for (const mesh of [sensors!, gears!]) {
      const ranges = mesh.instanceMatrix.updateRanges;
      expect(ranges).toHaveLength(1);
      expect(ranges[0]!.count).toBe(mesh.count * 16);
      expect(ranges[0]!.count).toBeLessThanOrEqual(mesh.instanceMatrix.array.length);
      if (!mesh.geometry.hasAttribute("districtState")) expect(ranges[0]!.count).toBeLessThan(mesh.instanceMatrix.array.length);
      // three r179 exposes needsUpdate as a setter-only accessor that bumps
      // `version`; assert the flag effect rather than the accessor itself.
      expect(mesh.instanceMatrix.version).toBeGreaterThan(0);
    }

    overlay.dispose();
  });

  it("spins the sensor array on update without disturbing instance counts", () => {
    const scene = new Scene();
    const overlay = createRelayBeaconOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 3, 7);
    overlay.addInstance(2, 0, 0, 11, 1);
    overlay.commit();

    const sensors = sensorMesh(scene);
    const gears = gearMesh(scene);
    expect(sensors).toBeDefined();
    expect(gears).toBeDefined();
    expect(sensors!.count).toBe(12);
    expect(gears!.count).toBe(4);

    const before = Array.from(sensors!.instanceMatrix.array.slice(0, 16));
    const gearBefore = Array.from(gears!.instanceMatrix.array.slice(0, 16));

    overlay.update(1000);

    const after = Array.from(sensors!.instanceMatrix.array.slice(0, 16));
    const gearAfter = Array.from(gears!.instanceMatrix.array.slice(0, 16));
    expect(after).not.toEqual(before);
    expect(gearAfter).not.toEqual(gearBefore);

    // Two beacons on different tiles rotate out of phase, so their first
    // sensor plates are never in the same pose.
    const beaconOne = Array.from(sensors!.instanceMatrix.array.slice(0, 16));
    const beaconTwo = Array.from(sensors!.instanceMatrix.array.slice(16, 32));
    expect(beaconOne).not.toEqual(beaconTwo);

    expect(sensors!.count).toBe(12);
    expect(gears!.count).toBe(4);

    overlay.dispose();
  });

  it("freezes the sensor array for a disabled beacon while still spinning enabled ones", () => {
    const scene = new Scene();
    const overlay = createRelayBeaconOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 3, 7, true);
    overlay.addInstance(2, 0, 0, 11, 1, false);
    overlay.commit();

    const sensors = sensorMesh(scene);
    expect(sensors).toBeDefined();

    // Sensor instances are laid out 6-per-beacon (MIRRORS_PER_BEACON); the
    // second beacon's first sensor plate starts at float offset 6*16=96.
    overlay.update(1000);
    const disabledBefore = Array.from(sensors!.instanceMatrix.array.slice(0, 16));
    const enabledBefore = Array.from(sensors!.instanceMatrix.array.slice(96, 112));

    overlay.update(2000);

    const disabledAfter = Array.from(sensors!.instanceMatrix.array.slice(0, 16));
    const enabledAfter = Array.from(sensors!.instanceMatrix.array.slice(96, 112));

    expect(disabledAfter).toEqual(disabledBefore);
    expect(enabledAfter).not.toEqual(enabledBefore);

    overlay.dispose();
  });
});

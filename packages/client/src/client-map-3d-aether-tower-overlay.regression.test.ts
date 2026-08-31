import { describe, expect, it } from "vitest";
import { CylinderGeometry, IcosahedronGeometry, InstancedMesh, Scene, SphereGeometry, TorusGeometry } from "three";
import { createAetherTowerOverlay } from "./client-map-3d-aether-tower-overlay.js";

const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

const meshOf = (scene: Scene, predicate: (mesh: InstancedMesh) => boolean): InstancedMesh | undefined =>
  instancedMeshes(scene).find(predicate);

const ringMesh = (scene: Scene, radius: number): InstancedMesh | undefined =>
  meshOf(
    scene,
    (mesh) =>
      mesh.geometry.type === "TorusGeometry" &&
      (mesh.geometry as TorusGeometry).parameters.radius === radius
  );

const icosaMesh = (scene: Scene, radius: number): InstancedMesh | undefined =>
  meshOf(
    scene,
    (mesh) =>
      mesh.geometry.type === "IcosahedronGeometry" &&
      (mesh.geometry as IcosahedronGeometry).parameters.radius === radius
  );

const sphereMesh = (scene: Scene, radius: number): InstancedMesh | undefined =>
  meshOf(
    scene,
    (mesh) =>
      mesh.geometry.type === "SphereGeometry" &&
      (mesh.geometry as SphereGeometry).parameters.radius === radius
  );

const towerRings = (scene: Scene): InstancedMesh | undefined => ringMesh(scene, 0.31);
const linkNodes = (scene: Scene): InstancedMesh | undefined => icosaMesh(scene, 0.026);
const linkTravelers = (scene: Scene): InstancedMesh | undefined => icosaMesh(scene, 0.03);
const clusterRings = (scene: Scene): InstancedMesh | undefined => ringMesh(scene, 0.44);
const nexusHalos = (scene: Scene): InstancedMesh | undefined => sphereMesh(scene, 0.225);

// Three towers inside the 2.7-unit link radius: they peer into a full
// triangle (3 links) which is large enough to anchor one synchronization
// cluster at the centroid.
const addLinkedTrio = (overlay: { readonly addInstance: (x: number, z: number, y: number, tx: number, tz: number) => void }): void => {
  overlay.addInstance(0, 0, 0, 0, 0);
  overlay.addInstance(1.2, 0, 0, 3, 1);
  overlay.addInstance(0.6, 1.04, 0, 1, 5);
};

describe("aether tower overlay", () => {
  it("commits a linked trio with bridges and a synchronization cluster", () => {
    const scene = new Scene();
    const overlay = createAetherTowerOverlay(scene, 3);

    addLinkedTrio(overlay);
    overlay.commit();

    const renderedPieces = instancedMeshes(scene).reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBeGreaterThan(0);

    const rings = towerRings(scene);
    expect(rings).toBeDefined();
    expect(rings!.count).toBe(9);

    // Full triangle: three link conduits, three nodes + three pulses each.
    expect(linkNodes(scene)!.count).toBe(9);
    expect(linkTravelers(scene)!.count).toBe(9);
    expect(clusterRings(scene)!.count).toBe(1);

    overlay.dispose();
  });

  it("keeps a solo tower network-free but fully built", () => {
    const scene = new Scene();
    const overlay = createAetherTowerOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.commit();

    expect(towerRings(scene)!.count).toBe(3);
    expect(linkNodes(scene)!.count).toBe(0);
    expect(linkTravelers(scene)!.count).toBe(0);
    expect(clusterRings(scene)!.count).toBe(0);
    // The nexus halo scales to zero alongside the rest of the synchronized
    // nexus assembly (nexusRing/nexusRingNode/nexusGlow) -- it must not be
    // written for a tower with no network to belong to.
    expect(nexusHalos(scene)!.count).toBe(0);

    overlay.dispose();
  });

  it("does not link towers beyond the conduit radius", () => {
    const scene = new Scene();
    const overlay = createAetherTowerOverlay(scene, 2);

    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.addInstance(6, 0, 0, 9, 4);
    overlay.commit();

    expect(towerRings(scene)!.count).toBe(6);
    expect(linkNodes(scene)!.count).toBe(0);
    expect(linkTravelers(scene)!.count).toBe(0);

    overlay.dispose();
  });

  it("clears instance counts without removing meshes from the scene", () => {
    const scene = new Scene();
    const overlay = createAetherTowerOverlay(scene, 1);

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
    // Each tower emits ~61 static pieces and the graph bounds links/clusters,
    // so a maxTiles request far beyond a real map still leaves a small budget.
    const scene = new Scene();
    const overlay = createAetherTowerOverlay(scene, 14_000);

    const totalBytes = instancedMeshes(scene).reduce(
      (total, mesh) => total + mesh.instanceMatrix.array.length * 4,
      0
    );
    expect(totalBytes).toBeLessThan(64 * 1024 * 1024);

    overlay.dispose();
  });

  it("uploads only the instances actually used, not the whole buffer", () => {
    const scene = new Scene();
    const overlay = createAetherTowerOverlay(scene, 14_000);

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

  it("animates with a partial instance upload, not a full-buffer rewrite", () => {
    const scene = new Scene();
    const overlay = createAetherTowerOverlay(scene, 14_000);

    addLinkedTrio(overlay);
    overlay.commit();
    overlay.update(500);

    const travelers = linkTravelers(scene);
    const nodes = linkNodes(scene);
    expect(travelers!.count).toBe(9);
    expect(nodes!.count).toBe(9);

    for (const mesh of [travelers!, nodes!]) {
      const ranges = mesh.instanceMatrix.updateRanges;
      expect(ranges).toHaveLength(1);
      expect(ranges[0]!.count).toBe(mesh.count * 16);
      expect(ranges[0]!.count).toBeLessThan(mesh.instanceMatrix.array.length);
      expect(mesh.instanceMatrix.version).toBeGreaterThan(0);
    }

    overlay.dispose();
  });

  it("keeps draw calls constant as towers are added (instancing)", () => {
    const scene = new Scene();
    const overlay = createAetherTowerOverlay(scene, 8);

    const emptySlotCount = instancedMeshes(scene).length;
    expect(emptySlotCount).toBeGreaterThan(0);

    for (let i = 0; i < 6; i += 1) overlay.addInstance(i * 2, 0, 0, i, 0);
    overlay.commit();

    expect(instancedMeshes(scene).length).toBe(emptySlotCount);

    overlay.dispose();
  });

  it("spins the tower rings on update without disturbing instance counts", () => {
    const scene = new Scene();
    const overlay = createAetherTowerOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 3, 7);
    overlay.commit();

    const rings = towerRings(scene);
    expect(rings!.count).toBe(3);

    const before = Array.from(rings!.instanceMatrix.array.slice(0, 16));
    overlay.update(1000);
    const after = Array.from(rings!.instanceMatrix.array.slice(0, 16));
    expect(after).not.toEqual(before);
    expect(rings!.count).toBe(3);

    overlay.dispose();
  });

  it("builds long strand geometries from unit-length pieces", () => {
    const scene = new Scene();
    const overlay = createAetherTowerOverlay(scene, 3);

    addLinkedTrio(overlay);
    overlay.commit();

    // Link conduits are unit cylinders so addPieceAlong stretches them along
    // the span direction instead of collapsing them into slivers.
    const beams = instancedMeshes(scene).filter(
      (mesh) => mesh.geometry.type === "CylinderGeometry" && mesh.count > 0
    );
    const beam = beams.find(
      (mesh) => (mesh.geometry as CylinderGeometry).parameters.radiusTop === 0.034
    );
    expect(beam).toBeDefined();
    expect(beam!.count).toBe(3);

    overlay.dispose();
  });

  it("skips the zero-scale nexus assembly on solo towers", () => {
    // Solo towers animate nexus rings/beads/glow at ~zero scale (nex 0.0001);
    // committing them burns instance slots and per-frame rewrites for pieces
    // that are point-sized. Gated out entirely — only linked towers write.
    const soloScene = new Scene();
    const solo = createAetherTowerOverlay(soloScene, 1);
    solo.addInstance(0, 0, 0, 0, 0);
    solo.commit();
    expect(ringMesh(soloScene, 0.46)!.count).toBe(0);
    solo.dispose();

    const linkedScene = new Scene();
    const linked = createAetherTowerOverlay(linkedScene, 3);
    addLinkedTrio(linked);
    linked.commit();
    // 3 linked towers × 3 synchronization rings each.
    expect(ringMesh(linkedScene, 0.46)!.count).toBe(9);
    linked.dispose();
  });

  it("bounds total GPU work at maximum density (instancing contract)", () => {
    // Worst-case theatre: 64 towers on an 8x8 grid inside the link radius, so
    // nearly every conduit + cluster slot is populated. The overlay must stay
    // a handful of instanced draws with a bounded triangle/fill budget — the
    // whole point of the per-key InstancedMesh architecture.
    const scene = new Scene();
    const overlay = createAetherTowerOverlay(scene, 4096);
    const N = 8;
    const spacing = 1.9;
    const off = (N - 1) / 2;
    for (let gx = 0; gx < N; gx += 1) {
      for (let gz = 0; gz < N; gz += 1) {
        overlay.addInstance((gx - off) * spacing, (gz - off) * spacing, 0, gx, gz);
      }
    }
    overlay.commit();

    const meshes = instancedMeshes(scene);
    const drawn = meshes.filter((mesh) => mesh.count > 0);

    // One draw call per key slot, never more than the fixed slot count.
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.length).toBeLessThanOrEqual(meshes.length);
    expect(meshes.length).toBeLessThanOrEqual(37);

    const triCount = (mesh: InstancedMesh): number => {
      const { geometry } = mesh;
      return (geometry.index?.count ?? geometry.attributes.position!.count) / 3;
    };
    const triangles = drawn.reduce((total, mesh) => total + mesh.count * triCount(mesh), 0);
    expect(triangles).toBeLessThan(400_000);

    // Instance matrices stay a small fixed allocation regardless of map size.
    const bufferBytes = meshes.reduce((total, mesh) => total + mesh.instanceMatrix.array.length * 4, 0);
    expect(bufferBytes).toBeLessThan(512 * 1024);

    // The per-frame animated rewrite re-uploads a bounded prefix per key.
    overlay.update(70_000);
    const uploadBytes = drawn.reduce((total, mesh) => {
      let uploaded = 0;
      for (const range of mesh.instanceMatrix.updateRanges) uploaded += range.count * 4;
      return total + uploaded;
    }, 0);
    expect(uploadBytes).toBeLessThan(360 * 1024);

    overlay.dispose();
  });
});
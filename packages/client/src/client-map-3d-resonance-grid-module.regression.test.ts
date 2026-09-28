import { describe, expect, it } from "vitest";
import { CylinderGeometry, InstancedMesh, Matrix4, Scene, TorusGeometry, Vector3 } from "three";
import { AFC_BAY_INNER_RADIUS, createFabricationComplexOverlay } from "./client-map-3d-fabrication-complex.js";
import { RESONANCE_GRID_BASE_RADIUS, RESONANCE_GRID_MODULE_HEIGHT, RESONANCE_GRID_SCALE, createResonanceGridModuleOverlay } from "./client-map-3d-resonance-grid-module.js";

const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

const meshByGeometry = (scene: Scene, match: (geo: { type: string; parameters: Record<string, unknown> }) => boolean): InstancedMesh[] =>
  instancedMeshes(scene).filter((mesh) => match(mesh.geometry as unknown as { type: string; parameters: Record<string, unknown> }));

// The three large resonance nodes: a brass rim, a steel band and a glowing
// core, one of each per node.
const nodeRimMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) => mesh.geometry.type === "TorusGeometry" && (mesh.geometry as TorusGeometry).parameters.radius === 0.034 && (mesh.geometry as TorusGeometry).parameters.tube === 0.01
  );

const nodeCoreMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) => mesh.geometry.type === "TorusGeometry" && (mesh.geometry as TorusGeometry).parameters.radius === 0.0115 && (mesh.geometry as TorusGeometry).parameters.tube === 0.005
  );

// The short rigid conductor arms that close the triangle between the nodes.
const armMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "CylinderGeometry" && (mesh.geometry as CylinderGeometry).parameters.height === 1 && (mesh.geometry as CylinderGeometry).parameters.radiusTop === 0.007
  );

// The synchronizer's support column, carrying the arm truss.
const columnMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "CylinderGeometry" && (mesh.geometry as CylinderGeometry).parameters.height === 1 && (mesh.geometry as CylinderGeometry).parameters.radiusTop === 0.008
  );

const conduitMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "CylinderGeometry" && (mesh.geometry as CylinderGeometry).parameters.height === 1 && (mesh.geometry as CylinderGeometry).parameters.radiusTop === 0.0085
  );

const synchronizerMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "CylinderGeometry" &&
      (mesh.geometry as CylinderGeometry).parameters.height === 0.032 &&
      (mesh.geometry as CylinderGeometry).parameters.radiusTop === 0.021
  );

// The module's local axis after yaw — the second matrix column. Rods align their
// local +Y along the piece direction, so column 1 (elements 4/5/6) reads the
// piece's scaled axis.
const yAxisColumn = (mesh: InstancedMesh, instance: number): Vector3 => {
  const a = mesh.instanceMatrix.array;
  const o = instance * 16;
  return new Vector3(a[o + 4]!, a[o + 5]!, a[o + 6]!);
};

const translation = (mesh: InstancedMesh, instance: number): Vector3 => {
  const a = mesh.instanceMatrix.array;
  const o = instance * 16;
  return new Vector3(a[o + 12]!, a[o + 13]!, a[o + 14]!);
};

// Tori align their hole along the piece direction, so the third matrix column
// (elements 8/9/10) is the ring's scaled normal.
const zAxisColumn = (mesh: InstancedMesh, instance: number): Vector3 => {
  const a = mesh.instanceMatrix.array;
  const o = instance * 16;
  return new Vector3(a[o + 8]!, a[o + 9]!, a[o + 10]!);
};

// A world-space height/radius envelope measured through the real instance
// matrices over the transformed geometry vertices. Vertex extents are exact for
// the tessellated mesh that actually renders, so unlike a bounding-box corner
// sweep this does not over-report rotated pieces.
const measureEnvelope = (scene: Scene): { minY: number; maxY: number; maxRadius: number } => {
  const m = new Matrix4();
  const v = new Vector3();
  let minY = Infinity;
  let maxY = -Infinity;
  let maxRadius = 0;
  for (const mesh of instancedMeshes(scene)) {
    if (mesh.count === 0) continue;
    const attr = mesh.geometry.getAttribute("position");
    for (let i = 0; i < mesh.count; i += 1) {
      mesh.getMatrixAt(i, m);
      for (let k = 0; k < attr.count; k += 1) {
        v.fromBufferAttribute(attr, k).applyMatrix4(m);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
        maxRadius = Math.max(maxRadius, Math.hypot(v.x, v.z));
      }
    }
  }
  return { minY, maxY, maxRadius };
};

// Whether a world point lies inside a torus instance's metal. Both ends of a
// conductor arm must land inside a node rim — a 30° lean puts the ring plane
// 30° off horizontal, so an arm run toward a neighbour leaves that plane
// 0.43 per unit of travel and would otherwise sail past the rim it is meant to
// bolt into.
const insideTorus = (mesh: InstancedMesh, instance: number, world: Vector3): boolean => {
  const inv = new Matrix4();
  mesh.getMatrixAt(instance, inv);
  inv.invert();
  const p = world.clone().applyMatrix4(inv);
  const params = (mesh.geometry as TorusGeometry).parameters;
  return (Math.hypot(p.x, p.y) - params.radius!) ** 2 + p.z * p.z < params.tube! ** 2;
};

describe("resonance grid overlay", () => {
  it("commits a fully assembled module with a three-node triad above a low pod", () => {
    const scene = new Scene();
    const overlay = createResonanceGridModuleOverlay(scene, 2);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const meshes = instancedMeshes(scene);
    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) {
      expect(mesh.count).toBeGreaterThan(0);
    }

    // Three of everything that makes the triad read as a network.
    expect(nodeRimMesh(scene)!.count).toBe(3);
    expect(nodeCoreMesh(scene)!.count).toBe(3);
    expect(armMesh(scene)!.count).toBe(3);
    expect(conduitMesh(scene)!.count).toBe(3);
    // One central synchronizer carrying the whole truss.
    expect(synchronizerMesh(scene)!.count).toBe(1);
    expect(columnMesh(scene)!.count).toBe(1);
    // The brass phase bead riding each arm.
    const beads = meshByGeometry(
      scene,
      (geo) => geo.type === "TorusGeometry" && (geo.parameters as { radius: number }).radius === 0.007 && (geo.parameters as { tube: number }).tube === 0.003
    );
    expect(beads).toHaveLength(1);
    expect(beads[0]!.count).toBe(3);

    overlay.dispose();
  });

  it("keeps every piece inside the shared dock envelope", () => {
    const scene = new Scene();
    const overlay = createResonanceGridModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const { minY, maxY } = measureEnvelope(scene);
    // Nothing dips below the pad top.
    expect(minY).toBeGreaterThan(-0.005);
    // The dock envelope caps a module at 0.34 world units tall.
    expect(maxY).toBeLessThanOrEqual(0.34);
    expect(maxY).toBeCloseTo(RESONANCE_GRID_MODULE_HEIGHT, 2);
    // The seat base seats inside the AFC bay. (The flat brass locking lip
    // overhangs the bay radius in every family — only the elevated triad has to
    // stay inside the clearance envelope, which the next check pins.)
    expect(RESONANCE_GRID_BASE_RADIUS).toBeLessThan(AFC_BAY_INNER_RADIUS);

    // The node triad stays compact: every node ring inside the bay's clearance
    // radius, so the elevated cluster never crowds a neighbouring socket.
    const rims = nodeRimMesh(scene)!;
    const m = new Matrix4();
    const v = new Vector3();
    let maxNodeRadius = 0;
    const attr = rims.geometry.getAttribute("position");
    for (let i = 0; i < rims.count; i += 1) {
      rims.getMatrixAt(i, m);
      for (let k = 0; k < attr.count; k += 1) {
        v.fromBufferAttribute(attr, k).applyMatrix4(m);
        maxNodeRadius = Math.max(maxNodeRadius, Math.hypot(v.x, v.z));
      }
    }
    expect(maxNodeRadius).toBeLessThan(AFC_BAY_INNER_RADIUS);

    overlay.dispose();
  });

  it("stands the three nodes on an equilateral triangle at one shared height and lean", () => {
    const scene = new Scene();
    const overlay = createResonanceGridModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const rims = nodeRimMesh(scene)!;
    expect(rims.count).toBe(3);
    const positions = [0, 1, 2].map((i) => translation(rims, i));
    const leans = [0, 1, 2].map((i) => zAxisColumn(rims, i));

    // One shared height for all three nodes.
    for (const pos of positions) {
      expect(pos.y).toBeCloseTo(positions[0]!.y, 5);
    }
    // Equal distance from the module axis, 120° apart on the triangle: one node
    // forward (+X) and one on each aft quarter.
    const radii = positions.map((pos) => Math.hypot(pos.x, pos.z));
    for (const radius of radii) {
      expect(radius).toBeCloseTo(radii[0]!, 5);
      expect(radius).toBeGreaterThan(0.05 * RESONANCE_GRID_SCALE);
    }
    const angles = positions.map((pos) => Math.atan2(pos.z, pos.x));
    expect(angles[0]!).toBeCloseTo(0, 5);
    for (const angle of angles.slice(1)) {
      expect(Math.abs(angle)).toBeCloseTo((Math.PI * 2) / 3, 4);
    }
    // One shared lean, tipped up and outward so the holes read as ellipses.
    // Every ring tips the same 30° off horizontal, and each one leans out along
    // its OWN radial — so the shared part is the up component, while the
    // horizontal part must point away from the module axis for all three.
    const leanUp = Math.cos(Math.PI / 6) * RESONANCE_GRID_SCALE;
    const leanOut = Math.sin(Math.PI / 6) * RESONANCE_GRID_SCALE;
    for (let i = 0; i < leans.length; i += 1) {
      const lean = leans[i]!;
      const pos = positions[i]!;
      expect(lean.y).toBeCloseTo(leanUp, 5);
      expect(Math.hypot(lean.x, lean.z)).toBeCloseTo(leanOut, 5);
      const radialX = pos.x / Math.hypot(pos.x, pos.z);
      const radialZ = pos.z / Math.hypot(pos.x, pos.z);
      expect((lean.x * radialX + lean.z * radialZ) / leanOut).toBeCloseTo(1, 5);
    }

    overlay.dispose();
  });

  it("seats every conductor arm end inside a node ring's rim", () => {
    const scene = new Scene();
    const overlay = createResonanceGridModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const arms = armMesh(scene)!;
    const rings = instancedMeshes(scene).filter((mesh) => mesh.geometry.type === "TorusGeometry");
    expect(arms.count).toBe(3);

    let seated = 0;
    for (let i = 0; i < arms.count; i += 1) {
      // Arms are unit cylinders stretched along their own +Y, so their tips are
      // the transformed local (0, ±0.5, 0).
      for (const tip of [0.5, -0.5]) {
        const world = new Vector3(0, tip, 0).applyMatrix4(armsMatrixAt(arms, i));
        const inRing = rings.some((ring) => {
          for (let k = 0; k < ring.count; k += 1) if (insideTorus(ring, k, world)) return true;
          return false;
        });
        expect(inRing).toBe(true);
        seated += 1;
      }
    }
    expect(seated).toBe(6);

    overlay.dispose();
  });

  it("sizes the arms, column and conduits to their intended lengths", () => {
    const scene = new Scene();
    const overlay = createResonanceGridModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    // A rod's length rides in the Y (cylinder axis) scale slot, so the local
    // axis column's length is the scaled piece length.
    const pieceLength = (mesh: InstancedMesh, instance: number): number => yAxisColumn(mesh, instance).length();
    const expected: Array<[InstancedMesh | undefined, number]> = [
      [armMesh(scene), 0.0495],
      [columnMesh(scene), 0.032]
    ];
    for (const [mesh, len] of expected) {
      expect(mesh).toBeDefined();
      for (let i = 0; i < mesh!.count; i += 1) {
        expect(pieceLength(mesh!, i)).toBeCloseTo(len * RESONANCE_GRID_SCALE, 2);
      }
    }
    // Three thick feeds running from the synchronizer into the pod's shoulder.
    const conduits = conduitMesh(scene)!;
    for (let i = 0; i < conduits.count; i += 1) {
      expect(pieceLength(conduits, i)).toBeGreaterThan(0.05 * RESONANCE_GRID_SCALE);
    }

    overlay.dispose();
  });

  it("keeps the synchronizer under the triad and the conduits running back into the pod", () => {
    const scene = new Scene();
    const overlay = createResonanceGridModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const drum = translation(synchronizerMesh(scene)!, 0);
    const rims = nodeRimMesh(scene)!;
    const nodeY = translation(rims, 0).y;
    // The synchronizer sits on the pod crown, below every node.
    expect(drum.y).toBeLessThan(nodeY);
    expect(Math.hypot(drum.x, drum.z)).toBeCloseTo(0, 5);
    // The column rises from the drum's cap to the arm truss, closing the gap.
    const column = translation(columnMesh(scene)!, 0);
    expect(column.y).toBeGreaterThan(drum.y);
    expect(Math.hypot(column.x, column.z)).toBeCloseTo(0, 5);

    // Every conduit starts buried in the synchronizer and ends inside the pod.
    const conduits = conduitMesh(scene)!;
    for (let i = 0; i < conduits.count; i += 1) {
      // translation() is the rod's midpoint: walk out to both tips.
      const mid = translation(conduits, i);
      const axis = yAxisColumn(conduits, i);
      const half = axis.length() / 2;
      const dir = axis.normalize();
      const start = mid.clone().addScaledVector(dir, -half);
      const end = mid.clone().addScaledVector(dir, half);
      // Buried in the synchronizer's lower rim, ending inside the pod's shoulder.
      expect(Math.hypot(start.x, start.z)).toBeLessThan(0.025 * RESONANCE_GRID_SCALE);
      expect(Math.hypot(end.x, end.z)).toBeLessThan(0.06 * RESONANCE_GRID_SCALE);
      // Rear-facing: the feeds angle back and down into the body.
      expect(end.x).toBeLessThan(start.x);
      expect(end.y).toBeLessThan(start.y);
    }

    overlay.dispose();
  });

  it("puts the cyan aether light in the three node cores and the small accents only", () => {
    const scene = new Scene();
    const overlay = createResonanceGridModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    // The three node cores are the brightest cyan in the module — the multi-node
    // read, not a single dominant emitter.
    const core = nodeCoreMesh(scene)!;
    const coreMat = core.material as unknown as { emissive: { getHex: () => number }; emissiveIntensity: number };
    expect(core.count).toBe(3);
    expect(coreMat.emissiveIntensity).toBeGreaterThan(2.5);
    expect(coreMat.emissive.getHex()).not.toBe(0x000000);
    // The rims stay unlit aged brass so the glow is framed, not washed out.
    // (MeshStandardMaterial defaults emissiveIntensity to 1 even with a black
    // emissive, so the emissive colour is what distinguishes a glowing piece.)
    const rimMat = nodeRimMesh(scene)!.material as unknown as { emissive: { getHex: () => number } };
    expect(rimMat.emissive.getHex()).toBe(0x000000);

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

    const overlay = createResonanceGridModuleOverlay(scene, attachments.length);
    for (const attachment of attachments) {
      overlay.addInstance(attachment.x, attachment.z, attachment.y, attachment.yaw, 0, 0);
    }
    overlay.commit();

    const rims = nodeRimMesh(scene)!;
    // Each docked module contributes three node instances, forward node first.
    attachments.forEach((attachment, i) => {
      const forward = translation(rims, i * 3);
      // The forward node sits just outboard of its socket, along the socket's
      // own radial — never near a different socket.
      const offsetX = forward.x - attachment.x;
      const offsetZ = forward.z - attachment.z;
      expect(Math.hypot(offsetX, offsetZ)).toBeCloseTo(0.058 * RESONANCE_GRID_SCALE, 2);
      // The module's local +X is the socket's outward radial.
      const radialX = Math.cos(attachment.yaw);
      const radialZ = Math.sin(attachment.yaw);
      expect(offsetX / (0.058 * RESONANCE_GRID_SCALE)).toBeCloseTo(radialX, 2);
      expect(offsetZ / (0.058 * RESONANCE_GRID_SCALE)).toBeCloseTo(radialZ, 2);
    });

    afc.dispose();
    overlay.dispose();
  });

  it("rotates the whole module with the socket yaw", () => {
    const scene = new Scene();
    const overlay = createResonanceGridModuleOverlay(scene, 2);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.addInstance(6, -3, 0, Math.PI / 2, 0, 0);
    overlay.commit();

    const rims = nodeRimMesh(scene)!;
    // Instance 0 is the forward node, on local +X: unyawed it sits on +X with
    // no Z offset, and a +90° socket yaw carries it onto +Z.
    // Compare each node against its own module's dock origin, so the assertion
    // is about the module's yaw and not the socket's world position.
    const firstOrigin = new Vector3(0, 0, 0);
    const secondOrigin = new Vector3(6, 0, -3);
    const forward = translation(rims, 0).sub(firstOrigin);
    const forwardYawed = translation(rims, 3).sub(secondOrigin);
    expect(forward.x).toBeGreaterThan(0.05 * RESONANCE_GRID_SCALE);
    expect(forward.z).toBeCloseTo(0, 5);
    // A +90° socket yaw carries the forward node off +X and onto +Z.
    expect(Math.abs(forwardYawed.z)).toBeGreaterThan(0.05 * RESONANCE_GRID_SCALE);
    expect(forwardYawed.x).toBeCloseTo(0, 5);
    // The two aft nodes are off-axis in both cases.
    const aftUnyawed = translation(rims, 1).sub(firstOrigin);
    const aftYawed = translation(rims, 4).sub(secondOrigin);
    expect(Math.abs(aftUnyawed.z)).toBeGreaterThan(0.04 * RESONANCE_GRID_SCALE);
    expect(Math.abs(aftYawed.x)).toBeGreaterThan(0.04 * RESONANCE_GRID_SCALE);
    // The yawed forward node swaps flanks with the unyawed one.
    expect(Math.abs(forwardYawed.z)).toBeCloseTo(Math.abs(forward.x), 5);

    // The triad's own internal geometry is rigid: the three nodes keep their
    // shared lean under yaw.
    const leanA = zAxisColumn(rims, 0);
    const leanB = zAxisColumn(rims, 3);
    // Same 30° lean, turned with the socket (columns carry the 1.33 scale, so
    // normalise before comparing directions).
    const unit = RESONANCE_GRID_SCALE * RESONANCE_GRID_SCALE;
    expect(leanB.dot(leanA) / unit).toBeCloseTo(Math.cos(Math.PI / 6) ** 2, 4);
    expect(leanB.y).toBeCloseTo(leanA.y, 5);

    overlay.dispose();
  });

  it("keeps the triad static on update (no idle animation)", () => {
    const scene = new Scene();
    const overlay = createResonanceGridModuleOverlay(scene, 1);

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
    const overlay = createResonanceGridModuleOverlay(scene, 2);

    expect(overlay.addInstance(0, 0, 0, 0, 0, 0)).toBe(0);
    expect(overlay.addInstance(4, 4, 0, 0.4, 0, 0)).toBe(1);
    expect(overlay.addInstance(8, 8, 0, 0.8, 0, 0)).toBe(-1);
    overlay.commit();
    expect(nodeRimMesh(scene)!.count).toBe(6);

    overlay.clear();
    overlay.commit();
    for (const mesh of instancedMeshes(scene)) {
      expect(mesh.count).toBe(0);
    }

    overlay.dispose();
    expect(scene.children.filter((child) => child instanceof InstancedMesh)).toHaveLength(0);
  });
});

// Helper kept next to its only caller so the arm-tip test reads in one piece.
const armsMatrixAt = (mesh: InstancedMesh, instance: number): Matrix4 => {
  const m = new Matrix4();
  mesh.getMatrixAt(instance, m);
  return m;
};

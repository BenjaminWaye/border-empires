import { describe, expect, it } from "vitest";
import { InstancedMesh, Matrix4, Scene, Vector3 } from "three";
import { createForest } from "./client-map-3d-forest.js";

// Regression for trees visibly flipping into a different species/layout
// mid-pan: createForest's addInstance() picks the tree species and spacing
// layout by hashing coordinates. It used to be handed only the SCENE-relative
// placement (sceneX/sceneZ), which drifts for a given world tile as the
// camera pans between terrain rebuilds (sceneOrigin only updates when a
// rebuild commits — see client-map-3d.ts). Hashing that drifting value meant
// every visible tree could re-roll its species/layout on every rebuild
// instead of staying fixed for that world tile. addInstance now takes the
// tile's absolute world coordinates separately and hashes on those instead.
// createForest adds one InstancedMesh per species (pine, spruce, leaf --
// trunk and canopy merged); a single addInstance fills exactly one of them.
const firstTreeMesh = (scene: Scene): InstancedMesh =>
  scene.children.find((c): c is InstancedMesh => c instanceof InstancedMesh && c.count > 0)!;

const firstTrunkLocalOffset = (scene: Scene): { x: number; z: number } => {
  const matrix = new Matrix4();
  firstTreeMesh(scene).getMatrixAt(0, matrix);
  const position = new Vector3();
  position.setFromMatrixPosition(matrix);
  return { x: position.x, z: position.z };
};

describe("createForest addInstance variant selection", () => {
  it("picks the same species/layout for the same world tile regardless of scene-relative drift", () => {
    const sceneA = new Scene();
    const forestA = createForest(sceneA, 4);
    // Same world tile (7, 3), but placed at very different scene positions —
    // simulating the camera having panned between two terrain rebuilds.
    forestA.addInstance(0, 0, 0, 7, 3);
    forestA.commit();
    const offsetA = firstTrunkLocalOffset(sceneA);

    const sceneB = new Scene();
    const forestB = createForest(sceneB, 4);
    forestB.addInstance(500, -500, 0, 7, 3);
    forestB.commit();
    const offsetB = firstTrunkLocalOffset(sceneB);

    // Strip out the scene translation (500, -500) to compare only the
    // layout-determined local offset — must match (within the InstancedMesh's
    // Float32Array storage precision) if the same world tile picked the same
    // layout both times.
    expect(offsetA.x).toBeCloseTo(offsetB.x - 500, 4);
    expect(offsetA.z).toBeCloseTo(offsetB.z + 500, 4);
    // The per-tree turn/lean/size and colour are world-keyed too.
    const linearA = new Matrix4();
    const linearB = new Matrix4();
    firstTreeMesh(sceneA).getMatrixAt(0, linearA);
    firstTreeMesh(sceneB).getMatrixAt(0, linearB);
    for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) expect(linearA.elements[i]).toBeCloseTo(linearB.elements[i]!, 5);
    expect(Array.from(firstTreeMesh(sceneA).instanceColor!.array.slice(0, 3))).toEqual(Array.from(firstTreeMesh(sceneB).instanceColor!.array.slice(0, 3)));

    forestA.dispose();
    forestB.dispose();
  });

  it("can pick a different species/layout for a different world tile even at the same scene position", () => {
    // Sanity check the hash is actually sensitive to world coordinates at
    // all (otherwise the first test would pass trivially).
    const results: Array<{ x: number; z: number }> = [];
    for (let worldX = 0; worldX < 12; worldX += 1) {
      const scene = new Scene();
      const forest = createForest(scene, 4);
      forest.addInstance(0, 0, 0, worldX, 0);
      forest.commit();
      results.push(firstTrunkLocalOffset(scene));
      forest.dispose();
    }
    const distinctOffsets = new Set(results.map((r) => `${r.x.toFixed(3)},${r.z.toFixed(3)}`));
    expect(distinctOffsets.size).toBeGreaterThan(1);
  });
});

// Regression: the (old, separate) trunk pool's capacity guard compared
// against the PREVIOUS commit's count, so after any full rebuild the next one
// could push past the InstancedMesh's allocated capacity. Every species pool
// must stay within its own capacity across rebuilds.
describe("createForest instance capacity", () => {
  it("never commits more trees than any species pool holds, across rebuilds", () => {
    const scene = new Scene();
    const forest = createForest(scene, 1);
    const meshes = scene.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh);
    for (let rebuild = 0; rebuild < 2; rebuild += 1) {
      forest.clear();
      for (let tile = 0; tile < 12; tile += 1) forest.addInstance(tile, 0, 0, tile, 0);
      forest.commit();
      for (const mesh of meshes) expect(mesh.count).toBeLessThanOrEqual(mesh.instanceMatrix.count);
    }
    forest.dispose();
  });
});

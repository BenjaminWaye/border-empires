import { describe, expect, it } from "vitest";
import { InstancedMesh, Matrix4, Scene, Vector3 } from "three";
import { createTownOverlay, TOWN_BASE_LIFT, townQuarterTurnForTile } from "./client-map-3d-town-overlay.js";

const instancedMeshes = (scene: Scene): InstancedMesh[] => {
  const meshes: InstancedMesh[] = [];
  scene.traverse((child) => {
    if (child instanceof InstancedMesh) meshes.push(child);
  });
  return meshes;
};

describe("town overlay", () => {
  it("uploads only the instances actually used, not the whole buffer", () => {
    // Without an update range three.js does gl.bufferSubData(target, 0, array) — the entire
    // capacity — every time needsUpdate is set, however few instances are drawn. Each tier's
    // capacity is the full visible-tile budget, so most of it sits idle.
    const scene = new Scene();
    const overlay = createTownOverlay(scene, 14_000);

    overlay.addInstance(0, 0, 0, "METROPOLIS");
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

  it("clears update ranges back to empty on a commit with zero instances", () => {
    const scene = new Scene();
    const overlay = createTownOverlay(scene, 10);

    overlay.addInstance(0, 0, 0, "METROPOLIS");
    overlay.commit();
    overlay.clear();
    overlay.commit();

    for (const mesh of instancedMeshes(scene)) {
      expect(mesh.count).toBe(0);
      expect(mesh.instanceMatrix.updateRanges).toHaveLength(0);
    }

    overlay.dispose();
  });

  it("draws each tier with its own mesh, glow sharing the body's transforms", () => {
    const scene = new Scene();
    const overlay = createTownOverlay(scene, 8);
    overlay.addInstance(2, 3, 0.5, "CITY", 40, 17);
    overlay.addInstance(5, 3, 0.25, "CITY", 41, 17);
    overlay.addInstance(9, 9, 0, "SETTLEMENT", 3, 3);
    overlay.commit();

    const byName = new Map(instancedMeshes(scene).map((mesh) => [mesh.name, mesh]));
    expect(byName.get("town-CITY")!.count).toBe(2);
    expect(byName.get("town-SETTLEMENT")!.count).toBe(1);
    expect(byName.get("town-METROPOLIS")!.count).toBe(0);
    const glow = byName.get("town-CITY-glow")!;
    expect(glow.count).toBe(2);
    expect(glow.instanceMatrix).toBe(byName.get("town-CITY")!.instanceMatrix);

    const matrix = new Matrix4();
    byName.get("town-CITY")!.getMatrixAt(0, matrix);
    const position = new Vector3().setFromMatrixPosition(matrix);
    expect(position.x).toBeCloseTo(2);
    expect(position.y).toBeCloseTo(0.5 + TOWN_BASE_LIFT);
    expect(position.z).toBeCloseTo(3);

    overlay.dispose();
  });

  it("turns each town by a stable quarter-turn picked from its world tile", () => {
    const turns = new Set<number>();
    for (let x = 0; x < 16; x += 1) {
      for (let y = 0; y < 16; y += 1) {
        const turn = townQuarterTurnForTile(x, y);
        expect(turn).toBe(townQuarterTurnForTile(x, y));
        expect(Number.isInteger(turn) && turn >= 0 && turn < 4).toBe(true);
        turns.add(turn);
      }
    }
    // Every orientation shows up, so neighbouring towns don't all face the same way.
    expect(turns.size).toBe(4);
  });
});

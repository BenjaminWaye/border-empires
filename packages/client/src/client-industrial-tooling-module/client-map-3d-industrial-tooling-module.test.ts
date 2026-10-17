import { describe, expect, it } from "vitest";
import { InstancedMesh, Matrix4, Scene, Vector3 } from "three";
import { AFC_BAY_INNER_RADIUS } from "../client-map-3d-fabrication-complex.js";
import { createAfcOverlayGroup } from "../client-map-3d-afc-module-family.js";
import { createIndustrialToolingModuleOverlay, INDUSTRIAL_TOOLING_BASE_RADIUS } from "./client-map-3d-industrial-tooling-module.js";

const meshes = (scene: Scene): InstancedMesh[] => scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

describe("Industrial Tooling module", () => {
  it("renders its bespoke mill beside every AFC socket, far from the scene origin", () => {
    expect(INDUSTRIAL_TOOLING_BASE_RADIUS).toBeLessThan(AFC_BAY_INNER_RADIUS);
    for (let socket = 0; socket < 8; socket++) {
      const scene = new Scene();
      const group = createAfcOverlayGroup(scene, 1);
      group.addAfc(100, 200, 3, 20, 30, [...Array<string>(socket).fill("unknown"), "trade"]);
      group.commit();
      group.update(1234);
      const anchor = group.attachmentFor(20, 30, "trade")!;
      const pieces = meshes(scene).filter((mesh) => mesh.name.startsWith("industrial-tooling-") && mesh.count > 0);
      expect(pieces.length).toBeGreaterThan(3);
      const matrix = new Matrix4();
      const position = new Vector3();
      for (const mesh of pieces) {
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, matrix);
          position.setFromMatrixPosition(matrix);
          expect(Math.hypot(position.x - anchor.x, position.z - anchor.z)).toBeLessThan(0.2);
          expect(position.y).toBeGreaterThanOrEqual(anchor.y);
          expect(position.y).toBeLessThan(anchor.y + 0.36);
        }
      }
      group.dispose();
    }
  });

  it("bounds capacity, animates only moving parts, and clears and disposes its meshes", () => {
    const scene = new Scene();
    const overlay = createIndustrialToolingModuleOverlay(scene, 1);
    expect(overlay.addInstance(10, 20, 2, Math.PI / 2, 4, 5)).toBe(0);
    expect(overlay.addInstance(10, 20, 2, 0, 4, 5)).toBe(-1);
    overlay.commit();
    const spindle = meshes(scene).find((mesh) => mesh.name === "industrial-tooling-spindle")!;
    const seat = meshes(scene).find((mesh) => mesh.name === "industrial-tooling-seat")!;
    const before = Array.from(spindle.instanceMatrix.array);
    const seatVersion = seat.instanceMatrix.version;
    overlay.update(1000);
    expect(Array.from(spindle.instanceMatrix.array)).not.toEqual(before);
    expect(spindle.instanceMatrix.updateRanges).toEqual([{ start: 0, count: 16 }]);
    expect(seat.instanceMatrix.version).toBe(seatVersion);
    overlay.clear();
    overlay.commit();
    overlay.update(2000);
    expect(meshes(scene).every((mesh) => mesh.count === 0)).toBe(true);
    overlay.dispose();
    expect(scene.children).toHaveLength(0);
  });
});

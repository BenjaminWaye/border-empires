import { describe, expect, it } from "vitest";
import { Box3, CylinderGeometry, InstancedMesh, Matrix4, Scene, Vector3 } from "three";
import { createStructurePieceBuilder } from "../client-map-3d-structure-builder.js";
import { registerManpowerStructures } from "../client-map-3d-structure-manpower.js";

const build = (cutY?: number) => {
  const resources = createStructurePieceBuilder(new Scene(), 2);
  const manpower = registerManpowerStructures(resources.builder);
  resources.builder.setGate(cutY);
  manpower.layouts.ANCILLARY_DEPOT(3, 0.5, -2);
  resources.commit();
  return { ...resources, layout: manpower.layouts.ANCILLARY_DEPOT };
};

const positionAt = (mesh: InstancedMesh, index: number): Vector3 => {
  const matrix = new Matrix4();
  mesh.getMatrixAt(index, matrix);
  return new Vector3().setFromMatrixPosition(matrix);
};

describe("ancillary depot runtime model", () => {
  it("wires the twelve-pod replacement into ANCILLARY_DEPOT", () => {
    const { builder, dispose } = build();
    try {
      expect(builder.getMesh("adDrum")?.count).toBe(1);
      expect(builder.getMesh("adBand")?.count).toBe(2);
      expect(builder.getMesh("adPod")?.count).toBe(12);
      expect(builder.getMesh("adCollar")?.count).toBe(12);
      expect(builder.getMesh("adLight")?.count).toBe(24);
      expect(builder.getMesh("adTorso")).toBeUndefined();
      const drum = builder.getMesh("adDrum")!.geometry;
      const band = builder.getMesh("adBand")!.geometry;
      expect(drum).toBeInstanceOf(CylinderGeometry);
      expect((drum as CylinderGeometry).parameters.openEnded).toBe(false);
      expect((band as CylinderGeometry).parameters.openEnded).toBe(true);
      const pods = builder.getMesh("adPod")!;
      for (let i = 0; i < 12; i += 1) {
        const position = positionAt(pods, i);
        const angle = i / 12 * Math.PI * 2;
        expect(position.x).toBeCloseTo(3 + Math.sin(angle) * 1.43 * 0.14);
        expect(position.z).toBeCloseTo(-2 + Math.cos(angle) * 1.43 * 0.14);
      }
    } finally { dispose(); }
  });

  it("keeps the seam lights outside opaque pod faces and fits one tile", () => {
    const { builder, dispose } = build();
    try {
      const pods = builder.getMesh("adPod")!;
      const lights = builder.getMesh("adLight")!;
      expect(positionAt(lights, 0).z).toBeGreaterThan(positionAt(pods, 0).z + 0.42 * 0.14 / 2 - 0.035 * 0.14);
      const matrix = new Matrix4();
      for (const key of ["adDrum", "adBand", "adPod", "adCollar", "adLight"]) {
        const mesh = builder.getMesh(key)!;
        mesh.geometry.computeBoundingBox();
        for (let i = 0; i < mesh.count; i += 1) {
          mesh.getMatrixAt(i, matrix);
          const bounds = new Box3().copy(mesh.geometry.boundingBox!).applyMatrix4(matrix);
          expect(bounds.min.x).toBeGreaterThan(2.5);
          expect(bounds.max.x).toBeLessThan(3.5);
          expect(bounds.min.z).toBeGreaterThan(-2.5);
          expect(bounds.max.z).toBeLessThan(-1.5);
          expect(bounds.min.y).toBeGreaterThanOrEqual(0.5 - 1e-6);
        }
      }
    } finally { dispose(); }
  });

  it("grows pods from the ground and withholds collars during construction", () => {
    const { builder, dispose, layout } = build(0.1);
    try {
      expect(builder.getMesh("adPod")?.count).toBe(12);
      expect(builder.getMesh("adCollar")?.count).toBe(0);
      const matrix = new Matrix4();
      builder.getMesh("adPod")!.getMatrixAt(0, matrix);
      const height = 1.9 * 0.14 * matrix.elements[5]!;
      expect(height).toBeCloseTo(0.1);
      expect(matrix.elements[13]! - height / 2).toBeCloseTo(0.5);
      expect(builder.measure(() => layout(0, 0, 0))).toBeCloseTo(1.98 * 0.14);
    } finally { dispose(); }
  });
});

import { CylinderGeometry, InstancedMesh, Matrix4, Scene, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { AFC_JOIN_DESCENT_MS, AFC_JOIN_MODEL_OVERLAP_MS, AFC_JOIN_TOTAL_MS } from "../client-afc-join-drop/client-afc-join-drop-timeline.js";
import { createAfcDropFxLayer } from "./client-map-3d-afc-drop-fx.js";

const entryGroups = (layer: ReturnType<typeof createAfcDropFxLayer>) => layer.group.children;

describe("createAfcDropFxLayer", () => {
  it("adds one entry per drop and removes it (and its model) once the sequence ends", () => {
    const scene = new Scene();
    const layer = createAfcDropFxLayer(scene);
    const now = performance.now();
    layer.spawn(3, 4, 0, now);
    expect(entryGroups(layer)).toHaveLength(1);
    layer.update(now + 100);
    expect(entryGroups(layer)).toHaveLength(1);
    layer.update(now + AFC_JOIN_TOTAL_MS + 100);
    expect(entryGroups(layer)).toHaveLength(0);
    layer.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it("unfolds its arms at touchdown, slides out all eight bays, and hands off on the rebuilt pad", () => {
    const layer = createAfcDropFxLayer(new Scene());
    const now = performance.now();
    let permanent = false;
    layer.spawn(3, 4, 0.1, now, {
      worldX: 5,
      worldY: 5,
      moduleIds: ["trade"],
      padY: () => 0.27,
      isCurrent: () => true,
      hasPermanentModel: () => permanent
    });
    const entry = entryGroups(layer)[0]!;
    const model = entry.children.find((child) => child instanceof Scene)!;
    const meshWithRadius = (radius: number) => model.children.find((child): child is InstancedMesh =>
      child instanceof InstancedMesh && child.geometry instanceof CylinderGeometry && child.geometry.parameters.radiusTop === radius
    )!;
    const bay = meshWithRadius(0.16);
    const claw = meshWithRadius(0.028);
    const matrix = new Matrix4();
    const radiusAt = (mesh: InstancedMesh, i: number, localY = 0): number => {
      mesh.getMatrixAt(i, matrix);
      const position = new Vector3(0, localY, 0).applyMatrix4(matrix);
      return Math.hypot(position.x, position.z);
    };
    layer.update(now + 10);
    const foldedArmRadius = radiusAt(claw, 0, 0.5);
    const stowedBayRadius = radiusAt(bay, 0);
    expect(foldedArmRadius).toBeLessThan(0.7);
    expect(stowedBayRadius).toBeLessThan(0.3);
    const highY = model.position.y;
    layer.update(now + AFC_JOIN_DESCENT_MS / 2);
    expect(model.position.y).toBeLessThan(highY);
    expect(model.position.y).toBeGreaterThan(0);
    expect(radiusAt(claw, 0, 0.5)).toBe(foldedArmRadius);
    layer.update(now + AFC_JOIN_DESCENT_MS);
    expect(model.position.y).toBe(0);
    expect(entry.position.y).toBe(0.27);

    layer.update(now + AFC_JOIN_DESCENT_MS + 650);
    expect(radiusAt(claw, 0, 0.5)).toBeGreaterThan(foldedArmRadius);
    expect(radiusAt(bay, 0)).toBe(stowedBayRadius);

    layer.update(now + AFC_JOIN_DESCENT_MS + 1850);
    expect(radiusAt(claw, 0, 0.5)).toBeCloseTo(1.28);
    for (let i = 0; i < 8; i++) {
      expect(radiusAt(bay, i)).toBeGreaterThan(stowedBayRadius);
      expect(radiusAt(bay, i)).toBeLessThan(1.28);
    }

    layer.update(now + AFC_JOIN_TOTAL_MS + 1);
    expect(entryGroups(layer)).toHaveLength(1);
    for (let i = 0; i < 8; i++) expect(radiusAt(bay, i)).toBeCloseTo(1.28);
    permanent = true;
    layer.update(now + AFC_JOIN_TOTAL_MS + AFC_JOIN_MODEL_OVERLAP_MS / 2);
    expect(entryGroups(layer)).toHaveLength(0);
    layer.dispose();
  });

  it("ignores a drop whose timeline already finished (e.g. renderer switched on late)", () => {
    const layer = createAfcDropFxLayer(new Scene());
    layer.spawn(0, 0, 0, performance.now() - AFC_JOIN_TOTAL_MS - 1);
    expect(entryGroups(layer)).toHaveLength(0);
    layer.dispose();
  });

  it("clear() removes every in-flight drop", () => {
    const layer = createAfcDropFxLayer(new Scene());
    const now = performance.now();
    layer.spawn(0, 0, 0, now);
    layer.spawn(5, 5, 0, now);
    layer.clear();
    expect(entryGroups(layer)).toHaveLength(0);
    layer.dispose();
  });
});

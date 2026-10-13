import { describe, expect, it } from "vitest";
import { BoxGeometry, Color, InstancedMesh, MeshBasicMaterial } from "three";
import { commitInstanceTint, setInstanceTint } from "./client-map-3d-instance-tint.js";
import { createForest } from "./client-map-3d-forest.js";
import { Scene } from "three";

const mesh = (): InstancedMesh => new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial({ toneMapped: false }), 4);

describe("instance tint", () => {
  it("allocates nothing for meshes that are never tinted", () => {
    const m = mesh();
    setInstanceTint(m, 0, undefined);
    commitInstanceTint(m);
    expect(m.instanceColor).toBeNull();
  });

  it("tints one instance and resets later untinted writes to white", () => {
    const m = mesh();
    setInstanceTint(m, 1, new Color(0.5, 0.25, 0));
    expect(Array.from(m.instanceColor!.array.slice(3, 6))).toEqual([0.5, 0.25, 0]);
    expect(Array.from(m.instanceColor!.array.slice(0, 3))).toEqual([1, 1, 1]);
    setInstanceTint(m, 1, undefined);
    expect(Array.from(m.instanceColor!.array.slice(3, 6))).toEqual([1, 1, 1]);
    m.count = 2;
    const versionBefore = m.instanceColor!.version;
    commitInstanceTint(m);
    expect(m.instanceColor!.version).toBeGreaterThan(versionBefore);
  });

  it("is threaded through the forest: a tinted tree gets a colour buffer", () => {
    const scene = new Scene();
    const forest = createForest(scene, 4);
    forest.addInstance(0.5, 0.5, 0.2, 10, 10, new Color(0.8, 0.7, 0.5));
    forest.commit();
    const tinted = scene.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh && c.instanceColor !== null);
    expect(tinted.length).toBeGreaterThan(0);
    forest.dispose();
  });
});

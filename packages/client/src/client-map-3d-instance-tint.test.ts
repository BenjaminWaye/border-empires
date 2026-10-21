import { describe, expect, it } from "vitest";
import { BoxGeometry, Color, InstancedMesh, MeshBasicMaterial, Scene } from "three";
import { commitInstanceTint } from "./client-map-3d-instance-tint.js";
import { createForest } from "./client-map-3d-forest.js";

const mesh = (): InstancedMesh => new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial({ toneMapped: false }), 4);

describe("instance tint", () => {
  it("does nothing for a mesh with no instance colours", () => {
    const m = mesh();
    commitInstanceTint(m);
    expect(m.instanceColor).toBeNull();
  });

  it("flags written colours for upload", () => {
    const m = mesh();
    m.setColorAt(1, new Color(0.5, 0.25, 0));
    m.count = 2;
    const versionBefore = m.instanceColor!.version;
    commitInstanceTint(m);
    expect(m.instanceColor!.version).toBeGreaterThan(versionBefore);
  });

  it("is threaded through the forest: a remembered-tile tint darkens that tile's trees", () => {
    const colourOf = (tint?: Color): number[] => {
      const scene = new Scene();
      const forest = createForest(scene, 4);
      forest.addInstance(0.5, 0.5, 0.2, 10, 10, tint);
      forest.commit();
      const drawn = scene.children.find((c): c is InstancedMesh => c instanceof InstancedMesh && c.count > 0)!;
      const rgb = Array.from(drawn.instanceColor!.array.slice(0, 3));
      forest.dispose();
      return rgb;
    };
    const live = colourOf();
    const remembered = colourOf(new Color(0.8, 0.7, 0.5));
    expect(remembered[0]).toBeCloseTo(live[0]! * 0.8, 5);
    expect(remembered[1]).toBeCloseTo(live[1]! * 0.7, 5);
    expect(remembered[2]).toBeCloseTo(live[2]! * 0.5, 5);
  });
});

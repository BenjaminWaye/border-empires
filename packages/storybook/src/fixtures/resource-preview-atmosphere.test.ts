import { Mesh, PlaneGeometry, Scene } from "three";
import { describe, expect, it } from "vitest";
import { createResourcePreviewAtmosphere } from "./resource-preview-atmosphere.js";

describe("resource asset previews", () => {
  it("leaves low basins and crop beds unobscured by exploration sheets", () => {
    const scene = new Scene();
    const atmosphere = createResourcePreviewAtmosphere(scene);
    const sheetsAboveLowProps = scene.children.filter((object) =>
      object instanceof Mesh && object.geometry instanceof PlaneGeometry && object.visible && object.position.y > 0.03
    );
    expect(sheetsAboveLowProps).toEqual([]);
    atmosphere.dispose();
  });
});

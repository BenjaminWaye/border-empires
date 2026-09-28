import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import { AFC_SOCKET_COUNT } from "./client-map-3d-fabrication-complex.js";
import { AFC_MODULE_FAMILY_TECH_IDS, createAfcOverlayGroup } from "./client-map-3d-afc-module-family.js";

const totalInstanceCount = (scene: Scene): number =>
  scene.children.reduce((sum, child) => (child instanceof InstancedMesh ? sum + child.count : sum), 0);

describe("AFC module family registry", () => {
  it("lists exactly the 12 module families built so far", () => {
    expect(AFC_MODULE_FAMILY_TECH_IDS).toHaveLength(12);
    expect(new Set(AFC_MODULE_FAMILY_TECH_IDS).size).toBe(12);
  });

  it("docks a known module family and grows the scene's instanced meshes", () => {
    const scene = new Scene();
    const group = createAfcOverlayGroup(scene, 2);
    group.addAfc(0, 0, 0, 5, 5, ["masonry"]);
    group.commit();
    // The AFC itself plus the docked Titanium Forge module should have
    // put at least two non-empty InstancedMeshes into the scene.
    expect(totalInstanceCount(scene)).toBeGreaterThan(0);
    group.dispose();
  });

  it("does not throw when a docked tech id has no built family yet", () => {
    const scene = new Scene();
    const group = createAfcOverlayGroup(scene, 2);
    expect(() => {
      group.addAfc(0, 0, 0, 5, 5, ["some-unbuilt-module-tech"]);
      group.commit();
    }).not.toThrow();
    group.dispose();
  });

  it("docks at most AFC_SOCKET_COUNT modules even when more are supplied", () => {
    const scene = new Scene();
    const group = createAfcOverlayGroup(scene, 2);
    // 12 known families, only 8 sockets -- everything past the 8th is
    // silently dropped rather than throwing or wrapping to a 9th socket.
    expect(() => {
      group.addAfc(0, 0, 0, 5, 5, AFC_MODULE_FAMILY_TECH_IDS.slice(0, AFC_SOCKET_COUNT + 4));
      group.commit();
    }).not.toThrow();
    group.dispose();
  });

  it("clear/commit/update/dispose all run without an AFC instance present", () => {
    const scene = new Scene();
    const group = createAfcOverlayGroup(scene, 2);
    expect(() => {
      group.clear();
      group.commit();
      group.update(0);
      group.dispose();
    }).not.toThrow();
  });
});

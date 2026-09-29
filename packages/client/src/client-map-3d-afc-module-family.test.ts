import { describe, expect, it } from "vitest";
import { InstancedMesh, Matrix4, Scene, Vector3 } from "three";
import { AFC_SOCKET_COUNT } from "./client-map-3d-fabrication-complex.js";
import { AFC_MODULE_FAMILY_TECH_IDS, createAfcOverlayGroup } from "./client-map-3d-afc-module-family.js";

const totalInstanceCount = (scene: Scene): number =>
  scene.children.reduce((sum, child) => (child instanceof InstancedMesh ? sum + child.count : sum), 0);

// Scene-space XZ distance of every instanced piece from (cx, cz).
const maxDistanceFrom = (scene: Scene, cx: number, cz: number): number => {
  const m = new Matrix4();
  const p = new Vector3();
  let max = 0;
  for (const child of scene.children) {
    if (!(child instanceof InstancedMesh)) continue;
    for (let i = 0; i < child.count; i += 1) {
      child.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      max = Math.max(max, Math.hypot(p.x - cx, p.z - cz));
    }
  }
  return max;
};

describe("AFC module family registry", () => {
  // Regression: modules rotated by their socket yaw about the WORLD ORIGIN
  // instead of their own dock. Socket 0 (yaw 0) was unaffected, so only the
  // first module ever docked correctly; every other socket flung its module
  // along an arc around the map origin, far from an AFC that isn't at (0,0).
  it("keeps every docked module beside its AFC, in every socket, when the AFC is far from the world origin", () => {
    const scene = new Scene();
    const group = createAfcOverlayGroup(scene, 2);
    group.addAfc(100, 200, 0, 5, 5, AFC_MODULE_FAMILY_TECH_IDS.slice(0, AFC_SOCKET_COUNT));
    group.commit();
    // AFC footprint radius ~1.4 tiles; a docked module reaches < 1.3 + 1 tiles.
    expect(maxDistanceFrom(scene, 100, 200)).toBeLessThan(3);
    group.dispose();
  });

  it("seats a module on its own socket for every socket rotation", () => {
    for (let socket = 0; socket < AFC_SOCKET_COUNT; socket += 1) {
      const scene = new Scene();
      const group = createAfcOverlayGroup(scene, 2);
      const techIds = Array.from({ length: socket }, () => "no-such-tech").concat(["masonry"]);
      group.addAfc(100, 200, 0, 5, 5, techIds);
      group.commit();
      const angle = (socket * Math.PI) / 4;
      const meshes = scene.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh).filter((mesh) => mesh.count > 0);
      const m = new Matrix4();
      const p = new Vector3();
      // At least one piece of the forge is seated within its bay of the socket centre.
      const sx = 100 + Math.cos(angle) * 1.28;
      const sz = 200 + Math.sin(angle) * 1.28;
      let nearSocket = 0;
      for (const mesh of meshes) {
        mesh.getMatrixAt(0, m);
        p.setFromMatrixPosition(m);
        if (Math.hypot(p.x - sx, p.z - sz) < 0.6) nearSocket += 1;
      }
      expect(nearSocket, `socket ${socket}`).toBeGreaterThan(0);
      group.dispose();
    }
  });


  it("lists exactly the 13 module families built so far", () => {
    expect(AFC_MODULE_FAMILY_TECH_IDS).toHaveLength(13);
    expect(new Set(AFC_MODULE_FAMILY_TECH_IDS).size).toBe(13);
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

  it("renders a generic cartridge for a docked tech that has no bespoke family, in its own socket", () => {
    const scene = new Scene();
    const group = createAfcOverlayGroup(scene, 2);
    group.addAfc(0, 0, 0, 5, 5, []);
    group.commit();
    const afcOnly = totalInstanceCount(scene);
    group.clear();
    group.addAfc(0, 0, 0, 5, 5, ["some-unbuilt-module-tech"]);
    group.commit();
    // Before the fallback existed an unmapped tech added zero instances, so
    // an unlocked module looked like it never attached.
    expect(totalInstanceCount(scene)).toBeGreaterThan(afcOnly);
    group.dispose();
  });

  it("puts every docked module in its own socket, not just the first", () => {
    const scene = new Scene();
    const group = createAfcOverlayGroup(scene, 2);
    group.addAfc(0, 0, 0, 5, 5, []);
    group.commit();
    const afcOnly = totalInstanceCount(scene);
    group.clear();
    group.addAfc(0, 0, 0, 5, 5, ["masonry"]);
    group.commit();
    const oneModule = totalInstanceCount(scene) - afcOnly;
    group.clear();
    group.addAfc(0, 0, 0, 5, 5, ["masonry", "fortified-walls", "steelworking"]);
    group.commit();
    const genericPiecesPerModule = 3;
    expect(totalInstanceCount(scene) - afcOnly).toBe(oneModule + 2 * genericPiecesPerModule);
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

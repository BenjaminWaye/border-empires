import { readFileSync } from "node:fs";
import { Box3, Mesh, Raycaster, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { FARMLAND_MODEL_URL } from "../client-map-3d-farmland/client-map-3d-farmland.js";
import { FISHING_MODEL_URL } from "../client-map-3d-fishing/client-map-3d-fishing.js";

const load = (url: string) => {
  const bytes = readFileSync(new URL(`../../public${url}`, import.meta.url));
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), "");
};

describe("detailed food assets", () => {
  it("leaves the original gap between the fish basins open, without a wooden bridge", async () => {
    const detailed = await load(FISHING_MODEL_URL);
    detailed.scene.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(-0.01, 0.15, 0.1), new Vector3(0, -1, 0), 0, 0.15);
    expect(ray.intersectObject(detailed.scene, true)).toHaveLength(0);
  });
  it.each([["/models/farmland.glb", FARMLAND_MODEL_URL], ["/models/fishing2.glb", FISHING_MODEL_URL]])(
    "%s keeps its footprint and height with bounded extra detail",
    async (originalUrl, detailedUrl) => {
      const original = await load(originalUrl);
      const detailed = await load(detailedUrl);
      const before = new Box3().setFromObject(original.scene, true);
      const after = new Box3().setFromObject(detailed.scene, true);
      for (const side of ["min", "max"] as const) for (const axis of ["x", "y", "z"] as const) {
        // Authored trim is rounded to millimetres in tile-local coordinates.
        expect(after[side][axis]).toBeCloseTo(before[side][axis], 3);
      }
      let triangles = 0;
      original.scene.traverse((node) => {
        if (node instanceof Mesh) triangles += (node.geometry.index?.count ?? node.geometry.getAttribute("position").count) / 3;
      });
      let meshes = 0;
      detailed.scene.traverse((node) => {
        if (!(node instanceof Mesh)) return;
        meshes += 1;
        const geometry = node.geometry;
        expect(geometry.getAttribute("position").count / 3).toBeGreaterThan(triangles);
        expect(geometry.getAttribute("position").count / 3).toBeLessThan(triangles * 4);
        expect(geometry.getAttribute("uv").count).toBe(geometry.getAttribute("position").count);
        const attribute = geometry.getAttribute("color");
        const colors: number[] = [];
        for (let i = 0; i < attribute.count; i += 1) colors.push(attribute.getX(i), attribute.getY(i), attribute.getZ(i));
        expect(colors.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
        expect(new Set(colors.map((v) => v.toFixed(4))).size).toBeGreaterThan(50);
      });
      expect(meshes).toBe(1);
    }
  );
});

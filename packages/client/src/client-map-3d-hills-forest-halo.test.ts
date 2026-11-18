import { BufferAttribute, Mesh, MeshStandardMaterial, Scene } from "three";
import { describe, expect, it } from "vitest";
import { createHillTerrain, forestZoneFromHeightfield } from "./client-map-3d-hills.js";
import type { HeightfieldCornerAttributes } from "./client-map-3d-heightfield/client-map-3d-heightfield-corners.js";

// Regression: hill domes never wrote the forestZone attribute, so beside a wood
// the flat grass took the shared material's forest-floor darkening while every
// hill tile stayed bright -- a square of straight lines round each hill tile.

const domeMesh = (scene: Scene, material: MeshStandardMaterial): Mesh => {
  const mesh = scene.children.find((child): child is Mesh => child instanceof Mesh && child.material === material);
  if (!mesh) throw new Error("hill dome mesh not found");
  return mesh;
};

describe("hill dome forest halo", () => {
  it("carries the main grid's corner forest halo across the dome, matching it at the tile's corners", () => {
    const scene = new Scene();
    const material = new MeshStandardMaterial();
    const hills = createHillTerrain(scene, 4, material);
    // Halo strongest at the hill's west corners, none at its east ones.
    const halo = (cx: number): number => (cx === 10 ? 0.8 : 0);
    hills.rebuild({
      camX: 10, camY: 20, halfW: 0, halfH: 0, worldWidth: 64, worldHeight: 64,
      tileKindAt: () => "GRASS",
      isHillsAt: (wx, wy) => wx === 10 && wy === 20,
      forestZoneAt: (cx) => halo(cx)
    });
    const mesh = domeMesh(scene, material);
    const forest = mesh.geometry.getAttribute("forestZone") as BufferAttribute;
    const uv = mesh.geometry.getAttribute("uv") as BufferAttribute;
    let checked = 0;
    for (let i = 0; i < mesh.geometry.drawRange.count && i < uv.count; i += 1) {
      const u = uv.getX(i);
      if (Math.abs(u - 10) < 1e-6) { expect(forest.getX(i)).toBeCloseTo(0.8, 5); checked += 1; }
      if (Math.abs(u - 11) < 1e-6) { expect(forest.getX(i)).toBeCloseTo(0, 5); checked += 1; }
    }
    expect(checked).toBeGreaterThan(0);
    // Halfway across, halfway between.
    const mid = [...Array(uv.count).keys()].find((i) => Math.abs(uv.getX(i) - 10.5) < 1e-6);
    expect(mid).toBeDefined();
    expect(forest.getX(mid!)).toBeCloseTo(0.4, 5);
    hills.dispose();
  });

  it("reads the halo from the heightfield's rendered corners, 0 where it drew none", () => {
    const read = forestZoneFromHeightfield((cx: number, cz: number, out: HeightfieldCornerAttributes) => {
      if (cx !== 3 || cz !== 4) return false;
      out.forestZone = 0.6;
      return true;
    });
    expect(read(3, 4)).toBe(0.6);
    expect(read(5, 5)).toBe(0);
  });
});

describe("forest halo on bare-rock hill peaks", () => {
  it("leaves the grey rock peaks out of the forest-floor darkening", async () => {
    // Regression: with the halo now on hill domes, a grass hill beside a wood had its grey rock peak multiplied
    // toward the green forest-floor tone too, since grassMask follows the dome's biome hue, not the rock.
    const { ShaderLib, Texture } = await import("three");
    const { applyHeightfieldMaterialShaderPatch } = await import("./client-map-3d-heightfield-shader.js");
    const shader = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, unknown> };
    applyHeightfieldMaterialShaderPatch(new Texture(), new Texture())(shader as never);
    expect(shader.fragmentShader).toContain("float forestDarken = vForestZone * grassMask * (1.0 - rockMask);");
  });
});

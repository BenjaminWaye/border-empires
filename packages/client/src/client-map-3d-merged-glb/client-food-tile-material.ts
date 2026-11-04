import { DataTexture, DoubleSide, LinearMipmapLinearFilter, MeshStandardMaterial, RepeatWrapping, RGBAFormat } from "three";
import type { Texture } from "three";
import { applyBuildingEnvMap } from "../client-map-3d-building-envmap/client-map-3d-building-envmap.js";

/** Tiny, deterministic surface grain. Mipmaps fade detail out at map distance;
 * box-projected UVs in the baked models keep it a constant size on each prop. */
export const createFoodTileMaterial = (envMap?: Texture): MeshStandardMaterial => {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  let seed = 7291;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const grain = 195 + (seed >>> 27) + Math.round(9 * Math.sin(x * Math.PI / 8));
      const offset = (y * size + x) * 4;
      pixels.set([grain, grain, grain, 255], offset);
    }
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(10, 10);
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  const material = new MeshStandardMaterial({
    side: DoubleSide, vertexColors: true, roughness: 0.98, roughnessMap: texture,
    bumpMap: texture, bumpScale: 0.008, metalness: 0, flatShading: true
  });
  applyBuildingEnvMap(material, envMap);
  // Each overlay owns one material and texture, including on story teardown.
  material.addEventListener("dispose", () => texture.dispose());
  return material;
};

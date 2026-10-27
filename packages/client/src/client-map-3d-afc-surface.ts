import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat } from "three";

/** Small deterministic machining grain, shared by the metal finishes.
 * Mipmaps keep the fine strokes quiet at gameplay zoom. R drives relief,
 * G drives roughness; no colour map or external asset request is needed. */
export const createAfcMetalSurface = (): DataTexture => {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  let seed = 0x9e3779b9;
  for (let y = 0; y < size; y++) {
    const grain = Math.sin(y * 2.39) * 12;
    for (let x = 0; x < size; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = (seed >>> 24) / 255;
      const index = (y * size + x) * 4;
      pixels[index] = Math.round(128 + grain + noise * 7);
      pixels[index + 1] = Math.round(205 + grain + noise * 25);
      pixels[index + 2] = 255;
      pixels[index + 3] = 255;
    }
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.name = "AFC brushed metal microfinish";
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
};

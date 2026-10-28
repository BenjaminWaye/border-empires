import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace } from "three";

/** Subtle concrete grain and damp areas, without graphic joints or edge stripes. */
export const createFishStudyApronMaterial = (): { material: MeshStandardMaterial; dispose: () => void } => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Fish apron study requires a 2D context");
  const pixels = ctx.createImageData(128, 128);
  let seed = 731;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = 188 + (seed >>> 28);
    pixels.data.set([value, value + 2, value + 1, 255], i);
  }
  ctx.putImageData(pixels, 0, 0);
  ctx.fillStyle = "#30444918";
  for (const z of [43, 84]) { ctx.beginPath(); ctx.ellipse(88, z, 19, 20, 0, 0, Math.PI * 2); ctx.fill(); }
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  const material = new MeshStandardMaterial({ color: "#b8bab3", map, roughness: 0.94 });
  return { material, dispose: () => { material.dispose(); map.dispose(); } };
};

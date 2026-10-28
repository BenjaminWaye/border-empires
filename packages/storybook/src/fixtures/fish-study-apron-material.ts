import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace } from "three";

/** Restrained concrete joints, damp areas and a drainage strip for the compact study. */
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
  ctx.strokeStyle = "#494e4b55";
  ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(18, 64); ctx.lineTo(110, 64); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(66, 18); ctx.lineTo(66, 110); ctx.stroke();
  ctx.fillStyle = "#30444918";
  for (const z of [43, 84]) { ctx.beginPath(); ctx.ellipse(88, z, 19, 20, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = "#343e3b";
  ctx.fillRect(107, 23, 2, 82);
  ctx.fillStyle = "#8b8e87";
  for (let z = 24; z < 105; z += 3) ctx.fillRect(107, z, 2, 1);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  const material = new MeshStandardMaterial({ color: "#b8bab3", map, roughness: 0.94 });
  return { material, dispose: () => { material.dispose(); map.dispose(); } };
};

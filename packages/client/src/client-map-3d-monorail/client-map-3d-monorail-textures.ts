import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, SRGBColorSpace } from "three";

// Small procedural greyscale detail maps for the maglev freight line, built
// once from plain arrays (no canvas/DOM, no image downloads). Each is
// multiplied by its material or per-instance colour, so one map serves every
// container colour and livery.

const texture = (w: number, h: number, shade: (u: number, v: number) => number): DataTexture => {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const g = Math.round(Math.min(1, Math.max(0, shade((x + 0.5) / w, (y + 0.5) / h))) * 255);
      const i = (y * w + x) * 4;
      data[i] = g; data[i + 1] = g; data[i + 2] = g; data[i + 3] = 255;
    }
  }
  const tex = new DataTexture(data, w, h, RGBAFormat);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
};

const band = (t: number, centre: number, half: number): number => (Math.abs(t - centre) < half ? 1 : 0);

// Corrugated container wall: 14 vertical ribs, heavier top/bottom rails, a
// pale stencil plate near one end.
export const createCorrugationTexture = (): DataTexture => texture(128, 32, (u, v) => {
  let g = 0.8 + 0.2 * Math.cos(u * Math.PI * 2 * 14);
  if (v < 0.1 || v > 0.9) g = 0.55;
  if (u < 0.02 || u > 0.98) g = 0.5;
  if (u > 0.08 && u < 0.24 && v > 0.55 && v < 0.75) g = 1.0;
  return g;
});

// Drive-unit hull: pale panels split by dark seams, a vent grille toward the
// rear and a darker armoured skirt along the bottom.
export const createHullPanelTexture = (): DataTexture => texture(128, 64, (u, v) => {
  let g = 0.95;
  for (const seam of [0.28, 0.56, 0.8]) if (band(u, seam, 0.006)) g = 0.45;
  if (band(v, 0.62, 0.012)) g = 0.5;
  if (v < 0.22) g = 0.62;
  if (u > 0.06 && u < 0.22 && v > 0.3 && v < 0.55) g = Math.floor(v * 40) % 2 === 0 ? 0.3 : 0.7;
  return g;
});

// Guideway beam: brushed panel with a dark expansion joint at each end of a
// segment and a fine lengthwise brush grain.
export const createBeamPanelTexture = (): DataTexture => texture(64, 16, (u, v) => {
  let g = 0.86 + 0.06 * Math.sin(v * 90 + u * 3);
  if (u < 0.03 || u > 0.97) g = 0.4;
  if (band(v, 0.5, 0.04)) g *= 0.85;
  return g;
});

// Glow mask for a guideway beam segment: a lit line along the middle (the
// levitation line on top, the power rail down each side) and one induction-
// coil block per segment. Used as an emissive map, so the lights cost no
// extra instances.
export const createBeamGlowTexture = (): DataTexture => texture(64, 16, (u, v) => {
  if (band(v, 0.5, 0.07)) return 1;
  if (band(u, 0.5, 0.09) && band(v, 0.5, 0.3)) return 0.85;
  return 0;
});

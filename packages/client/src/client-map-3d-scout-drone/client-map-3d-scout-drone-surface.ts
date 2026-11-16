import { BufferGeometry, CanvasTexture, Float32BufferAttribute, NoColorSpace, RepeatWrapping, SRGBColorSpace } from "three";

// Surface finish for the Survey Quad (client-map-3d-scout-drone-materials.ts), drawn once on small
// canvases: fine noise so the satin shell and matte chassis don't read as plastic, the shell's one
// hatch seam, a carbon-fibre weave for the arms, and brushed aluminium with a hairline vent band for the motor bells.
// Plus vertex-colour ambient occlusion and UV helpers for the geometry. All built once; textures
// are null where there is no canvas (tests), and materials then fall back to flat colour.

const seeded = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
};

const canvas2d = (size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null => {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  return ctx ? { canvas, ctx } : null;
};

const toTexture = (canvas: HTMLCanvasElement, srgb: boolean, repeat = false): CanvasTexture => {
  const t = new CanvasTexture(canvas);
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  if (repeat) {
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
  }
  t.anisotropy = 4;
  return t;
};

// Fine speckle around a mid value: the "not plastic" micro-variation.
const speckle = (ctx: CanvasRenderingContext2D, size: number, base: number, spread: number, seed: number): void => {
  const rand = seeded(seed);
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i += 1) {
    const v = Math.max(0, Math.min(255, base + (rand() - 0.5) * spread));
    image.data[i * 4] = v;
    image.data[i * 4 + 1] = v;
    image.data[i * 4 + 2] = v;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
};

export type ScoutTextureSet = { readonly map?: CanvasTexture; readonly roughnessMap: CanvasTexture; readonly normalMap?: CanvasTexture; readonly dispose: () => void };
const set = (maps: { map?: CanvasTexture; roughnessMap: CanvasTexture; normalMap?: CanvasTexture }): ScoutTextureSet => ({
  ...maps,
  dispose: () => {
    maps.map?.dispose();
    maps.roughnessMap.dispose();
    maps.normalMap?.dispose();
  }
});

// The hatch on the shell's top, in the shell's top-down UV space (u = across, v = nose to tail).
const HATCH = { u0: 0.3, u1: 0.7, v0: 0.58, v1: 0.82 } as const;

/** Shell: faint speckle in albedo and roughness, and the one hatch seam as a dark groove. */
export const makeShellTextures = (): ScoutTextureSet | null => {
  const S = 256;
  const albedo = canvas2d(S);
  const rough = canvas2d(S);
  const normal = canvas2d(S);
  if (!albedo || !rough || !normal) return null;
  speckle(albedo.ctx, S, 236, 14, 11);
  speckle(rough.ctx, S, 118, 26, 12);
  normal.ctx.fillStyle = "rgb(128,128,255)";
  normal.ctx.fillRect(0, 0, S, S);
  const x0 = HATCH.u0 * S;
  const y0 = HATCH.v0 * S;
  const w = (HATCH.u1 - HATCH.u0) * S;
  const h = (HATCH.v1 - HATCH.v0) * S;
  albedo.ctx.strokeStyle = "rgba(20,22,26,0.85)";
  albedo.ctx.lineWidth = 1.6;
  albedo.ctx.strokeRect(x0, y0, w, h);
  rough.ctx.strokeStyle = "rgb(200,200,200)";
  rough.ctx.lineWidth = 2;
  rough.ctx.strokeRect(x0, y0, w, h);
  // The groove's two walls: lit on one side, shaded on the other.
  normal.ctx.lineWidth = 1.2;
  normal.ctx.strokeStyle = "rgb(90,128,230)";
  normal.ctx.strokeRect(x0 - 1, y0 - 1, w + 2, h + 2);
  normal.ctx.strokeStyle = "rgb(166,128,230)";
  normal.ctx.strokeRect(x0 + 1, y0 + 1, w - 2, h - 2);
  return set({ map: toTexture(albedo.canvas, true), roughnessMap: toTexture(rough.canvas, false), normalMap: toTexture(normal.canvas, false) });
};

/** Battery chassis: a fine, matte grain. */
export const makeChassisTextures = (): ScoutTextureSet | null => {
  const rough = canvas2d(128);
  if (!rough) return null;
  speckle(rough.ctx, 128, 200, 50, 21);
  return set({ roughnessMap: toTexture(rough.canvas, false, true) });
};

/** Carbon fibre: a 2x2 twill weave, kept to a faint sheen variation in the normal and roughness maps. */
export const makeCarbonTextures = (): ScoutTextureSet | null => {
  const S = 64;
  const rough = canvas2d(S);
  const normal = canvas2d(S);
  if (!rough || !normal) return null;
  const cell = 8;
  for (let y = 0; y < S; y += cell) {
    for (let x = 0; x < S; x += cell) {
      const along = ((x + y) / cell) % 4 < 2; // twill: tows step diagonally
      rough.ctx.fillStyle = along ? "rgb(104,104,104)" : "rgb(114,114,114)";
      rough.ctx.fillRect(x, y, cell, cell);
      normal.ctx.fillStyle = along ? "rgb(134,128,250)" : "rgb(128,134,250)";
      normal.ctx.fillRect(x, y, cell, cell);
    }
  }
  return set({ roughnessMap: toTexture(rough.canvas, false, true), normalMap: toTexture(normal.canvas, false, true) });
};

/**
 * Motor bells, in cylinder UV space (u around, v up): fine vertical brushing that fakes the
 * anisotropic streak of machined aluminium, over a soft gradient (a touch darker at the base),
 * with a very fine vent band that only shows up close.
 */
export const makeBellTextures = (): ScoutTextureSet | null => {
  const S = 128;
  const albedo = canvas2d(S);
  const rough = canvas2d(S);
  if (!albedo || !rough) return null;
  const rand = seeded(31);
  const gradient = albedo.ctx.createLinearGradient(0, 0, 0, S);
  gradient.addColorStop(0, "#d8dce0");
  gradient.addColorStop(1, "#a4a9ae");
  albedo.ctx.fillStyle = gradient;
  albedo.ctx.fillRect(0, 0, S, S);
  rough.ctx.fillStyle = "rgb(80,80,80)";
  rough.ctx.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 1) {
    const r = 70 + Math.floor(rand() * 30);
    rough.ctx.fillStyle = `rgb(${r},${r},${r})`;
    rough.ctx.fillRect(x, 0, 1, S);
  }
  // A very fine vent band: hairline marks, only visible at close range.
  for (let slot = 0; slot < 32; slot += 1) {
    const x = (slot + 0.5) * (S / 32);
    albedo.ctx.fillStyle = "rgba(90,94,100,0.22)";
    albedo.ctx.fillRect(x, S * 0.24, 1, S * 0.04);
  }
  return set({ map: toTexture(albedo.canvas, true), roughnessMap: toTexture(rough.canvas, false) });
};

/** Top-down UVs (u across X, v along Z) over the given extent: for the shell's hatch and grain. */
export const applyTopDownUvs = (geometry: BufferGeometry, halfWidth: number, zMin: number, zMax: number): BufferGeometry => {
  const pos = geometry.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) {
    uv[i * 2] = (pos.getX(i) + halfWidth) / (2 * halfWidth);
    uv[i * 2 + 1] = (pos.getZ(i) - zMin) / (zMax - zMin);
  }
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  return geometry;
};

/** Bakes ambient occlusion into vertex colours from a shade function of each vertex's position. */
export const bakeOcclusion = (geometry: BufferGeometry, shade: (x: number, y: number, z: number) => number): BufferGeometry => {
  const pos = geometry.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const s = Math.max(0, Math.min(1, shade(pos.getX(i), pos.getY(i), pos.getZ(i))));
    colors[i * 3] = s;
    colors[i * 3 + 1] = s;
    colors[i * 3 + 2] = s;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
};

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

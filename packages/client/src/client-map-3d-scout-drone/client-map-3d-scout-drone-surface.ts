import { BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, NoColorSpace, RepeatWrapping, SRGBColorSpace, Vector3, type MeshStandardMaterial } from "three";

// Surface treatment for the scout drone's hard-surface hull (client-map-3d-scout-drone-model.ts):
// procedural panel maps drawn once on a canvas (albedo with panel seams, hatches and rivet rows; a
// matching normal map that cuts the seams in as grooves; a roughness map), a bronze edge-wear map,
// box-projected UVs so the panels sit flat on every facet, and a fresnel rim term patched into the
// metal shaders so the silhouette separates from dark terrain. All built once; nothing per frame.

const PANEL_SIZE = 512;

// A small deterministic generator, so every client draws the same panel layout.
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

const texture = (canvas: HTMLCanvasElement, srgb: boolean): CanvasTexture => {
  const t = new CanvasTexture(canvas);
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
};

export type ScoutPanelMaps = { readonly map: CanvasTexture; readonly normalMap: CanvasTexture; readonly roughnessMap: CanvasTexture; readonly dispose: () => void };

/**
 * Hull panelling: plates of slightly varied tone separated by thin seams, a few inset hatches and
 * rivet rows beside some seams. The height field (seams low) becomes the normal map, and seams
 * and rivets read rougher than the plates.
 */
export const makeScoutPanelMaps = (): ScoutPanelMaps | null => {
  const albedo = canvas2d(PANEL_SIZE);
  const height = canvas2d(PANEL_SIZE);
  const rough = canvas2d(PANEL_SIZE);
  if (!albedo || !height || !rough) return null;
  const rand = seeded(7_331);
  const S = PANEL_SIZE;
  albedo.ctx.fillStyle = "#d4d4d4";
  albedo.ctx.fillRect(0, 0, S, S);
  height.ctx.fillStyle = "#808080";
  height.ctx.fillRect(0, 0, S, S);
  rough.ctx.fillStyle = "#5a5a5a";
  rough.ctx.fillRect(0, 0, S, S);
  // Plates: an irregular grid, each plate a slightly different tone.
  const cols = [0, 70, 150, 205, 290, 360, 430, S];
  const rows = [0, 96, 180, 300, 390, S];
  for (let i = 0; i + 1 < cols.length; i += 1) {
    for (let j = 0; j + 1 < rows.length; j += 1) {
      const tone = 190 + Math.floor(rand() * 50);
      albedo.ctx.fillStyle = `rgb(${tone},${tone},${tone + 4})`;
      albedo.ctx.fillRect(cols[i]!, rows[j]!, cols[i + 1]! - cols[i]!, rows[j + 1]! - rows[j]!);
      const r = 70 + Math.floor(rand() * 40);
      rough.ctx.fillStyle = `rgb(${r},${r},${r})`;
      rough.ctx.fillRect(cols[i]!, rows[j]!, cols[i + 1]! - cols[i]!, rows[j + 1]! - rows[j]!);
    }
  }
  const seam = (x0: number, y0: number, x1: number, y1: number, width: number): void => {
    for (const [ctx, color] of [[albedo.ctx, "#3c3c40"], [height.ctx, "#2a2a2a"], [rough.ctx, "#b0b0b0"]] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  };
  for (const x of cols) seam(x, 0, x, S, 3);
  for (const y of rows) seam(0, y, S, y, 3);
  // Inset hatches with a raised rim.
  for (const [x, y, w, h] of [[88, 112, 48, 52], [312, 208, 34, 70], [218, 404, 58, 30]] as const) {
    height.ctx.strokeStyle = "#b8b8b8";
    height.ctx.lineWidth = 4;
    height.ctx.strokeRect(x, y, w, h);
    albedo.ctx.strokeStyle = "#4a4a50";
    albedo.ctx.lineWidth = 2;
    albedo.ctx.strokeRect(x, y, w, h);
  }
  // Rivet rows beside some seams.
  const rivet = (x: number, y: number): void => {
    height.ctx.fillStyle = "#c8c8c8";
    height.ctx.beginPath();
    height.ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    height.ctx.fill();
    albedo.ctx.fillStyle = "#5c5c62";
    albedo.ctx.beginPath();
    albedo.ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    albedo.ctx.fill();
  };
  for (const y of [rows[1]!, rows[3]!]) for (let x = 8; x < S; x += 16) rivet(x, y + 8);
  for (const x of [cols[2]!, cols[5]!]) for (let y = 8; y < S; y += 16) rivet(x + 8, y);

  // Height to normal: a central difference on the height canvas.
  const src = height.ctx.getImageData(0, 0, S, S).data;
  const out = height.ctx.createImageData(S, S);
  const at = (x: number, y: number): number => src[(((y + S) % S) * S + ((x + S) % S)) * 4]! / 255;
  const v = new Vector3();
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      v.set((at(x - 1, y) - at(x + 1, y)) * 3, (at(x, y + 1) - at(x, y - 1)) * 3, 1).normalize();
      const o = (y * S + x) * 4;
      out.data[o] = (v.x * 0.5 + 0.5) * 255;
      out.data[o + 1] = (v.y * 0.5 + 0.5) * 255;
      out.data[o + 2] = (v.z * 0.5 + 0.5) * 255;
      out.data[o + 3] = 255;
    }
  }
  height.ctx.putImageData(out, 0, 0);
  const maps = { map: texture(albedo.canvas, true), normalMap: texture(height.canvas, false), roughnessMap: texture(rough.canvas, false) };
  return { ...maps, dispose: () => Object.values(maps).forEach((t) => t.dispose()) };
};

/** Bronze edge wear: a mid-grey base with bright scuffs and scratches where the trim is handled. */
export const makeScoutWearMap = (): CanvasTexture | null => {
  const surface = canvas2d(256);
  if (!surface) return null;
  const { canvas, ctx } = surface;
  const rand = seeded(424_242);
  ctx.fillStyle = "#b4b4b4";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 140; i += 1) {
    const x = rand() * 256;
    const y = rand() * 256;
    const length = 4 + rand() * 18;
    const angle = rand() * Math.PI;
    const lum = 215 + Math.floor(rand() * 40);
    ctx.strokeStyle = `rgba(${lum},${lum},${lum},${0.4 + rand() * 0.5})`;
    ctx.lineWidth = 0.6 + rand() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
  }
  return texture(canvas, true);
};

const n = new Vector3();
const e1 = new Vector3();
const e2 = new Vector3();

/**
 * Box-projected UVs on a non-indexed geometry: each triangle takes the projection of its dominant
 * axis, so panel lines run straight on every facet. `scale` is texture repeats per unit.
 */
export const applyBoxUvs = (geometry: BufferGeometry, scale: number): BufferGeometry => {
  const pos = geometry.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i + 2 < pos.count; i += 3) {
    e1.set(pos.getX(i + 1) - pos.getX(i), pos.getY(i + 1) - pos.getY(i), pos.getZ(i + 1) - pos.getZ(i));
    e2.set(pos.getX(i + 2) - pos.getX(i), pos.getY(i + 2) - pos.getY(i), pos.getZ(i + 2) - pos.getZ(i));
    n.crossVectors(e1, e2);
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    for (let k = 0; k < 3; k += 1) {
      const x = pos.getX(i + k);
      const y = pos.getY(i + k);
      const z = pos.getZ(i + k);
      const [u, w] = ay >= ax && ay >= az ? [z, x] : ax >= az ? [z, y] : [x, y];
      uv[(i + k) * 2] = u * scale;
      uv[(i + k) * 2 + 1] = w * scale;
    }
  }
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  return geometry;
};

/**
 * Adds a fresnel rim to a lit material: grazing facets pick up a cool edge glow, so the dark
 * craft separates from dark terrain. Patched into the emissive stage of the standard shader.
 */
export const addScoutRimLight = (material: MeshStandardMaterial, color: Color, strength: number): void => {
  const uniforms = { scoutRimColor: { value: color }, scoutRimStrength: { value: strength } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 scoutRimColor;\nuniform float scoutRimStrength;")
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\n{ vec3 rimView = normalize( vViewPosition ); float rim = pow( 1.0 - saturate( abs( dot( normal, rimView ) ) ), 3.0 ); totalEmissiveRadiance += scoutRimColor * rim * scoutRimStrength; }"
      );
  };
  material.customProgramCacheKey = () => `scout-rim-${strength}`;
};

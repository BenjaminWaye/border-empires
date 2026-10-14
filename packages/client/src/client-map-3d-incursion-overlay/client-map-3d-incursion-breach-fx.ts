// 3D "breach" looks for the incursion pocket boundary that faces the viewer's
// own land (client-incursion-breach-layout.ts decides where; the admin
// switch in client-incursion-breach-style.ts decides which):
//   - spikes: a thin Hearts-of-Iron-style front line with teeth, flat in the
//     attacker's colour, over a hair-thin rim in the pocket's outline colour,
//     with a soft breathing "pressure wash" of the attacker's colour on the
//     band beneath it (same distance field as ember / ink).
//   - ember / ink: flat quads over the tiles either side of the boundary,
//     shaded from a per-pixel distance field to it (8-neighbour box distance),
//     so the effect is seamless across tiles and round at corners.
//   - veil: vertical quads standing on the boundary, fading upward.
// All animated from one time uniform advanced by update(nowMs). Owned by
// client-map-3d-incursion-overlay.ts; rebuilt with it (clear/add/commit).

import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Material, Mesh, MeshBasicMaterial, NormalBlending, ShaderMaterial, UniformsLib, UniformsUtils, type Blending } from "three";
import type { IncursionEdges } from "../client-reach-incursion/client-reach-incursion.js";
import type { BreachPoint, IncursionBreachLayout } from "../client-reach-incursion/client-incursion-breach-layout.js";
import type { IncursionBreachStyle } from "../client-reach-incursion/client-incursion-breach-style.js";

/** Band quads (one per tile near a breached boundary) and veil quads (one per breached side). */
const MAX_BAND_QUADS = 4096;
const MAX_VEIL_QUADS = 2048;
/** Front-line pieces (line segments + tooth halves; triangles stored as degenerate quads). */
const MAX_FRONT_QUADS = 24576;
/** The front line sits just above the pocket's edge strips. */
const FRONT_LIFT = 0.004;
const BAND_LIFT = 0.003;
/** Veil height in tiles. */
const VEIL_HEIGHT = 0.55;

const STYLE_CODE: Partial<Record<IncursionBreachStyle, number>> = { ember: 1, ink: 2, spikes: 3 };

const NOISE_GLSL = /* glsl */ `
  float bHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float bNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(bHash(i), bHash(i + vec2(1.0, 0.0)), u.x), mix(bHash(i + vec2(0.0, 1.0)), bHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float bFbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * bNoise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }
`;

const BAND_VERTEX = /* glsl */ `
  #include <fog_pars_vertex>
  attribute vec2 aLocal;
  attribute vec2 aWorld;
  attribute vec3 aBand;
  attribute vec3 aTheirs;
  varying vec2 vLocal;
  varying vec2 vWorld;
  varying vec3 vBand;
  varying vec3 vTheirs;
  void main() {
    vLocal = aLocal;
    vWorld = aWorld;
    vBand = aBand;
    vTheirs = aTheirs;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

// vBand = (mask, side, style). Offsets must match NEIGHBOUR_OFFSETS.
const BAND_FRAGMENT = /* glsl */ `
  #include <fog_pars_fragment>
  uniform float uTime;
  varying vec2 vLocal;
  varying vec2 vWorld;
  varying vec3 vBand;
  varying vec3 vTheirs;
  ${NOISE_GLSL}
  const vec2 OFFS[8] = vec2[8](vec2(-1.0, -1.0), vec2(0.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 0.0), vec2(1.0, 0.0), vec2(-1.0, 1.0), vec2(0.0, 1.0), vec2(1.0, 1.0));
  float boundaryDistance() {
    float mask = floor(vBand.x + 0.5);
    float d = 4.0;
    for (int i = 0; i < 8; i++) {
      if (mod(floor(mask / exp2(float(i))), 2.0) > 0.5) d = min(d, length(max(abs(vLocal - OFFS[i]) - 0.5, 0.0)));
    }
    return d;
  }
  void main() {
    float s = vBand.y * boundaryDistance(); // > 0 on my side of the seam
    vec2 wp = vWorld + vLocal;
    vec3 col;
    float alpha;
    if (vBand.z < 1.5) {
      // Ember: a wavering white-hot hairline with a flickering glow either side.
      float ss = s + (bFbm(wp * 1.7 + vec2(uTime * 0.05, -uTime * 0.04)) - 0.47) * 0.11;
      float core = exp(-ss * ss / 0.0006);
      float glow = exp(-abs(ss) / 0.15);
      float flicker = 0.65 + 0.55 * bFbm(wp * 3.5 + vec2(-uTime * 0.22, uTime * 0.17));
      vec3 ember = mix(vec3(1.0, 0.36, 0.06), vTheirs, 0.2);
      col = mix(ember, vec3(1.0, 0.93, 0.78), clamp(core * 1.3, 0.0, 1.0));
      alpha = clamp(core + glow * 0.72 * flicker, 0.0, 1.0);
    } else if (vBand.z > 2.5) {
      // Spikes' pressure wash: the attacker's colour glows out from the front
      // line into my land and fades, in soft streaks that drift slowly
      // forward, breathing -- the shaded advance zone of a war map.
      if (s <= 0.0) discard;
      float streak = 0.7 + 0.3 * bFbm(wp * 2.4 + vec2(uTime * 0.07, uTime * 0.05));
      float reach = 0.42 * (0.85 + 0.15 * sin(uTime * 0.9 + (wp.x + wp.y) * 0.7));
      float fade = exp(-s / reach);
      col = vTheirs;
      alpha = 0.65 * fade * fade * streak;
    } else {
      // Ink: the intruder's colour soaks into my land like watercolour --
      // irregular feathered front, pigment pooling darker at the front, a
      // faint paper grain, and a very slow breath.
      if (s <= 0.0) discard;
      float front = 0.12 + 0.32 * bFbm(wp * 1.5) + 0.06 * bNoise(wp * 6.0) + 0.02 * sin(uTime * 0.45 + wp.x * 0.9 + wp.y * 0.6);
      float body = 1.0 - smoothstep(front - 0.03, front + 0.005, s);
      float rim = exp(-pow((s - front + 0.018) / 0.022, 2.0)) * body;
      float grain = 0.8 + 0.2 * bNoise(wp * 18.0);
      float wash = mix(0.72, 0.46, clamp(s / max(front, 0.001), 0.0, 1.0));
      col = mix(vTheirs, vTheirs * 0.5, clamp(rim, 0.0, 1.0));
      alpha = clamp(body * wash * grain + rim * 0.5, 0.0, 0.92);
    }
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const VEIL_VERTEX = /* glsl */ `
  #include <fog_pars_vertex>
  attribute vec2 aVeil;
  attribute vec3 aTheirs;
  varying vec2 vVeil;
  varying vec3 vTheirs;
  void main() {
    vVeil = aVeil;
    vTheirs = aTheirs;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

// vVeil = (world coordinate along the boundary, height 0..1).
const VEIL_FRAGMENT = /* glsl */ `
  #include <fog_pars_fragment>
  uniform float uTime;
  varying vec2 vVeil;
  varying vec3 vTheirs;
  ${NOISE_GLSL}
  void main() {
    float h = vVeil.y;
    // Aurora-like folds: noise stretched vertically, drifting upward.
    float drift = bFbm(vec2(vVeil.x * 5.0, h * 0.8 - uTime * 0.3));
    float strands = 0.3 + 0.7 * smoothstep(0.3, 0.7, drift);
    float fade = pow(1.0 - h, 1.6);
    float base = exp(-h / 0.035);
    vec3 col = mix(vTheirs, vec3(1.0), 0.3 + 0.5 * base);
    float alpha = clamp(fade * strands * 0.8 + base * 0.7, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const createMaterial = (vertexShader: string, fragmentShader: string, blending: Blending): ShaderMaterial =>
  new ShaderMaterial({
    blending,
    uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader,
    fragmentShader,
    fog: true,
    transparent: true,
    depthWrite: false,
    side: DoubleSide
  });

type QuadStream = {
  readonly geometry: BufferGeometry;
  readonly mesh: Mesh;
  readonly arrays: Readonly<Record<string, Float32Array>>;
  readonly maxQuads: number;
  count: number;
};

const createQuadStream = (maxQuads: number, material: Material, attributes: Readonly<Record<string, number>>, renderOrder: number): QuadStream => {
  const geometry = new BufferGeometry();
  const arrays: Record<string, Float32Array> = {};
  for (const [name, size] of Object.entries(attributes)) {
    arrays[name] = new Float32Array(maxQuads * 4 * size);
    geometry.setAttribute(name, new BufferAttribute(arrays[name]!, size));
  }
  const indices = new Uint32Array(maxQuads * 6);
  for (let q = 0; q < maxQuads; q += 1) indices.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 1, q * 4 + 3, q * 4 + 2], q * 6);
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  return { geometry, mesh, arrays, maxQuads, count: 0 };
};

/** Writes one quad: per attribute, either 4 per-vertex values (flattened) or one value repeated on all 4 vertices. */
const writeQuad = (stream: QuadStream, values: Readonly<Record<string, readonly number[]>>): boolean => {
  if (stream.count >= stream.maxQuads) return false;
  for (const [name, array] of Object.entries(stream.arrays)) {
    const size = (stream.geometry.getAttribute(name) as BufferAttribute).itemSize;
    const data = values[name]!;
    const base = stream.count * 4 * size;
    if (data.length === size) for (let k = 0; k < 4; k += 1) array.set(data, base + k * size);
    else array.set(data, base);
  }
  stream.count += 1;
  return true;
};

const uploadStream = (stream: QuadStream): void => {
  for (const name of Object.keys(stream.arrays)) {
    const attr = stream.geometry.getAttribute(name) as BufferAttribute;
    attr.clearUpdateRanges();
    attr.addUpdateRange(0, stream.count * 4 * attr.itemSize);
    attr.needsUpdate = true;
  }
  stream.geometry.setDrawRange(0, stream.count * 6);
};

/** Tile-local corners in quad vertex order (matches the index pattern above). */
const CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [-0.5, 0.5],
  [0.5, 0.5]
];

/** Each side's endpoints (tile-local) and whether "along" runs on world x (else world y). */
const VEIL_SIDES: Readonly<Record<keyof IncursionEdges, { readonly from: readonly [number, number]; readonly to: readonly [number, number]; readonly alongX: boolean }>> = {
  north: { from: [-0.5, -0.5], to: [0.5, -0.5], alongX: true },
  east: { from: [0.5, -0.5], to: [0.5, 0.5], alongX: false },
  south: { from: [-0.5, 0.5], to: [0.5, 0.5], alongX: true },
  west: { from: [-0.5, -0.5], to: [-0.5, 0.5], alongX: false }
};

export type IncursionBreachTile = {
  readonly style: IncursionBreachStyle;
  readonly worldX: number;
  readonly worldY: number;
  readonly layout: IncursionBreachLayout;
};

export type IncursionBreachFx3D = {
  readonly clear: () => void;
  /** `theirs` = the attacker's colour. */
  /** `theirs` = the attacker's colour; `mark` = the pocket's outline colour (black on light attackers, white on dark). */
  readonly add: (x: number, z: number, surfaceY: number, breach: IncursionBreachTile, theirs: Color, mark: Color) => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createIncursionBreachFx3D = (parent: Group): IncursionBreachFx3D => {
  const bandMaterial = createMaterial(BAND_VERTEX, BAND_FRAGMENT, NormalBlending);
  // Additive, so the veil reads as light rather than a tinted sheet, even over the striped pocket.
  const veilMaterial = createMaterial(VEIL_VERTEX, VEIL_FRAGMENT, AdditiveBlending);
  const band = createQuadStream(MAX_BAND_QUADS, bandMaterial, { position: 3, aLocal: 2, aWorld: 2, aBand: 3, aTheirs: 3 }, 10);
  const veil = createQuadStream(MAX_VEIL_QUADS, veilMaterial, { position: 3, aVeil: 2, aTheirs: 3 }, 11);
  // Unlit flat colour, like the edge strips. Every outline draws before every
  // fill, so where pieces overlap the rim only shows round the whole shape.
  const frontMaterial = new MeshBasicMaterial({ toneMapped: false, vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide });
  const frontOutline = createQuadStream(MAX_FRONT_QUADS, frontMaterial, { position: 3, color: 3 }, 12);
  const front = createQuadStream(MAX_FRONT_QUADS, frontMaterial, { position: 3, color: 3 }, 13);
  parent.add(band.mesh, veil.mesh, frontOutline.mesh, front.mesh);
  // My tiles border several pocket tiles; each world tile gets one band quad per rebuild.
  const bandTilesThisRebuild = new Set<string>();
  const streams = [band, veil, frontOutline, front];

  /** Quad vertex order is (0, 1, 2), (1, 3, 2): a polygon p0..p3 maps to p0, p1, p3, p2; a triangle repeats its last point. */
  const quadCorners = (pts: readonly BreachPoint[], x: number, y: number, z: number): number[] => {
    const [p0, p1, p2, p3 = p2] = pts as readonly [BreachPoint, BreachPoint, BreachPoint, BreachPoint?];
    return [p0, p1, p3, p2].flatMap((p) => [x + p.x, y, z + p.y]);
  };

  const add: IncursionBreachFx3D["add"] = (x, z, surfaceY, breach, theirs, mark) => {
    const colour = [theirs.r, theirs.g, theirs.b];
    const frontY = surfaceY + FRONT_LIFT;
    for (const piece of breach.layout.front) {
      const written =
        writeQuad(frontOutline, { position: quadCorners(piece.outline, x, frontY, z), color: [mark.r, mark.g, mark.b] }) &&
        writeQuad(front, { position: quadCorners(piece.points, x, frontY, z), color: colour });
      if (!written) break;
    }
    const style = STYLE_CODE[breach.style];
    if (style !== undefined) {
      const y = surfaceY + BAND_LIFT;
      for (const tile of breach.layout.band) {
        const worldX = breach.worldX + tile.dx;
        const worldY = breach.worldY + tile.dy;
        const key = `${worldX},${worldY}`;
        if (bandTilesThisRebuild.has(key)) continue;
        bandTilesThisRebuild.add(key);
        const cx = x + tile.dx;
        const cz = z + tile.dy;
        const written = writeQuad(band, {
          position: CORNERS.flatMap(([lx, lz]) => [cx + lx, y, cz + lz]),
          aLocal: CORNERS.flat(),
          aWorld: [worldX, worldY],
          aBand: [tile.mask, tile.side, style],
          aTheirs: colour
        });
        if (!written) break;
      }
    }
    for (const key of breach.layout.veilSides) {
      const side = VEIL_SIDES[key];
      const along0 = side.alongX ? breach.worldX + side.from[0] : breach.worldY + side.from[1];
      const along1 = along0 + 1;
      const [fx, fz] = [x + side.from[0], z + side.from[1]];
      const [tx, tz] = [x + side.to[0], z + side.to[1]];
      const top = surfaceY + VEIL_HEIGHT;
      const written = writeQuad(veil, {
        position: [fx, surfaceY, fz, tx, surfaceY, tz, fx, top, fz, tx, top, tz],
        aVeil: [along0, 0, along1, 0, along0, 1, along1, 1],
        aTheirs: colour
      });
      if (!written) break;
    }
  };

  return {
    clear: () => {
      for (const stream of streams) stream.count = 0;
      bandTilesThisRebuild.clear();
    },
    add,
    commit: () => {
      for (const stream of streams) uploadStream(stream);
    },
    update: (nowMs) => {
      // Wrapped so the float stays precise in long sessions; the shaders only use slow drifts of it.
      const t = (nowMs / 1000) % 3600;
      bandMaterial.uniforms.uTime!.value = t;
      veilMaterial.uniforms.uTime!.value = t;
    },
    dispose: () => {
      for (const stream of streams) {
        parent.remove(stream.mesh);
        stream.geometry.dispose();
      }
      bandMaterial.dispose();
      veilMaterial.dispose();
      frontMaterial.dispose();
    }
  };
};

// 3D rendering of incursion tiles (see client-reach-incursion.ts): rival-held
// land inside the viewer's own reach. Flat at the tile's overlay height:
//   - a two-colour diagonal hatch over each incursion tile -- alternating
//     stripes in the intruder's colour and the viewer's own
//     (incursionHatchColors). The stripes are computed per pixel in a small
//     shader (not sampled from a texture), anti-aliased with fwidth, so their
//     edges stay crisp at every zoom; once stripes shrink below a couple of
//     pixels they blend to the average colour instead of shimmering. UVs run
//     0..1 per tile and the stripe count per tile is whole, so neighbouring
//     tiles' stripes line up.
//   - solid strips just inside every pocket edge in a colour contrasting with
//     the intruder's fill (incursionMarkColor), so the pocket has a crisp
//     outline inside the viewer's bright reach border.
//   - optionally, an animated "breach" look (ember / ink / veil) on the
//     boundary with the viewer's own land, in place of the strip there --
//     see client-map-3d-incursion-breach-fx.ts.
// Rebuilt from the throttled terrain rebuild (clear/add/commit), like the
// dormant-frontier tint it sits beside in client-map-3d-aether-survey-line.ts.

import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Material, Mesh, MeshBasicMaterial, ShaderMaterial, UniformsLib, UniformsUtils } from "three";
import { normalizeColorForThree } from "../client-three-color/client-three-color.js";
import type { IncursionEdges, incursionHatchColors } from "../client-reach-incursion/client-reach-incursion.js";
import { createIncursionBreachFx3D, type IncursionBreachTile } from "./client-map-3d-incursion-breach-fx.js";

type IncursionHatchColors = ReturnType<typeof incursionHatchColors>;

const HATCH_OPACITY = 0.6;
const EDGE_OPACITY = 0.9;
/** Strip width as a fraction of a tile. */
const EDGE_WIDTH = 0.07;
/** Lifts the edge strips just above the hatch so they never z-fight with it. */
const EDGE_LIFT = 0.002;
/** Theirs+mine stripe pairs across a tile; must be whole so stripes continue across tile boundaries (matches the 2D HATCH_STRIPES). */
const HATCH_STRIPE_PAIRS_PER_TILE = 4;
const MAX_EDGE_QUADS_PER_TILE = 4;

export type IncursionOverlay3D = {
  readonly clear: () => void;
  /** With `breach`, `edges` should only list the sides still drawn as plain strips (see client-incursion-breach-layout.ts). */
  readonly addTile: (
    x: number,
    z: number,
    surfaceY: number,
    hatch: IncursionHatchColors,
    edgeColor: string,
    edges: IncursionEdges,
    breach?: IncursionBreachTile
  ) => void;
  readonly commit: () => void;
  /** Advances the breach animation; call every frame. */
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

const HATCH_VERTEX_SHADER = /* glsl */ `
  #include <fog_pars_vertex>
  attribute vec3 hatchTheirs;
  attribute vec3 hatchMine;
  attribute vec2 hatchUv;
  varying vec3 vTheirs;
  varying vec3 vMine;
  varying vec2 vHatchUv;
  void main() {
    vTheirs = hatchTheirs;
    vMine = hatchMine;
    vHatchUv = hatchUv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const HATCH_FRAGMENT_SHADER = /* glsl */ `
  #include <fog_pars_fragment>
  uniform float uOpacity;
  uniform float uStripePairs;
  varying vec3 vTheirs;
  varying vec3 vMine;
  varying vec2 vHatchUv;
  void main() {
    // t advances by 1 per theirs+mine stripe pair along the diagonal.
    float t = (vHatchUv.x + vHatchUv.y) * uStripePairs;
    float tri = abs(fract(t) - 0.5); // 0..0.5; the two colours meet where tri == 0.25
    float aa = fwidth(t);
    float theirsMix = smoothstep(0.25 - aa * 0.75, 0.25 + aa * 0.75, tri);
    vec3 striped = mix(vMine, vTheirs, theirsMix);
    // Sub-pixel stripes would shimmer (moire) when zoomed out -- fade to the average colour instead.
    vec3 color = mix(striped, (vTheirs + vMine) * 0.5, smoothstep(0.2, 0.5, aa));
    gl_FragColor = vec4(color, uOpacity);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const createHatchMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, { uOpacity: { value: HATCH_OPACITY }, uStripePairs: { value: HATCH_STRIPE_PAIRS_PER_TILE } }]),
    vertexShader: HATCH_VERTEX_SHADER,
    fragmentShader: HATCH_FRAGMENT_SHADER,
    fog: true,
    transparent: true,
    depthWrite: false,
    side: DoubleSide
  });

type QuadBuffer = {
  readonly geometry: BufferGeometry;
  readonly mesh: Mesh;
  readonly positions: Float32Array;
  /** One flat-per-quad RGB attribute per name, in the order the colour attribute names were given. */
  readonly colors: readonly Float32Array[];
  readonly uvs: Float32Array | undefined;
  readonly attributeNames: readonly string[];
  readonly maxQuads: number;
  count: number;
};

const createQuadBuffer = (maxQuads: number, material: Material, colorNames: readonly string[], uvName: string | undefined, renderOrder: number): QuadBuffer => {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(maxQuads * 4 * 3);
  const colors = colorNames.map(() => new Float32Array(maxQuads * 4 * 3));
  const uvs = uvName ? new Float32Array(maxQuads * 4 * 2) : undefined;
  const indices = new Uint32Array(maxQuads * 6);
  for (let q = 0; q < maxQuads; q += 1) {
    const b = q * 4;
    indices.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], q * 6);
  }
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  colorNames.forEach((name, i) => geometry.setAttribute(name, new BufferAttribute(colors[i]!, 3)));
  if (uvName && uvs) geometry.setAttribute(uvName, new BufferAttribute(uvs, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  return { geometry, mesh, positions, colors, uvs, attributeNames: ["position", ...colorNames, ...(uvName ? [uvName] : [])], maxQuads, count: 0 };
};

/** Writes one flat quad spanning [x0,x1] x [z0,z1] at height y, one colour per colour attribute. Returns false when the buffer is full. */
const writeQuad = (buf: QuadBuffer, x0: number, x1: number, z0: number, z1: number, y: number, colors: readonly Color[]): boolean => {
  if (buf.count >= buf.maxQuads) return false;
  const v = buf.count * 4;
  buf.positions.set([x0, y, z0, x1, y, z0, x0, y, z1, x1, y, z1], v * 3);
  buf.colors.forEach((array, i) => {
    const color = colors[i]!;
    for (let k = 0; k < 4; k += 1) array.set([color.r, color.g, color.b], (v + k) * 3);
  });
  buf.uvs?.set([0, 1, 1, 1, 0, 0, 1, 0], v * 2);
  buf.count += 1;
  return true;
};

const upload = (buf: QuadBuffer): void => {
  for (const name of buf.attributeNames) {
    const attr = buf.geometry.getAttribute(name) as BufferAttribute;
    attr.clearUpdateRanges();
    attr.addUpdateRange(0, buf.count * 4 * attr.itemSize);
    attr.needsUpdate = true;
  }
  buf.geometry.setDrawRange(0, buf.count * 6);
};

export const createIncursionOverlay3D = (parent: Group, maxTiles: number): IncursionOverlay3D => {
  const hatchMaterial = createHatchMaterial();
  const hatch = createQuadBuffer(maxTiles, hatchMaterial, ["hatchTheirs", "hatchMine"], "hatchUv", 8);
  const edgeMaterial = new MeshBasicMaterial({ toneMapped: false, vertexColors: true, transparent: true, opacity: EDGE_OPACITY, depthWrite: false, side: DoubleSide });
  const edges = createQuadBuffer(maxTiles * MAX_EDGE_QUADS_PER_TILE, edgeMaterial, ["color"], undefined, 9);
  const buffers = [hatch, edges];
  parent.add(hatch.mesh, edges.mesh);
  const breachFx = createIncursionBreachFx3D(parent);
  const theirs = new Color();
  const mine = new Color();
  const edge = new Color();

  const addTile: IncursionOverlay3D["addTile"] = (x, z, surfaceY, hatchColors, edgeColor, tileEdges, breach) => {
    const x0 = x - 0.5;
    const x1 = x + 0.5;
    const z0 = z - 0.5;
    const z1 = z + 0.5;
    theirs.set(normalizeColorForThree(hatchColors.theirs));
    mine.set(normalizeColorForThree(hatchColors.mine));
    if (!writeQuad(hatch, x0, x1, z0, z1, surfaceY, [theirs, mine])) return;
    edge.set(normalizeColorForThree(edgeColor));
    const y = surfaceY + EDGE_LIFT;
    if (tileEdges.north) writeQuad(edges, x0, x1, z0, z0 + EDGE_WIDTH, y, [edge]);
    if (tileEdges.south) writeQuad(edges, x0, x1, z1 - EDGE_WIDTH, z1, y, [edge]);
    if (tileEdges.west) writeQuad(edges, x0, x0 + EDGE_WIDTH, z0, z1, y, [edge]);
    if (tileEdges.east) writeQuad(edges, x1 - EDGE_WIDTH, x1, z0, z1, y, [edge]);
    if (breach) breachFx.add(x, z, surfaceY, breach, theirs, edge);
  };

  return {
    clear: () => {
      for (const b of buffers) b.count = 0;
      breachFx.clear();
    },
    addTile,
    commit: () => {
      for (const b of buffers) upload(b);
      breachFx.commit();
    },
    update: breachFx.update,
    dispose: () => {
      for (const b of buffers) {
        parent.remove(b.mesh);
        b.geometry.dispose();
      }
      breachFx.dispose();
      hatchMaterial.dispose();
      edgeMaterial.dispose();
    }
  };
};

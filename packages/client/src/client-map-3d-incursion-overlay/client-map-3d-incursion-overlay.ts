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
//   - the pocket's edge (client-incursion-breach-layout.ts decides which look
//     goes where): by default the spiked front line all round the pocket, or
//     an ember / ink / veil look on the sides facing the viewer's land
//     (client-map-3d-incursion-breach-fx.ts); every other side, and every
//     side on the old "straight" style, gets a solid strip just inside the
//     pocket in a colour contrasting with the intruder's fill
//     (incursionMarkColor). If the front-line buffer is full, a tile falls
//     back to the strips so it never loses its outline.
// On a hill tile (`drape`) the hatch and strips are fine grids draped over the
// dome (client-map-3d-incursion-hill-drape.ts) rather than one flat plane the
// hill's bumps broke through.
// Rebuilt from the throttled terrain rebuild (clear/add/commit), like the
// dormant-frontier tint it sits beside in client-map-3d-aether-survey-line.ts.

import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Material, Mesh, MeshBasicMaterial, ShaderMaterial, UniformsLib, UniformsUtils } from "three";
import { normalizeColorForThree } from "../client-three-color/client-three-color.js";
import type { IncursionEdges, incursionHatchColors } from "../client-reach-incursion/client-reach-incursion.js";
import { createIncursionBreachFx3D, type IncursionBreachFx3D, type IncursionBreachTile } from "./client-map-3d-incursion-breach-fx.js";
import type { TileDrapeHeightAt } from "./client-map-3d-incursion-hill-drape.js";

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
/** Cells per side of a draped hill tile; matches the dome mesh's SUBDIV (client-map-3d-hills.ts) so the drape stays parallel to it. */
const HILL_SUBDIV = 10;
/**
 * Hatched hill tiles drawn draped per rebuild. Pockets are a handful of tiles
 * and hills a minority terrain, so this is generous; past it a hill tile falls
 * back to the flat quad rather than going unhatched.
 */
const MAX_HILL_TILES = 256;

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
    breach?: IncursionBreachTile,
    /** On a hill tile: the surface to drape the hatch and strips over (surfaceY still seats the breach front line). */
    drape?: TileDrapeHeightAt
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

type PatchBuffer = {
  readonly geometry: BufferGeometry;
  readonly mesh: Mesh;
  readonly positions: Float32Array;
  /** One flat-per-patch RGB attribute per name, in the order the colour attribute names were given. */
  readonly colors: readonly Float32Array[];
  readonly uvs: Float32Array | undefined;
  readonly attributeNames: readonly string[];
  readonly maxPatches: number;
  /** Each patch is a cols x rows grid of cells: 1 x 1 for a flat quad, finer for one draped over a hill. */
  readonly cols: number;
  readonly rows: number;
  count: number;
};

const vertsPerPatch = (buf: Pick<PatchBuffer, "cols" | "rows">): number => (buf.cols + 1) * (buf.rows + 1);

const createPatchBuffer = (
  maxPatches: number,
  cols: number,
  rows: number,
  material: Material,
  colorNames: readonly string[],
  uvName: string | undefined,
  renderOrder: number
): PatchBuffer => {
  const geometry = new BufferGeometry();
  const verts = maxPatches * vertsPerPatch({ cols, rows });
  const positions = new Float32Array(verts * 3);
  const colors = colorNames.map(() => new Float32Array(verts * 3));
  const uvs = uvName ? new Float32Array(verts * 2) : undefined;
  const indicesPerPatch = cols * rows * 6;
  const indices = new Uint32Array(maxPatches * indicesPerPatch);
  let i = 0;
  for (let q = 0; q < maxPatches; q += 1) {
    const base = q * vertsPerPatch({ cols, rows });
    for (let b = 0; b < rows; b += 1) {
      for (let a = 0; a < cols; a += 1) {
        // Same diagonal split as the hill dome mesh (client-map-3d-hills.ts), so a draped patch stays parallel to it.
        const i00 = base + b * (cols + 1) + a;
        const i01 = i00 + cols + 1;
        indices.set([i00, i01, i00 + 1, i00 + 1, i01, i01 + 1], i);
        i += 6;
      }
    }
  }
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  colorNames.forEach((name, n) => geometry.setAttribute(name, new BufferAttribute(colors[n]!, 3)));
  if (uvName && uvs) geometry.setAttribute(uvName, new BufferAttribute(uvs, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  return { geometry, mesh, positions, colors, uvs, attributeNames: ["position", ...colorNames, ...(uvName ? [uvName] : [])], maxPatches, cols, rows, count: 0 };
};

/** Scene-space height of a point on the patch being written. */
type PatchHeightAt = (x: number, z: number) => number;

/**
 * Writes one patch spanning [x0,x1] x [z0,z1], its vertices at heightAt, one colour per colour
 * attribute. `alongZ` runs the patch's columns down z instead of across x (a draped west/east
 * strip). UVs run 0..1 across the patch, matching the flat quad's. Returns false when the buffer is full.
 */
const writePatch = (
  buf: PatchBuffer,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  heightAt: PatchHeightAt,
  colors: readonly Color[],
  alongZ = false
): boolean => {
  if (buf.count >= buf.maxPatches) return false;
  const { cols, rows } = buf;
  let v = buf.count * vertsPerPatch(buf);
  for (let b = 0; b <= rows; b += 1) {
    for (let a = 0; a <= cols; a += 1) {
      const fx = alongZ ? b / rows : a / cols;
      const fz = alongZ ? a / cols : b / rows;
      const x = x0 + (x1 - x0) * fx;
      const z = z0 + (z1 - z0) * fz;
      buf.positions.set([x, heightAt(x, z), z], v * 3);
      buf.colors.forEach((array, n) => {
        const color = colors[n]!;
        array.set([color.r, color.g, color.b], v * 3);
      });
      buf.uvs?.set([fx, 1 - fz], v * 2);
      v += 1;
    }
  }
  buf.count += 1;
  return true;
};

const upload = (buf: PatchBuffer): void => {
  for (const name of buf.attributeNames) {
    const attr = buf.geometry.getAttribute(name) as BufferAttribute;
    attr.clearUpdateRanges();
    attr.addUpdateRange(0, buf.count * vertsPerPatch(buf) * attr.itemSize);
    attr.needsUpdate = true;
  }
  buf.geometry.setDrawRange(0, buf.count * buf.cols * buf.rows * 6);
};

export const createIncursionOverlay3D = (parent: Group, maxTiles: number): IncursionOverlay3D => {
  const hatchMaterial = createHatchMaterial();
  const hatch = createPatchBuffer(maxTiles, 1, 1, hatchMaterial, ["hatchTheirs", "hatchMine"], "hatchUv", 8);
  const edgeMaterial = new MeshBasicMaterial({ toneMapped: false, vertexColors: true, transparent: true, opacity: EDGE_OPACITY, depthWrite: false, side: DoubleSide });
  const edges = createPatchBuffer(maxTiles * MAX_EDGE_QUADS_PER_TILE, 1, 1, edgeMaterial, ["color"], undefined, 9);
  const buffers = [hatch, edges];
  parent.add(hatch.mesh, edges.mesh);
  // Draped hill buffers, also created on first use: most views hatch no hill.
  let hill: { readonly hatch: PatchBuffer; readonly edges: PatchBuffer } | undefined;
  const hillBuffers = (): { readonly hatch: PatchBuffer; readonly edges: PatchBuffer } => {
    if (hill) return hill;
    const tiles = Math.min(maxTiles, MAX_HILL_TILES);
    hill = {
      hatch: createPatchBuffer(tiles, HILL_SUBDIV, HILL_SUBDIV, hatchMaterial, ["hatchTheirs", "hatchMine"], "hatchUv", 8),
      edges: createPatchBuffer(tiles * MAX_EDGE_QUADS_PER_TILE, HILL_SUBDIV, 1, edgeMaterial, ["color"], undefined, 9)
    };
    buffers.push(hill.hatch, hill.edges);
    parent.add(hill.hatch.mesh, hill.edges.mesh);
    return hill;
  };
  // Created on first use, so a client with no breached pocket on screen (or on
  // the old straight style) never pays for the breach buffers or shaders.
  let breachFx: IncursionBreachFx3D | undefined;
  const theirs = new Color();
  const mine = new Color();
  const edge = new Color();

  const addTile: IncursionOverlay3D["addTile"] = (x, z, surfaceY, hatchColors, edgeColor, tileEdges, breach, drape) => {
    const x0 = x - 0.5;
    const x1 = x + 0.5;
    const z0 = z - 0.5;
    const z1 = z + 0.5;
    theirs.set(normalizeColorForThree(hatchColors.theirs));
    mine.set(normalizeColorForThree(hatchColors.mine));
    // Past the hill budget a hill tile falls back to the flat quad.
    const hillHeightAt: PatchHeightAt | undefined = drape && ((px, pz) => drape(px - x0, pz - z0));
    const draped = hillHeightAt && writePatch(hillBuffers().hatch, x0, x1, z0, z1, hillHeightAt, [theirs, mine]) ? hillHeightAt : undefined;
    if (!draped && !writePatch(hatch, x0, x1, z0, z1, () => surfaceY, [theirs, mine])) return;
    edge.set(normalizeColorForThree(edgeColor));
    let strips = tileEdges;
    if (breach && breach.style !== "straight") {
      breachFx ??= createIncursionBreachFx3D(parent);
      // A full front-line buffer draws nothing for this tile: give it the plain strips instead.
      if (!breachFx.add(x, z, surfaceY, breach, theirs, edge)) {
        const f = breach.layout.frontEdges;
        strips = { north: strips.north || f.north, east: strips.east || f.east, south: strips.south || f.south, west: strips.west || f.west };
      }
    }
    const stripBuf = draped ? hillBuffers().edges : edges;
    const stripY: PatchHeightAt = draped ? (px, pz) => draped(px, pz) + EDGE_LIFT : () => surfaceY + EDGE_LIFT;
    if (strips.north) writePatch(stripBuf, x0, x1, z0, z0 + EDGE_WIDTH, stripY, [edge]);
    if (strips.south) writePatch(stripBuf, x0, x1, z1 - EDGE_WIDTH, z1, stripY, [edge]);
    if (strips.west) writePatch(stripBuf, x0, x0 + EDGE_WIDTH, z0, z1, stripY, [edge], true);
    if (strips.east) writePatch(stripBuf, x1 - EDGE_WIDTH, x1, z0, z1, stripY, [edge], true);
  };

  return {
    clear: () => {
      for (const b of buffers) b.count = 0;
      breachFx?.clear();
    },
    addTile,
    commit: () => {
      for (const b of buffers) upload(b);
      breachFx?.commit();
    },
    update: (nowMs) => breachFx?.update(nowMs),
    dispose: () => {
      for (const b of buffers) {
        parent.remove(b.mesh);
        b.geometry.dispose();
      }
      breachFx?.dispose();
      hatchMaterial.dispose();
      edgeMaterial.dispose();
    }
  };
};

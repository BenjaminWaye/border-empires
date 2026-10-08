// v9 river valleys: real carved river channels in the 3D terrain.
//
// The regular heightfield (client-map-3d-heightfield.ts) has one vertex per
// tile corner, so the most it can do along a river is tilt whole tiles --
// a shallow, tile-wide V, not a channel. So every tile touching a river
// corner is left out of the heightfield (the same way hills tiles are) and
// redrawn here as an 8x8-subdivided patch, with the same shared terrain
// material and attributes. Each patch vertex sits on the heightfield's own
// surface minus the river trench profile (client-map-3d-rivers-channel.ts):
// a flat bed and smoothly sloping banks around the river's smoothed
// centreline, darkening to wet mud toward the water.
//
// Seamless by construction: the patch surface *is* the heightfield surface
// wherever the trench depth is 0, and the trench never reaches a tile edge
// shared with a regular (non-valley) tile -- such an edge is ~1 tile from
// the river, the trench at most RIVER_BANK_REACH (0.3) wide. Patch vertex colours/masks are
// interpolated from the heightfield's rendered corners (cornerAttributesAt),
// so textures and tints match too.
import { BufferAttribute, BufferGeometry, Mesh, type Material, type Scene } from "three";
import type { HeightfieldCornerAttributes } from "../client-map-3d-heightfield/client-map-3d-heightfield-corners.js";
import { SKIRT_BOTTOM_Y } from "../client-map-3d-heightfield/client-map-3d-heightfield.js";
import { COVE_RADIUS, riverCoveY } from "./client-map-3d-river-edge-water.js";
import { heightfieldSurfaceY, nearestOnSegments, RIVER_WATER_DEPTH, riverDescentScale, riverTrenchDepth, TRENCH_DEPTH, type CenterlineIndex, type NearestCenterline } from "./client-map-3d-rivers-channel.js";

const SUBDIVISIONS = 8;
// A patch edge has SUBDIVISIONS+1 vertices where the neighbouring regular
// heightfield tile's edge has only 2 (a T-junction): the surfaces match
// exactly, but the rasteriser can leave the odd pixel along that edge
// covered by neither -- visible as a dotted line. A skirt dropped from every
// patch edge seals those gaps. Kept tiny on purpose: a visibly tall skirt
// (0.05) showed through as dark lines along the patch tile edges.
const SKIRT_DROP = 0.002;
const MUD: readonly [number, number, number] = [0.3, 0.26, 0.16];
const MUD_MIX = 0.8;
const MUD_RAMP = 0.45;
// Waterline cue: a dark wet band on the lower bank, just above the water.
// Without it nothing told the eye the water sits below the ground, so it
// read as a film floating on top (docs/rivers-remake-plan.md, Phase 0).
const WET_BANK: readonly [number, number, number] = [0.11, 0.1, 0.07];
const WET_BANK_MIX = 0.6;
const WET_BANK_START = 0.45; // fraction of the water depth where the band begins

const smooth01 = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** Bank colour for a valley vertex `depth` below the ground (writes into `out`). */
/** How much a valley vertex `depth` below the ground is mud (0..MUD_MIX). */
export const riverMudAmount = (depth: number): number => smooth01(depth / (TRENCH_DEPTH * MUD_RAMP)) * MUD_MIX;

export const riverBankColor = (base: readonly [number, number, number], depth: number, out: [number, number, number]): void => {
  const mud = riverMudAmount(depth);
  const wetLine = smooth01((depth - RIVER_WATER_DEPTH * WET_BANK_START) / (RIVER_WATER_DEPTH * (1 - WET_BANK_START))) * WET_BANK_MIX;
  for (let k = 0; k < 3; k += 1) {
    const muddy = base[k]! * (1 - mud) + MUD[k]! * mud;
    out[k] = muddy * (1 - wetLine) + WET_BANK[k]! * wetLine;
  }
};

export type RiverValleyTile = {
  /** Tile's top-left corner in camera-relative scene coords. */
  readonly sceneX: number;
  readonly sceneZ: number;
  /** Tile's top-left corner in (wrapped) world coords, and the wrapped +1 corner. */
  readonly worldX: number;
  readonly worldZ: number;
  readonly worldX1: number;
  readonly worldZ1: number;
  /**
   * Edges facing a sea or unexplored tile (a coastline / fog edge). The
   * heightfield skips its own coast skirt for valley tiles, so the patch
   * drops a full-height skirt there; without it the coast showed a black
   * crack down past the land edge (worst at river mouths).
   */
  readonly holeEdges?: { readonly top: boolean; readonly bottom: boolean; readonly left: boolean; readonly right: boolean };
};

export type RiverValleyRebuildInputs = {
  readonly tiles: readonly RiverValleyTile[];
  readonly camX: number;
  readonly camY: number;
  readonly centerlines: CenterlineIndex;
  readonly cornerYAt: (cornerX: number, cornerZ: number) => number;
  readonly cornerAttributesAt: (cornerX: number, cornerZ: number, out: HeightfieldCornerAttributes) => boolean;
  /** River mouth corners (scene coords): the land around each is cut into a cove (riverCoveY). */
  readonly coves?: ReadonlyArray<{ readonly x: number; readonly z: number }>;
  /** Distance (scene coords) to the nearest sea tile; the cove only cuts near the coast. */
  readonly seaDistanceAt?: (x: number, z: number) => number;
};

export type RiverValley = {
  readonly rebuild: (inputs: RiverValleyRebuildInputs) => void;
  readonly dispose: () => void;
};

type CornerSet = readonly [HeightfieldCornerAttributes, HeightfieldCornerAttributes, HeightfieldCornerAttributes, HeightfieldCornerAttributes];

// Same two-triangle split the heightfield rasterises its vertex attributes
// across (a=(0,0), b=(1,0), c=(0,1), d=(1,1); diagonal b-c).
const triLerp = (c: CornerSet, key: keyof HeightfieldCornerAttributes, u: number, v: number): number => {
  const [c00, c10, c01, c11] = c;
  if (u + v <= 1) return c00[key] + (c10[key] - c00[key]) * u + (c01[key] - c00[key]) * v;
  return c11[key] + (c01[key] - c11[key]) * (1 - u) + (c10[key] - c11[key]) * (1 - v);
};

const blankCorner = (): HeightfieldCornerAttributes => ({ y: 0, r: 0, g: 0, b: 0, forestZone: 0, tundraZone: 0 });

export const createRiverValley = (scene: Scene, terrainMaterial: Material): RiverValley => {
  let mesh: Mesh | null = null;
  let geometry: BufferGeometry | null = null;
  const corners: CornerSet = [blankCorner(), blankCorner(), blankCorner(), blankCorner()];
  const baseColor: [number, number, number] = [0, 0, 0];
  const bankColor: [number, number, number] = [0, 0, 0];

  const clear = (): void => {
    if (mesh) scene.remove(mesh);
    geometry?.dispose();
    mesh = null;
    geometry = null;
  };

  const rebuild = (inputs: RiverValleyRebuildInputs): void => {
    clear();
    const { tiles, camX, camY, centerlines, cornerYAt, cornerAttributesAt } = inputs;
    const coves = inputs.coves ?? [];
    const coveDistance = (x: number, z: number): number => {
      let best = Infinity;
      for (const c of coves) best = Math.min(best, Math.hypot(x - c.x, z - c.z));
      return best;
    };
    const near: NearestCenterline = { distance: 0, halfWidth: 0, descent: 0 };
    const n = SUBDIVISIONS;
    const perTile = (n + 1) * (n + 1);
    const drawn = tiles.filter(
      (t) =>
        cornerAttributesAt(t.worldX, t.worldZ, corners[0]) &&
        cornerAttributesAt(t.worldX1, t.worldZ, corners[1]) &&
        cornerAttributesAt(t.worldX, t.worldZ1, corners[2]) &&
        cornerAttributesAt(t.worldX1, t.worldZ1, corners[3])
    );
    if (drawn.length === 0) return;
    const skirtVerts = 4 * (n + 1);
    const vertsPerTile = perTile + skirtVerts;
    const positions = new Float32Array(drawn.length * vertsPerTile * 3);
    const normals = new Float32Array(drawn.length * vertsPerTile * 3);
    const colors = new Float32Array(drawn.length * vertsPerTile * 3);
    const uvs = new Float32Array(drawn.length * vertsPerTile * 2);
    const forestZones = new Float32Array(drawn.length * vertsPerTile);
    const tundraZones = new Float32Array(drawn.length * vertsPerTile);
    const rockZones = new Float32Array(drawn.length * vertsPerTile);
    const indices = new Uint32Array(drawn.length * (n * n + 4 * n) * 6);
    const padHeights = new Float32Array((n + 3) * (n + 3));
    const padDepths = new Float32Array((n + 3) * (n + 3));
    let vi = 0;
    let ii = 0;
    for (const t of drawn) {
      cornerAttributesAt(t.worldX, t.worldZ, corners[0]);
      cornerAttributesAt(t.worldX1, t.worldZ, corners[1]);
      cornerAttributesAt(t.worldX, t.worldZ1, corners[2]);
      cornerAttributesAt(t.worldX1, t.worldZ1, corners[3]);
      const base = vi;
      // Heights on a grid padded by one sample on every side, each computed
      // exactly once; normals then come from neighbouring samples (central
      // differences). Padding samples use the same global height function,
      // so normals agree across patch edges. Candidate river segments are
      // gathered once per tile, not per vertex.
      const segments = centerlines.segmentsNearTile(Math.floor(t.sceneX), Math.floor(t.sceneZ));
      const stride = n + 3;
      for (let j = -1; j <= n + 1; j += 1) {
        for (let i = -1; i <= n + 1; i += 1) {
          const u = i / n;
          const v = j / n;
          const inside = i >= 0 && i <= n && j >= 0 && j <= n;
          const x = t.sceneX + u;
          const z = t.sceneZ + v;
          const baseY = inside ? triLerp(corners, "y", u, v) : heightfieldSurfaceY(x, z, camX, camY, cornerYAt);
          const hit = segments.length > 0 && nearestOnSegments(segments, x, z, near);
          // padDepths keeps the normal profile depth (bank colouring is
          // relative to it); near a mouth the cut itself goes deeper.
          const trench = hit ? riverTrenchDepth(near.distance, near.halfWidth) : 0;
          const carved = baseY - (hit ? trench * riverDescentScale(baseY, near.descent) : 0);
          const toCove = coves.length > 0 ? coveDistance(x, z) : Infinity;
          const height = toCove < COVE_RADIUS ? Math.min(carved, riverCoveY(baseY, toCove, inputs.seaDistanceAt?.(x, z) ?? 0)) : carved;
          padHeights[(j + 1) * stride + (i + 1)] = height;
          // Cove ground colours like the wet riverbed, not dry land.
          padDepths[(j + 1) * stride + (i + 1)] = Math.max(trench, Math.min(TRENCH_DEPTH, baseY - height));
        }
      }
      for (let j = 0; j <= n; j += 1) {
        for (let i = 0; i <= n; i += 1) {
          const u = i / n;
          const v = j / n;
          const x = t.sceneX + u;
          const z = t.sceneZ + v;
          const p = (j + 1) * stride + (i + 1);
          const depth = padDepths[p]!;
          positions[vi * 3] = x;
          positions[vi * 3 + 1] = padHeights[p]!;
          positions[vi * 3 + 2] = z;
          const nx = -(padHeights[p + 1]! - padHeights[p - 1]!);
          const ny = 2 / n;
          const nz = -(padHeights[p + stride]! - padHeights[p - stride]!);
          const nlen = Math.hypot(nx, ny, nz) || 1;
          normals[vi * 3] = nx / nlen;
          normals[vi * 3 + 1] = ny / nlen;
          normals[vi * 3 + 2] = nz / nlen;
          baseColor[0] = triLerp(corners, "r", u, v);
          baseColor[1] = triLerp(corners, "g", u, v);
          baseColor[2] = triLerp(corners, "b", u, v);
          riverBankColor(baseColor, depth, bankColor);
          colors[vi * 3] = bankColor[0];
          colors[vi * 3 + 1] = bankColor[1];
          colors[vi * 3 + 2] = bankColor[2];
          // World-anchored UVs, like the heightfield's, so the painted
          // terrain textures continue across the patch boundary.
          uvs[vi * 2] = camX + x;
          uvs[vi * 2 + 1] = camY + z;
          forestZones[vi] = triLerp(corners, "forestZone", u, v) * (1 - riverMudAmount(depth));
          tundraZones[vi] = triLerp(corners, "tundraZone", u, v);
          rockZones[vi] = 0;
          vi += 1;
        }
      }
      // Skirt: copy each edge's vertices SKIRT_DROP lower (same attributes),
      // or all the way down to the heightfield's SKIRT_BOTTOM_Y on a coast.
      const copyDown = (src: number, toBottom: boolean): number => {
        positions[vi * 3] = positions[src * 3]!;
        positions[vi * 3 + 1] = toBottom ? SKIRT_BOTTOM_Y : positions[src * 3 + 1]! - SKIRT_DROP;
        positions[vi * 3 + 2] = positions[src * 3 + 2]!;
        for (let k = 0; k < 3; k += 1) {
          normals[vi * 3 + k] = normals[src * 3 + k]!;
          colors[vi * 3 + k] = colors[src * 3 + k]!;
        }
        // Offset V by the drop so the terrain shader's normal-map tangent
        // frame (built from UV derivatives) isn't degenerate on the skirt.
        uvs[vi * 2] = uvs[src * 2]!;
        uvs[vi * 2 + 1] = uvs[src * 2 + 1]! + SKIRT_DROP;
        forestZones[vi] = forestZones[src]!;
        tundraZones[vi] = tundraZones[src]!;
        rockZones[vi] = 0;
        return vi++;
      };
      const holes = t.holeEdges;
      const edges: ReadonlyArray<readonly [(k: number) => number, boolean]> = [
        [(k) => base + k, holes?.top ?? false], // top row
        [(k) => base + n * (n + 1) + k, holes?.bottom ?? false], // bottom row
        [(k) => base + k * (n + 1), holes?.left ?? false], // left column
        [(k) => base + k * (n + 1) + n, holes?.right ?? false] // right column
      ];
      for (const [edge, toBottom] of edges) {
        const dropped: number[] = [];
        for (let k = 0; k <= n; k += 1) dropped.push(copyDown(edge(k), toBottom));
        for (let k = 0; k < n; k += 1) {
          const a = edge(k);
          const b = edge(k + 1);
          const c = dropped[k]!;
          const d = dropped[k + 1]!;
          indices[ii++] = a;
          indices[ii++] = c;
          indices[ii++] = b;
          indices[ii++] = b;
          indices[ii++] = c;
          indices[ii++] = d;
        }
      }
      for (let j = 0; j < n; j += 1) {
        for (let i = 0; i < n; i += 1) {
          const a = base + j * (n + 1) + i;
          const b = a + 1;
          const c = a + (n + 1);
          const d = c + 1;
          indices[ii++] = a;
          indices[ii++] = c;
          indices[ii++] = b;
          indices[ii++] = b;
          indices[ii++] = c;
          indices[ii++] = d;
        }
      }
    }
    geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new BufferAttribute(normals, 3));
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
    geometry.setAttribute("forestZone", new BufferAttribute(forestZones, 1));
    geometry.setAttribute("tundraZone", new BufferAttribute(tundraZones, 1));
    geometry.setAttribute("rockZone", new BufferAttribute(rockZones, 1));
    geometry.setIndex(new BufferAttribute(indices, 1));
    mesh = new Mesh(geometry, terrainMaterial);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    scene.add(mesh);
  };

  return { rebuild, dispose: clear };
};

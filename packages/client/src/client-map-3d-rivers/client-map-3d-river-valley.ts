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
// the river, the trench at most ~0.46 wide. Patch vertex colours/masks are
// interpolated from the heightfield's rendered corners (cornerAttributesAt),
// so textures and tints match too.
import { BufferAttribute, BufferGeometry, Mesh, type Material, type Scene } from "three";
import type { HeightfieldCornerAttributes } from "../client-map-3d-heightfield/client-map-3d-heightfield-corners.js";
import { riverTrenchDepth, TRENCH_DEPTH, heightfieldSurfaceY, type CenterlineIndex } from "./client-map-3d-rivers-channel.js";

const SUBDIVISIONS = 8;
// A patch edge has SUBDIVISIONS+1 vertices where the neighbouring regular
// heightfield tile's edge has only 2 (a T-junction): the surfaces match
// exactly, but the rasteriser can leave the odd pixel along that edge
// covered by neither -- visible as a dotted line. A skirt dropped from every
// patch edge seals those gaps. Kept tiny on purpose: a visibly tall skirt
// (0.05) showed through as dark lines along the patch tile edges.
const SKIRT_DROP = 0.002;
const NORMAL_EPS = 0.03;
const MUD: readonly [number, number, number] = [0.3, 0.26, 0.16];
const MUD_MIX = 0.8;
const MUD_RAMP = 0.45;

export type RiverValleyTile = {
  /** Tile's top-left corner in camera-relative scene coords. */
  readonly sceneX: number;
  readonly sceneZ: number;
  /** Tile's top-left corner in (wrapped) world coords, and the wrapped +1 corner. */
  readonly worldX: number;
  readonly worldZ: number;
  readonly worldX1: number;
  readonly worldZ1: number;
};

export type RiverValleyRebuildInputs = {
  readonly tiles: readonly RiverValleyTile[];
  readonly camX: number;
  readonly camY: number;
  readonly centerlines: CenterlineIndex;
  readonly cornerYAt: (cornerX: number, cornerZ: number) => number;
  readonly cornerAttributesAt: (cornerX: number, cornerZ: number, out: HeightfieldCornerAttributes) => boolean;
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

  const clear = (): void => {
    if (mesh) scene.remove(mesh);
    geometry?.dispose();
    mesh = null;
    geometry = null;
  };

  const rebuild = (inputs: RiverValleyRebuildInputs): void => {
    clear();
    const { tiles, camX, camY, centerlines, cornerYAt, cornerAttributesAt } = inputs;
    const heightAt = (x: number, z: number): number => {
      const base = heightfieldSurfaceY(x, z, camX, camY, cornerYAt);
      const near = centerlines.nearest(x, z);
      return base - (near ? riverTrenchDepth(near.distance, near.halfWidth) : 0);
    };

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
    let vi = 0;
    let ii = 0;
    for (const t of drawn) {
      cornerAttributesAt(t.worldX, t.worldZ, corners[0]);
      cornerAttributesAt(t.worldX1, t.worldZ, corners[1]);
      cornerAttributesAt(t.worldX, t.worldZ1, corners[2]);
      cornerAttributesAt(t.worldX1, t.worldZ1, corners[3]);
      const base = vi;
      for (let j = 0; j <= n; j += 1) {
        for (let i = 0; i <= n; i += 1) {
          const u = i / n;
          const v = j / n;
          const x = t.sceneX + u;
          const z = t.sceneZ + v;
          const near = centerlines.nearest(x, z);
          const depth = near ? riverTrenchDepth(near.distance, near.halfWidth) : 0;
          positions[vi * 3] = x;
          positions[vi * 3 + 1] = heightfieldSurfaceY(x, z, camX, camY, cornerYAt) - depth;
          positions[vi * 3 + 2] = z;
          const dx = heightAt(x + NORMAL_EPS, z) - heightAt(x - NORMAL_EPS, z);
          const dz = heightAt(x, z + NORMAL_EPS) - heightAt(x, z - NORMAL_EPS);
          const nx = -dx;
          const ny = 2 * NORMAL_EPS;
          const nz = -dz;
          const nlen = Math.hypot(nx, ny, nz) || 1;
          normals[vi * 3] = nx / nlen;
          normals[vi * 3 + 1] = ny / nlen;
          normals[vi * 3 + 2] = nz / nlen;
          // Ramps up fast so the bank reads as wet earth from its top edge,
          // not only where it's already under water.
          const wet = Math.min(1, depth / (TRENCH_DEPTH * MUD_RAMP));
          const mud = wet * wet * (3 - 2 * wet) * MUD_MIX;
          colors[vi * 3] = triLerp(corners, "r", u, v) * (1 - mud) + MUD[0] * mud;
          colors[vi * 3 + 1] = triLerp(corners, "g", u, v) * (1 - mud) + MUD[1] * mud;
          colors[vi * 3 + 2] = triLerp(corners, "b", u, v) * (1 - mud) + MUD[2] * mud;
          // World-anchored UVs, like the heightfield's, so the painted
          // terrain textures continue across the patch boundary.
          uvs[vi * 2] = camX + x;
          uvs[vi * 2 + 1] = camY + z;
          forestZones[vi] = triLerp(corners, "forestZone", u, v) * (1 - mud);
          tundraZones[vi] = triLerp(corners, "tundraZone", u, v);
          rockZones[vi] = 0;
          vi += 1;
        }
      }
      // Skirt: copy each edge's vertices SKIRT_DROP lower (same attributes).
      const copyDown = (src: number): number => {
        positions[vi * 3] = positions[src * 3]!;
        positions[vi * 3 + 1] = positions[src * 3 + 1]! - SKIRT_DROP;
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
      const edges: ReadonlyArray<(k: number) => number> = [
        (k) => base + k, // top row
        (k) => base + n * (n + 1) + k, // bottom row
        (k) => base + k * (n + 1), // left column
        (k) => base + k * (n + 1) + n // right column
      ];
      for (const edge of edges) {
        const dropped: number[] = [];
        for (let k = 0; k <= n; k += 1) dropped.push(copyDown(edge(k)));
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

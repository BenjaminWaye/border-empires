import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  RGBAFormat,
  RepeatWrapping,
  Scene,
  UnsignedByteType
} from "three";
import { RENDER_ORDER } from "../client-map-3d-render-order.js";

// Faint diagonal hatching over unowned land inside another empire's reach:
// "his reach, not his land" (docs/map-readability-plan.md, workstream 3). The
// ownership fill says WHO owns a tile; this pattern says whose reach covers
// ground nobody owns, so it never reads as the solid tint of owned land.
// Flat quads only: hills are skipped by the caller (the ownership overlay's
// dome draping is not worth duplicating for a hint layer; the reach boundary
// pylons still mark those tiles).

const TEXTURE_SIZE = 32;
// Stripe repeat along x+y, in texels. Divides TEXTURE_SIZE so the pattern tiles seamlessly across neighbouring quads.
const STRIPE_PERIOD = 16;
const STRIPE_WIDTH = 4;
export const RIVAL_REACH_HATCH_OPACITY = 0.55;

const VERTS_PER_TILE = 4;
const INDICES_PER_TILE = 6;

/** Diagonal-stripe alpha mask: opaque white stripes on transparent texels. */
export const createHatchTexture = (): DataTexture => {
  const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const onStripe = (x + y) % STRIPE_PERIOD < STRIPE_WIDTH;
      const offset = (y * TEXTURE_SIZE + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = onStripe ? 255 : 0;
    }
  }
  const texture = new DataTexture(data, TEXTURE_SIZE, TEXTURE_SIZE, RGBAFormat, UnsignedByteType);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
};

/**
 * The rival whose reach should hatch this tile: unowned land whose wire
 * `reachOwnerId` is another empire. Your own reach and barbarian reach
 * (environment, not a bordered empire) never hatch.
 */
export const rivalReachHatchOwnerId = (
  tile: { readonly terrain: string; readonly ownerId?: string | undefined; readonly reachOwnerId?: string | undefined },
  viewerId: string
): string | undefined => {
  const reachOwnerId = tile.reachOwnerId;
  if (tile.terrain !== "LAND" || tile.ownerId || !reachOwnerId) return undefined;
  if (reachOwnerId === viewerId || reachOwnerId.startsWith("barbarian-")) return undefined;
  return reachOwnerId;
};

export type RivalReachHatch = {
  readonly mesh: Mesh;
  readonly clear: () => void;
  /** Same corner layout as OwnershipOverlay.addTile's x/z span; Y values are the ground heights at each corner. Returns false once the buffer is full. */
  readonly addTile: (
    x0: number, x1: number, z0: number, z1: number,
    y00: number, y10: number, y01: number, y11: number,
    color: Color
  ) => boolean;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createRivalReachHatch = (scene: Scene, maxTiles: number): RivalReachHatch => {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(maxTiles * VERTS_PER_TILE * 3);
  const colors = new Float32Array(maxTiles * VERTS_PER_TILE * 3);
  const uvs = new Float32Array(maxTiles * VERTS_PER_TILE * 2);
  const indices = new Uint32Array(maxTiles * INDICES_PER_TILE);
  const positionAttribute = new BufferAttribute(positions, 3);
  const colorAttribute = new BufferAttribute(colors, 3);
  const uvAttribute = new BufferAttribute(uvs, 2);
  const indexAttribute = new BufferAttribute(indices, 1);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("color", colorAttribute);
  geometry.setAttribute("uv", uvAttribute);
  geometry.setIndex(indexAttribute);
  geometry.setDrawRange(0, 0);

  const texture = createHatchTexture();
  const material = new MeshBasicMaterial({
    toneMapped: false,
    map: texture,
    vertexColors: true,
    transparent: true,
    opacity: RIVAL_REACH_HATCH_OPACITY,
    blending: NormalBlending,
    depthWrite: false,
    side: DoubleSide
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  // Above the settled/frontier ownership fill, below river water and the fog layers.
  mesh.renderOrder = RENDER_ORDER.ownershipFrontier + 0.25;
  mesh.visible = false;
  scene.add(mesh);

  let count = 0;

  const clear = (): void => {
    count = 0;
    geometry.setDrawRange(0, 0);
    mesh.visible = false;
  };

  const addTile: RivalReachHatch["addTile"] = (x0, x1, z0, z1, y00, y10, y01, y11, color) => {
    if (count >= maxTiles) return false;
    const vertexBase = count * VERTS_PER_TILE;
    const corners: ReadonlyArray<readonly [number, number, number, number, number]> = [
      [x0, y00, z0, 0, 0],
      [x1, y10, z0, 1, 0],
      [x0, y01, z1, 0, 1],
      [x1, y11, z1, 1, 1]
    ];
    corners.forEach(([x, y, z, u, v], corner) => {
      const vertex = vertexBase + corner;
      positions[vertex * 3] = x;
      positions[vertex * 3 + 1] = y;
      positions[vertex * 3 + 2] = z;
      colors[vertex * 3] = color.r;
      colors[vertex * 3 + 1] = color.g;
      colors[vertex * 3 + 2] = color.b;
      uvs[vertex * 2] = u;
      uvs[vertex * 2 + 1] = v;
    });
    const indexBase = count * INDICES_PER_TILE;
    indices.set([vertexBase, vertexBase + 2, vertexBase + 1, vertexBase + 1, vertexBase + 2, vertexBase + 3], indexBase);
    count += 1;
    return true;
  };

  const commit = (): void => {
    positionAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
    uvAttribute.needsUpdate = true;
    indexAttribute.needsUpdate = true;
    geometry.setDrawRange(0, count * INDICES_PER_TILE);
    mesh.visible = count > 0;
  };

  const dispose = (): void => {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
    texture.dispose();
  };

  return { mesh, clear, addTile, commit, dispose };
};

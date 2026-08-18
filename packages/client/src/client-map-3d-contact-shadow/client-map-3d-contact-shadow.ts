// Ground occupants — structures, towns, watchtowers, resources, deposits —
// sit on the terrain with nothing connecting them to it: there is no shadow
// map, no `aoMap`, and no ground decal anywhere in the renderer, so
// everything on the map reads as pasted on top of its tile rather than
// standing on it.
//
// This is the cheap half of that fix. Real shadow mapping is a poor trade at
// this camera range — the ground footprint at MIN_ZOOM is ~91 tiles deep by up
// to ~185 wide, so a single 2048² directional map resolves a 1-tile object's
// shadow to ~11 texels (blocky, and it crawls while panning), and the 4096²
// that would look right costs a ~67MB depth texture on devices that already
// die allocating the overlay buffers.
//
// A soft blob decal under each occupant buys most of the perceptual win —
// grounding — for one shared InstancedMesh and no depth texture. It is also
// *correct* here rather than a cheat: the sun is set once in
// client-map-3d-atmosphere.ts and never moves, and the camera has a fixed tilt
// and no rotation, so the offset and shape of a real contact shadow would be
// constant anyway.
//
// One instance of this overlay is shared across every caller in
// client-map-3d.ts (see contactShadowOverlay there) rather than each overlay
// module owning its own: they all use the same MAX_VISIBLE_TILES budget, and
// giving each of the ~8 callers its own InstancedMesh would preallocate that
// budget's instance-matrix buffer eight times over for no benefit — the
// occupancy dedup below already makes a shared instance correct even when two
// different occupant kinds land on the same tile.

import { CanvasTexture, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, Scene, Vector3 } from "three";

// Lifted off the surface so the decal wins the depth test against the tile it
// sits on. The heightfield is displaced, so a flat quad on a sloped tile can
// otherwise punch through; `polygonOffset` on the material covers the rest.
const SURFACE_LIFT_Y = 0.012;

// Above every ground-tint layer, not below it — most importantly the
// ownership overlay (client-map-3d-ownership-overlay.ts), which paints a
// near-opaque settled/frontier tint at renderOrder 6/7 over essentially every
// owned or visible tile on the map, and frontierClaimPlate in client-map-3d.ts
// at renderOrder 7.
//
// This module's first version put the decal at renderOrder 4, reasoning only
// about client-map-3d-settle-overlay.ts's tint (renderOrder 5) and never
// checking the ownership overlay at all. Three.js draws the transparent pass
// in ascending renderOrder, so that ordering had the territory tint painting
// over the shadow on every owned or explored tile — which in a live game is
// nearly all of them. The result was correct-by-construction and invisible in
// practice: the decal for the *previous* fix (client-map-3d-structure-overlay
// coverage in the last PR) never actually reached the screen, which is why
// extending its coverage to towns/watchtowers/resources changed nothing that
// could be seen either.
//
// A real contact shadow darkens whatever ground color is under it — sitting
// above the tint is the physically correct order, not just the one that
// happens to be visible.
const RENDER_ORDER = 8;

const TEXTURE_SIZE = 128;

// A slight lean away from the sun's XZ bearing (45, 75, 25 in
// client-map-3d-atmosphere.ts), proportional to -45/-25 so the direction is
// right. This is a nudge, not a cast length: the sun sits ~55° above the
// horizon, so a true shadow would run ~0.69x the structure's height, and
// `addInstance` has no height to work from. Kept small on purpose — an
// under-shifted blob still reads as contact, an over-shifted one detaches.
const SUN_OFFSET_X = -0.055;
const SUN_OFFSET_Z = -0.031;

// Tile centers arrive as an integer camera-relative offset + 0.5 (see
// TILE_CENTER_OFFSET in client-map-3d.ts), so doubling lands on exact integers
// and a packed numeric key dedupes positions without allocating strings in the
// rebuild path. The bias covers the negative half; the stride clears the widest
// window the heightfield will ever walk (HEIGHTFIELD_MAX_TILES_PER_AXIS = 240).
const KEY_BIAS = 4096;
const KEY_STRIDE = 8192;

const positionKey = (sceneX: number, sceneZ: number): number =>
  (Math.round(sceneX * 2) + KEY_BIAS) * KEY_STRIDE + (Math.round(sceneZ * 2) + KEY_BIAS);

export type ContactShadowOverlay = {
  readonly clear: () => void;
  /** `radius` is the decal's half-width in tiles; 0.5 covers one full tile. */
  readonly addShadow: (sceneX: number, sceneZ: number, surfaceY: number, radius: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

// Three size tiers, picked by measuring each family's own geometry rather
// than assumed — the previous single DEFAULT radius (0.42, diameter 0.84)
// was invisible under towns because their own opaque foundation slab is
// 0.78-0.92 tiles wide (town-tier-capitals.ts / town-tier-cities.ts):
// equal to or *larger* than the decal, so it fully occluded the shadow with
// no rim showing outside it. A contact shadow only reads if it extends
// past the opaque footprint sitting on top of it.

// Generic single-tile occupants (economic/civic/industrial structures,
// watchtowers, relay beacons, barbarian totems, shard sites, resource
// deposits): all comfortably under 0.7 tiles wide by their own geometry, so
// a little short of the tile edge grounds the silhouette without bleeding
// onto a neighbouring tile.
export const DEFAULT_CONTACT_SHADOW_RADIUS_TILES = 0.42;

// Wide-footprint occupants: town foundation slabs run up to 0.92 tiles wide
// at the capital tier, and fort walls (WALL_LENGTH in
// client-map-3d-fort-overlay.ts) run 0.86. Diameter 0.96 clears both with a
// visible rim while staying inside the tile.
export const LARGE_CONTACT_SHADOW_RADIUS_TILES = 0.48;

// A single tree's canopy (pineCanopyGeometry in client-map-3d-forest.ts) has
// radius 0.22 — using DEFAULT here would draw a building-sized blob under a
// trunk a third that wide.
export const SMALL_CONTACT_SHADOW_RADIUS_TILES = 0.22;

// Black at the core falling to fully transparent at the rim. The midpoint
// stops keep the falloff from reading as a hard-edged dot the way a plain
// two-stop gradient does.
//
// Deliberately painted as black-with-alpha and used as `map` rather than
// white-with-alpha used as `alphaMap`: `alphaMap` reads the texture's *green*
// channel, and whether green survives a canvas upload depends on whether the
// browser premultiplied it — a white-on-transparent gradient can arrive with
// green at full everywhere and render as a hard square. Black RGB with a real
// alpha ramp samples to (0,0,0,a) under premultiplied and straight upload
// alike, so it blends to the same shadow either way.
export const createContactShadowTexture = (): CanvasTexture | null => {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const half = TEXTURE_SIZE / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, "rgba(0,0,0,1)");
  gradient.addColorStop(0.45, "rgba(0,0,0,0.72)");
  gradient.addColorStop(0.75, "rgba(0,0,0,0.24)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
};

export const createContactShadowOverlay = (scene: Scene, maxTiles: number): ContactShadowOverlay => {
  const geometry = new PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI * 0.5);

  // `rotateX(-90°)` turns the plane's +Z normal to +Y, and the map camera is
  // always above the ground, so the default FrontSide is all that ever renders.
  const map = createContactShadowTexture();
  const material = new MeshBasicMaterial({ toneMapped: false,
    color: "#ffffff",
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    ...(map ? { map } : {}),
    // Biases the decal toward the camera in depth so it survives the slope of
    // the tile under it without needing a lift big enough to visibly float.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });

  const mesh = new InstancedMesh(geometry, material, maxTiles);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = RENDER_ORDER;
  scene.add(mesh);

  let count = 0;
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  // The geometry is already rotated flat, so instances never need one.
  const noRotation = new Quaternion();

  // One decal per ground position, however many structures the caller reports
  // standing there. A tile can carry both an `economicStructure` and an
  // `observatory` — they are separate tile fields, and client-map-3d.ts adds
  // them from separate call sites — so without this a shared tile stacks two
  // blobs and composites to a visibly darker splotch than its neighbours.
  const occupied = new Set<number>();

  const clear = (): void => {
    count = 0;
    occupied.clear();
  };

  const addShadow = (sceneX: number, sceneZ: number, surfaceY: number, radius: number): void => {
    if (count >= maxTiles || radius <= 0) return;
    const key = positionKey(sceneX, sceneZ);
    if (occupied.has(key)) return;
    occupied.add(key);
    const diameter = radius * 2;
    // Scaled by the decal's own size so a larger blob leans proportionally.
    position.set(sceneX + SUN_OFFSET_X * diameter, surfaceY + SURFACE_LIFT_Y, sceneZ + SUN_OFFSET_Z * diameter);
    scale.set(diameter, 1, diameter);
    matrix.compose(position, noRotation, scale);
    mesh.setMatrixAt(count, matrix);
    count += 1;
  };

  const commit = (): void => {
    mesh.count = count;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
    mesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
    map?.dispose();
  };

  return { clear, addShadow, commit, dispose };
};

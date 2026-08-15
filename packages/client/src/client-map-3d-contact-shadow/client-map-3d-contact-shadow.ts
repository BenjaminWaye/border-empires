// Structures currently sit on the terrain with nothing connecting them to it:
// there is no shadow map, no `aoMap`, and no ground decal anywhere in the
// renderer, so every building and tower reads as pasted on top of its tile
// rather than standing on it.
//
// This is the cheap half of that fix. Real shadow mapping is a poor trade at
// this camera range — the ground footprint at MIN_ZOOM is ~91 tiles deep by up
// to ~185 wide, so a single 2048² directional map resolves a 1-tile building's
// shadow to ~11 texels (blocky, and it crawls while panning), and the 4096²
// that would look right costs a ~67MB depth texture on devices that already
// die allocating the overlay buffers.
//
// A soft blob decal under each structure buys most of the perceptual win —
// grounding — for one extra InstancedMesh and no depth texture. It is also
// *correct* here rather than a cheat: the sun is set once in
// client-map-3d-atmosphere.ts and never moves, and the camera has a fixed tilt
// and no rotation, so the offset and shape of a real contact shadow would be
// constant anyway.

import { CanvasTexture, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, Scene, Vector3 } from "three";

// Lifted off the surface so the decal wins the depth test against the tile it
// sits on. The heightfield is displaced, so a flat quad on a sloped tile can
// otherwise punch through; `polygonOffset` on the material covers the rest.
const SURFACE_LIFT_Y = 0.012;

// Under the ground-overlay band (settle tint and friends sit at 5) so a
// selection tint paints over the shadow rather than under it.
const RENDER_ORDER = 4;

const TEXTURE_SIZE = 128;

// A slight lean away from the sun's XZ bearing (45, 75, 25 in
// client-map-3d-atmosphere.ts), proportional to -45/-25 so the direction is
// right. This is a nudge, not a cast length: the sun sits ~55° above the
// horizon, so a true shadow would run ~0.69x the structure's height, and
// `addInstance` has no height to work from. Kept small on purpose — an
// under-shifted blob still reads as contact, an over-shifted one detaches.
const SUN_OFFSET_X = -0.055;
const SUN_OFFSET_Z = -0.031;

export type ContactShadowOverlay = {
  readonly clear: () => void;
  /** `radius` is the decal's half-width in tiles; 0.5 covers one full tile. */
  readonly addShadow: (sceneX: number, sceneZ: number, surfaceY: number, radius: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

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
  const material = new MeshBasicMaterial({
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

  const clear = (): void => {
    count = 0;
  };

  const addShadow = (sceneX: number, sceneZ: number, surfaceY: number, radius: number): void => {
    if (count >= maxTiles || radius <= 0) return;
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

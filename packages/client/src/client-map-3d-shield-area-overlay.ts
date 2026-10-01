import { Color, DoubleSide, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Scene } from "three";

// Workstream F3 (docs/replenishment-update-plan.md): shield-coverage-area
// overlay, 3D renderer only. Paints a flat tinted plane over every tile a
// KNOWN muster flag (client-known-shield-flags.ts) would shield -- its own
// tile always, plus every tile within SHIELD_RADIUS_TILES when the flag is
// in HOLD mode. Same flat-tinted-plane-via-instanceColor technique as
// client-map-3d-win-chance-paint-overlay.ts, tinted by the flag owner's
// color instead of a win-chance gradient, and rendered a touch below it
// (renderOrder) so an armed win-chance paint never gets hidden underneath.
//
// F3 SCOPE NOTE: this overlay exists ONLY on the true-3D renderer
// (isTrue3DRendererActive()) -- the 2D canvas renderer (the accessibility
// fallback per AGENTS.md) has no shield-area visualization yet. That's a
// separate follow-up (F4, same as win-chance paint's own 2D parity gap),
// not silently dropped.
//
// Covers at most a HOLD flag's full Chebyshev disk (SHIELD_RADIUS_TILES=3 ->
// 49 tiles) per flag; MAX_TILES sized for a handful of simultaneously
// visible flags (MUSTER_MAX_TILES per player is small) rather than every
// flag on the map at once, matching the other per-frame overlays' "only
// what's currently rendered" scope.
const MAX_TILES = 512;
const PLANE_RISE_ABOVE_HEIGHTFIELD = 0.0105; // just under win-chance paint (0.011) and muster flags (0.012)
// A HOLD flag covers a 7x7 block. At 0.28 opacity with the raw owner color
// (often a dark navy/maroon) and a gap between planes, that read as a grid of
// dark squares dropped around a freshly placed flag. Lightened tint, low
// opacity and seamless planes make it one soft wash instead.
const OPACITY = 0.14;
const TINT_LIGHTEN = 0.45;
const WHITE = new Color("#ffffff");

export type ShieldAreaOverlayEntry = {
  sceneX: number;
  sceneZ: number;
  surfaceY: number;
  ownerColor: string;
};

export type ShieldAreaOverlay = {
  readonly clear: () => void;
  readonly addTile: (entry: ShieldAreaOverlayEntry) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createShieldAreaOverlay = (scene: Scene): ShieldAreaOverlay => {
  const geometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({
    toneMapped: false,
    vertexColors: true,
    transparent: true,
    opacity: OPACITY,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide
  });
  const mesh = new InstancedMesh(geometry, material, MAX_TILES);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = 21; // just under the win-chance paint (22), alongside selection-range fill
  scene.add(mesh);

  let entries: ShieldAreaOverlayEntry[] = [];
  const tmpColor = new Color();

  const clear = (): void => { entries = []; };

  const addTile = (entry: ShieldAreaOverlayEntry): void => {
    if (entries.length >= MAX_TILES) return;
    entries.push(entry);
  };

  const commit = (): void => {
    mesh.count = entries.length;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      mesh.setMatrixAt(i, tmpMatrixAt(e.sceneX, e.surfaceY + PLANE_RISE_ABOVE_HEIGHTFIELD, e.sceneZ));
      tmpColor.set(e.ownerColor).lerp(WHITE, TINT_LIGHTEN);
      mesh.setColorAt(i, tmpColor);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
  };

  return { clear, addTile, commit, dispose };
};

const tmpMatrix = new Matrix4();
const tmpMatrixAt = (x: number, y: number, z: number): Matrix4 => tmpMatrix.makeTranslation(x, y, z);

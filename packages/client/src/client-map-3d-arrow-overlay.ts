import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, Scene, ShaderMaterial } from "three";

// Workstream F1 (docs/replenishment-update-plan.md): the 3D visual for the
// right-click-drag arrow gesture (client-map-input-arrow-gesture.ts drives
// the state; client-map-3d/client-map-3d.ts feeds this overlay the two
// endpoints' already-toroid-wrapped scene positions each frame, the same way
// it feeds client-map-3d-win-chance-paint-overlay.ts). Follows the same
// clear/set.../commit/dispose shape client-map-3d-muster-transit-overlay.ts
// and client-map-3d-win-chance-paint-overlay.ts use.
//
// A single flat polygon (painted-over-the-territory HOI4-style arrow, not a
// 3D extruded shaft) laid along LOCAL +Z from the muster flag (z=0, wide
// base) to the target tile (z=length, a point) -- a single Group rotation
// (yaw around Y) orients it toward the target each commit(), and the
// geometry's own vertex positions are rewritten in place to match the
// current drag length (no per-frame allocation).
//
// Shape: wide at the base, tapering to a narrow neck partway along the
// shaft, then flaring back out to the SAME width as the base for the
// arrowhead, which itself tapers to a point at the tip. Opacity is a linear
// gradient along the arrow's length -- 0 at the base, ARROW_TIP_OPACITY at
// the tip -- carried as a per-vertex alpha attribute, since MeshBasicMaterial
// vertex colors have no alpha channel; a small custom ShaderMaterial (same
// pattern as client-map-3d-atmosphere.ts / the natural-wonder overlays)
// reads it instead. A second, slightly padded copy of the same polygon
// renders underneath as a solid dark-grey outline.

const BASE_HALF_WIDTH = 0.22; // wide at the muster flag's end
const NECK_HALF_WIDTH = 0.135; // narrowest point, where the shaft meets the arrowhead -- halved taper (half the base-to-neck narrowing of the original 0.05)
const HEAD_LENGTH = 0.34; // the arrowhead's own share of the total length, base-to-tip
const ARROW_TIP_OPACITY = 0.9; // gradient's value at the tip; 0 at the base
const OUTLINE_COLOR = "#3a3a3a";
const OUTLINE_OPACITY = 0.5;
const OUTLINE_PAD = 0.05; // how far the outline polygon extends beyond the fill polygon on every edge
const RISE_ABOVE_HEIGHTFIELD = 0.02; // just under win-chance paint's plane (0.011 above corners, but this sits on the higher of the two endpoints) so it renders above the paint, not fighting it
const OUTLINE_RISE_ABOVE_HEIGHTFIELD = RISE_ABOVE_HEIGHTFIELD - 0.002; // just beneath the fill layer so it peeks out as a border, not z-fighting it
const ARROW_COLOR = "#ffd54a";

export type ArrowOverlayEndpoint = { sceneX: number; sceneZ: number; surfaceY: number };

export type ArrowOverlay = {
  readonly clear: () => void;
  readonly setEndpoints: (from: ArrowOverlayEndpoint, to: ArrowOverlayEndpoint) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

// The arrow's outline shares this vertex layout with its fill (see
// buildArrowPolygon below): 7 vertices (2 base corners, 2 neck corners, 2
// arrowhead-base corners, 1 tip), 5 triangles (2 for the tapered shaft, 2
// for the neck-to-head flare step, 1 for the arrowhead itself).
const VERTEX_COUNT = 7;
const INDICES = new Uint16Array([0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4, 4, 5, 6]);

// Writes this shape's 7 vertices (x, z each, y always 0 -- laid flat, raised
// via the Group's own Y position) into `positions` starting at `offset`
// floats in, for an arrow of the given `length` (base-to-tip) with the given
// half-widths at the base/neck/head-base, padded outward by `pad` on every
// edge (0 for the fill layer, OUTLINE_PAD for the outline layer).
const writeArrowPolygon = (
  positions: Float32Array,
  offset: number,
  length: number,
  baseHalfWidth: number,
  neckHalfWidth: number,
  pad: number
): void => {
  const shaftLen = Math.max(0, length - HEAD_LENGTH);
  const baseZ = -pad;
  const tipZ = length + pad;
  const baseHalf = baseHalfWidth + pad;
  const neckHalf = Math.max(0, neckHalfWidth - pad);

  const set = (i: number, x: number, z: number): void => {
    positions[offset + i * 3] = x;
    positions[offset + i * 3 + 1] = 0;
    positions[offset + i * 3 + 2] = z;
  };
  set(0, -baseHalf, baseZ);
  set(1, baseHalf, baseZ);
  set(2, -neckHalf, shaftLen);
  set(3, neckHalf, shaftLen);
  set(4, -baseHalf, shaftLen);
  set(5, baseHalf, shaftLen);
  set(6, 0, tipZ);
};

// Alpha gradient (fill layer only -- the outline is a flat solid opacity):
// 0 at the base (z=0), ARROW_TIP_OPACITY at the tip (z=length), linear by
// distance along the arrow's own axis, independent of the padding above.
const writeArrowAlphas = (alphas: Float32Array, length: number): void => {
  const shaftLen = Math.max(0, length - HEAD_LENGTH);
  const alphaAt = (z: number): number => (length > 1e-4 ? ARROW_TIP_OPACITY * Math.min(1, Math.max(0, z / length)) : 0);
  alphas[0] = alphaAt(0);
  alphas[1] = alphaAt(0);
  alphas[2] = alphaAt(shaftLen);
  alphas[3] = alphaAt(shaftLen);
  alphas[4] = alphaAt(shaftLen);
  alphas[5] = alphaAt(shaftLen);
  alphas[6] = ARROW_TIP_OPACITY;
};

const gradientFillMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uColor: { value: new Color(ARROW_COLOR) } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    vertexShader: `
      attribute float aAlpha;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        gl_FragColor = vec4(uColor, vAlpha);
      }
    `
  });

export const createArrowOverlay = (scene: Scene): ArrowOverlay => {
  const fillGeometry = new BufferGeometry();
  fillGeometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(VERTEX_COUNT * 3), 3));
  fillGeometry.setAttribute("aAlpha", new Float32BufferAttribute(new Float32Array(VERTEX_COUNT), 1));
  fillGeometry.setIndex(Array.from(INDICES));
  // Write into the attributes' own backing arrays, not a separate local
  // array -- Float32BufferAttribute's constructor copies its input array
  // (`new Float32Array(source)`), so mutating a detached local array would
  // never reach the actual GPU buffer.
  const fillPositions = (fillGeometry.attributes.position as Float32BufferAttribute).array as Float32Array;
  const fillAlphas = (fillGeometry.attributes.aAlpha as Float32BufferAttribute).array as Float32Array;
  const fillMaterial = gradientFillMaterial();
  const fill = new Mesh(fillGeometry, fillMaterial);

  const outlineGeometry = new BufferGeometry();
  outlineGeometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(VERTEX_COUNT * 3), 3));
  outlineGeometry.setIndex(Array.from(INDICES));
  const outlinePositions = (outlineGeometry.attributes.position as Float32BufferAttribute).array as Float32Array;
  const outlineMaterial = new MeshBasicMaterial({
    toneMapped: false,
    color: OUTLINE_COLOR,
    opacity: OUTLINE_OPACITY,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide
  });
  const outline = new Mesh(outlineGeometry, outlineMaterial);

  const group = new Group();
  group.add(outline);
  group.add(fill);
  group.visible = false;
  group.renderOrder = 23; // above win-chance paint's plane (22)
  scene.add(group);

  let pending: { from: ArrowOverlayEndpoint; to: ArrowOverlayEndpoint } | undefined;

  const clear = (): void => { pending = undefined; };

  const setEndpoints = (from: ArrowOverlayEndpoint, to: ArrowOverlayEndpoint): void => {
    pending = { from, to };
  };

  const commit = (): void => {
    if (!pending) { group.visible = false; return; }
    const { from, to } = pending;
    const dx = to.sceneX - from.sceneX;
    const dz = to.sceneZ - from.sceneZ;
    const length = Math.hypot(dx, dz);
    if (length < 1e-4) { group.visible = false; return; }

    // group.position.y already carries RISE_ABOVE_HEIGHTFIELD (set below) --
    // fill stays at its local origin, outline sits just beneath it.
    outline.position.set(0, OUTLINE_RISE_ABOVE_HEIGHTFIELD - RISE_ABOVE_HEIGHTFIELD, 0);

    writeArrowPolygon(fillPositions, 0, length, BASE_HALF_WIDTH, NECK_HALF_WIDTH, 0);
    writeArrowAlphas(fillAlphas, length);
    (fillGeometry.attributes.position as Float32BufferAttribute).needsUpdate = true;
    (fillGeometry.attributes.aAlpha as Float32BufferAttribute).needsUpdate = true;
    fillGeometry.computeBoundingSphere();

    writeArrowPolygon(outlinePositions, 0, length, BASE_HALF_WIDTH, NECK_HALF_WIDTH, OUTLINE_PAD);
    (outlineGeometry.attributes.position as Float32BufferAttribute).needsUpdate = true;
    outlineGeometry.computeBoundingSphere();

    const y = Math.max(from.surfaceY, to.surfaceY) + RISE_ABOVE_HEIGHTFIELD;
    group.position.set(from.sceneX, y, from.sceneZ);
    // Local +Z (0,0,1) rotated by Ry(yaw) lands at (sin(yaw), 0, cos(yaw)) --
    // solved for it to equal the normalized (dx, dz) direction.
    group.rotation.set(0, Math.atan2(dx, dz), 0);
    group.visible = true;
  };

  const dispose = (): void => {
    scene.remove(group);
    fillGeometry.dispose();
    fillMaterial.dispose();
    outlineGeometry.dispose();
    outlineMaterial.dispose();
  };

  return { clear, setEndpoints, commit, dispose };
};

/**
 * Per-render-frame sync helper: clears, sets endpoints (if a drag is in
 * progress) and commits in one call, so client-map-3d/client-map-3d.ts's
 * renderLoop (already well over the repo's file-line cap) only needs a
 * single call site rather than this whole clear/set/commit sequence inline.
 */
export const syncArrowOverlayFrame = (
  overlay: ArrowOverlay,
  arrowGesture: { origin: { x: number; y: number }; target: { x: number; y: number } } | undefined,
  sceneFor: (tile: { x: number; y: number }) => ArrowOverlayEndpoint
): void => {
  overlay.clear();
  if (arrowGesture) overlay.setEndpoints(sceneFor(arrowGesture.origin), sceneFor(arrowGesture.target));
  overlay.commit();
};

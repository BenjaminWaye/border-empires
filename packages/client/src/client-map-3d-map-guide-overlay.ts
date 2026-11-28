import { BufferAttribute, BufferGeometry, CanvasTexture, CircleGeometry, DynamicDrawUsage, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, MeshBasicMaterial, PlaneGeometry, Scene } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { MAX_TINT_TILES, chargeTintStyle, houseChargeAreaEdges, houseChargeTintTiles, type ChargeMapPoint, type ChargeTintStyle } from "./client-house-charges/client-house-charges-map.js";
import { houseChargeSearchGuide } from "./client-house-charges/client-house-charges-search-guide.js";
import {
  CHARGE_LINK_DOT_RADIUS,
  CHARGE_RING_DOT_RADIUS,
  CHARGE_TINT_UNOWNED,
  CHARGE_UNOWNED_DOT,
  CHARGE_UNOWNED_DOT_RADIUS,
  CHARGE_UNOWNED_DOTS_PER_SIDE
} from "./client-house-charges/client-map-guide-overlays-2d.js";
import { createOnboardingChecklistHighlightOverlay, type OnboardingChecklistHighlightTile } from "./client-map-3d-onboarding-checklist-highlight.js";
import { RENDER_ORDER } from "./client-map-3d-render-order.js";
import { mapGuideRingTiles } from "./client-house-charges/client-map-guide-ring-tiles.js";
import type { ClientState } from "./client-state/client-state.js";

// True-3D map guidance, the counterpart of the 2D client-map-guide-overlays-2d.ts:
// the onboarding guide's ring markers plus a focused House Charge's and a clicked scout find's markers
// (one ring overlay, client-map-3d-onboarding-checklist-highlight.ts), the
// charge's dotted rough circles and link (client-house-charges-search-guide.ts)
// and its shaded area, drawn as flat tiles on the ground at each tile's real
// scene position (client-house-charges/client-house-charges-map.ts decides what).

/** Dots per guide mesh: a few rough circles of ~75 dots, or one wide landmass circle, plus slack. */
const MAX_GUIDE_DOTS = 1_024;
const TINT_SIZE = 0.94;

/**
 * Pale diagonal stripes on a dark wash for the player's own ungarrisoned tiles, matching the
 * 2D hatch (client-map-guide-overlays-2d.ts) so they read by pattern on sand,
 * grass or snow. Without a 2D canvas context (tests) the plain wash is used.
 */
const createHatchTexture = (): CanvasTexture | undefined => {
  if (typeof document === "undefined") return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.fillStyle = "rgba(18, 14, 8, 0.45)";
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = "rgba(255, 232, 170, 0.95)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  for (let offset = -64; offset < 64; offset += 22) {
    ctx.moveTo(offset, 64);
    ctx.lineTo(offset + 64, 0);
  }
  ctx.stroke();
  return new CanvasTexture(canvas);
};

/** Land the player doesn't hold: the 2D fainter wash with sparse dim dots (drawUnownedDots), not the hatching. */
const createUnownedTexture = (): CanvasTexture | undefined => {
  if (typeof document === "undefined") return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.fillStyle = CHARGE_TINT_UNOWNED;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = CHARGE_UNOWNED_DOT;
  ctx.beginPath();
  const r = 64 * CHARGE_UNOWNED_DOT_RADIUS;
  for (let row = 0; row < CHARGE_UNOWNED_DOTS_PER_SIDE; row += 1) {
    for (let col = 0; col < CHARGE_UNOWNED_DOTS_PER_SIDE; col += 1) {
      const cx = ((col + 0.5) / CHARGE_UNOWNED_DOTS_PER_SIDE) * 64;
      const cy = ((row + 0.5) / CHARGE_UNOWNED_DOTS_PER_SIDE) * 64;
      ctx.moveTo(cx + r, cy);
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  return new CanvasTexture(canvas);
};

const createTintMesh = (geometry: PlaneGeometry, material: MeshBasicMaterial, name: string): InstancedMesh => {
  const mesh = new InstancedMesh(geometry, material, MAX_TINT_TILES);
  mesh.name = name;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = RENDER_ORDER.houseChargeAreaTint;
  return mesh;
};

/** Dots sit at fractional positions with the nearest tile's height, so they skip the depth test rather than sink into hills between tiles. */
const createDotMesh = (radius: number, color: string, name: string): InstancedMesh => {
  const geometry = new CircleGeometry(radius, 10);
  geometry.rotateX(-Math.PI * 0.5);
  const mesh = new InstancedMesh(geometry, new MeshBasicMaterial({ toneMapped: false, color, transparent: true, opacity: 0.92, depthWrite: false, depthTest: false }), MAX_GUIDE_DOTS);
  mesh.name = name;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = RENDER_ORDER.houseChargeGuideDots;
  return mesh;
};

const disposeDotMesh = (mesh: InstancedMesh): void => {
  mesh.geometry.dispose();
  (mesh.material as MeshBasicMaterial).dispose();
};

export type MapGuideScenePoint = OnboardingChecklistHighlightTile;
export type MapGuideState = Pick<ClientState, "onboardingHighlightTiles" | "houseCharges" | "houseChargeFocusId" | "tiles" | "me"> & Partial<Pick<ClientState, "scoutFindingHighlight" | "garrisonMany" | "tilesRevision">>;

export type MapGuideOverlay = {
  readonly sync: (state: MapGuideState, toScene: (x: number, y: number) => MapGuideScenePoint, nowMs: number) => void;
  readonly dispose: () => void;
};

export const createMapGuideOverlay = (scene: Scene): MapGuideOverlay => {
  const rings = createOnboardingChecklistHighlightOverlay(scene);
  const geometry = new PlaneGeometry(TINT_SIZE, TINT_SIZE);
  geometry.rotateX(-Math.PI * 0.5);
  const hatch = createHatchTexture();
  const garrisonedMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#5fd36a", transparent: true, opacity: 0.5, depthWrite: false });
  const openMaterial = new MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false, ...(hatch ? { map: hatch } : { color: "#120e08", opacity: 0.3 }) });
  const garrisoned = createTintMesh(geometry, garrisonedMaterial, "house-charge-area-garrisoned");
  const open = createTintMesh(geometry, openMaterial, "house-charge-area-open");
  const unownedTexture = createUnownedTexture();
  const unownedMaterial = new MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false, ...(unownedTexture ? { map: unownedTexture } : { color: "#120e08", opacity: 0.18 }) });
  const unowned = createTintMesh(geometry, unownedMaterial, "house-charge-area-unowned");
  // A Three Metropolises landmass: the 2D CHARGE_TINT_PLAIN gold wash, no hatching.
  const plainMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#f0cf82", transparent: true, opacity: 0.28, depthWrite: false });
  const plain = createTintMesh(geometry, plainMaterial, "house-charge-area-plain");
  // Gold outline around the shaded area, the 2D overlay's CHARGE_OUTLINE.
  // One preallocated buffer (every shaded tile's four sides at most), refilled in place each frame:
  // replacing the attribute per frame would leave a GPU buffer behind every time.
  const outlinePositions = new BufferAttribute(new Float32Array(MAX_TINT_TILES * 4 * 6), 3);
  outlinePositions.setUsage(DynamicDrawUsage);
  const outlineGeometry = new BufferGeometry();
  outlineGeometry.setAttribute("position", outlinePositions);
  outlineGeometry.setDrawRange(0, 0);
  const outlineMaterial = new LineBasicMaterial({ color: "#f0cf82", transparent: true, opacity: 0.95, depthWrite: false });
  const outline = new LineSegments(outlineGeometry, outlineMaterial);
  outline.name = "house-charge-area-outline";
  outline.frustumCulled = false;
  outline.renderOrder = RENDER_ORDER.houseChargeAreaOutline;
  const ringDots = createDotMesh(CHARGE_RING_DOT_RADIUS, "#f0cf82", "house-charge-search-ring");
  const linkDots = createDotMesh(CHARGE_LINK_DOT_RADIUS, "#fff4d6", "house-charge-search-link");
  scene.add(garrisoned, open, unowned, plain, outline, ringDots, linkDots);
  const meshByStyle: Record<ChargeTintStyle, InstancedMesh> = { plain, garrisoned, ownOpen: open, unowned };
  const matrix = new Matrix4();
  /** Places dots at fractional tile positions: height from the nearest tile, x/z offset within it. */
  const placeDots = (mesh: InstancedMesh, dots: readonly ChargeMapPoint[], toScene: (x: number, y: number) => MapGuideScenePoint): void => {
    const count = Math.min(dots.length, MAX_GUIDE_DOTS);
    for (let index = 0; index < count; index += 1) {
      const dot = dots[index]!;
      const tileX = Math.round(dot.x);
      const tileY = Math.round(dot.y);
      const point = toScene(((tileX % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH, ((tileY % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT);
      matrix.makeTranslation(point.sceneX + dot.x - tileX, point.surfaceY + 0.02, point.sceneZ + dot.y - tileY);
      mesh.setMatrixAt(index, matrix);
    }
    mesh.count = count;
    if (count > 0) mesh.instanceMatrix.needsUpdate = true;
  };

  return {
    sync: (state, toScene, nowMs) => {
      const guide = houseChargeSearchGuide(state, WORLD_WIDTH, WORLD_HEIGHT);
      placeDots(ringDots, guide.ringDots, toScene);
      placeDots(linkDots, guide.linkDots, toScene);
      const ringTiles = mapGuideRingTiles(state, Date.now());
      rings.sync(ringTiles.map((tile) => toScene(tile.x, tile.y)), nowMs);
      const counts: Record<ChargeTintStyle, number> = { garrisoned: 0, ownOpen: 0, unowned: 0, plain: 0 };
      const tintTiles = houseChargeTintTiles(state);
      const positions = outlinePositions.array as Float32Array;
      let written = 0;
      for (const edge of houseChargeAreaEdges(tintTiles, WORLD_WIDTH, WORLD_HEIGHT)) {
        if (written + 6 > positions.length) break;
        const point = toScene(edge.x, edge.y);
        const lift = point.surfaceY + 0.01;
        const [x1, z1, x2, z2] = edge.side === "N" ? [-0.5, -0.5, 0.5, -0.5] : edge.side === "S" ? [-0.5, 0.5, 0.5, 0.5] : edge.side === "E" ? [0.5, -0.5, 0.5, 0.5] : [-0.5, -0.5, -0.5, 0.5];
        positions[written] = point.sceneX + x1;
        positions[written + 1] = lift;
        positions[written + 2] = point.sceneZ + z1;
        positions[written + 3] = point.sceneX + x2;
        positions[written + 4] = lift;
        positions[written + 5] = point.sceneZ + z2;
        written += 6;
      }
      outlineGeometry.setDrawRange(0, written / 3);
      if (written > 0) outlinePositions.needsUpdate = true;
      outline.visible = written > 0;
      for (const tile of tintTiles) {
        const key = chargeTintStyle(tile);
        const mesh = meshByStyle[key];
        if (counts[key] >= MAX_TINT_TILES) continue;
        const point = toScene(tile.x, tile.y);
        matrix.makeTranslation(point.sceneX, point.surfaceY, point.sceneZ);
        mesh.setMatrixAt(counts[key], matrix);
        counts[key] += 1;
      }
      for (const key of Object.keys(meshByStyle) as ChargeTintStyle[]) {
        const mesh = meshByStyle[key];
        const count = counts[key];
        mesh.count = count;
        if (count > 0) mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose: () => {
      rings.dispose();
      scene.remove(garrisoned, open, unowned, plain, outline, ringDots, linkDots);
      disposeDotMesh(ringDots);
      disposeDotMesh(linkDots);
      geometry.dispose();
      outlineGeometry.dispose();
      outlineMaterial.dispose();
      garrisonedMaterial.dispose();
      openMaterial.dispose();
      unownedMaterial.dispose();
      unownedTexture?.dispose();
      plainMaterial.dispose();
      hatch?.dispose();
    }
  };
};

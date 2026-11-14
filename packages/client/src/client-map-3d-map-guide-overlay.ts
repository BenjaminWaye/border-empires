import { BufferAttribute, BufferGeometry, CanvasTexture, DynamicDrawUsage, InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, MeshBasicMaterial, PlaneGeometry, Scene } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { houseChargeAreaEdges, houseChargeMarkerTiles, houseChargeTintTiles } from "./client-house-charges/client-house-charges-map.js";
import { createOnboardingChecklistHighlightOverlay, type OnboardingChecklistHighlightTile } from "./client-map-3d-onboarding-checklist-highlight.js";
import type { ClientState } from "./client-state/client-state.js";

// True-3D map guidance, the counterpart of the 2D client-map-guide-overlays-2d.ts:
// the onboarding guide's ring markers plus a focused House Charge's markers
// (one ring overlay, client-map-3d-onboarding-checklist-highlight.ts) and the
// charge's shaded area, drawn as flat tiles on the ground at each tile's real
// scene position (client-house-charges/client-house-charges-map.ts decides what).

const MAX_TINT_TILES = 1_200;
const TINT_SIZE = 0.94;

/**
 * Pale diagonal stripes on a dark wash for tiles still to take, matching the
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

const createTintMesh = (geometry: PlaneGeometry, material: MeshBasicMaterial, name: string): InstancedMesh => {
  const mesh = new InstancedMesh(geometry, material, MAX_TINT_TILES);
  mesh.name = name;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;
  return mesh;
};

export type MapGuideScenePoint = OnboardingChecklistHighlightTile;
export type MapGuideState = Pick<ClientState, "onboardingHighlightTiles" | "houseCharges" | "houseChargeFocusId" | "tiles" | "me">;

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
  outline.renderOrder = 1;
  scene.add(garrisoned, open, outline);
  const matrix = new Matrix4();

  return {
    sync: (state, toScene, nowMs) => {
      const markers = houseChargeMarkerTiles(state, WORLD_WIDTH, WORLD_HEIGHT);
      const ringTiles = markers.length > 0 ? [...state.onboardingHighlightTiles, ...markers] : state.onboardingHighlightTiles;
      rings.sync(ringTiles.map((tile) => toScene(tile.x, tile.y)), nowMs);
      const counts = { garrisoned: 0, open: 0 };
      const tintTiles = houseChargeTintTiles(state);
      const positions = outlinePositions.array as Float32Array;
      let written = 0;
      for (const edge of houseChargeAreaEdges(tintTiles, WORLD_WIDTH, WORLD_HEIGHT)) {
        if (written + 6 > positions.length) break;
        const point = toScene(edge.x, edge.y);
        const lift = point.surfaceY + 0.01;
        const [x1, z1, x2, z2] = edge.side === "N" ? [-0.5, -0.5, 0.5, -0.5] : edge.side === "S" ? [-0.5, 0.5, 0.5, 0.5] : edge.side === "E" ? [0.5, -0.5, 0.5, 0.5] : [-0.5, -0.5, -0.5, 0.5];
        positions.set([point.sceneX + x1, lift, point.sceneZ + z1, point.sceneX + x2, lift, point.sceneZ + z2], written);
        written += 6;
      }
      outlineGeometry.setDrawRange(0, written / 3);
      if (written > 0) outlinePositions.needsUpdate = true;
      outline.visible = written > 0;
      for (const tile of tintTiles) {
        const mesh = tile.garrisoned ? garrisoned : open;
        const key = tile.garrisoned ? "garrisoned" : "open";
        if (counts[key] >= MAX_TINT_TILES) continue;
        const point = toScene(tile.x, tile.y);
        matrix.makeTranslation(point.sceneX, point.surfaceY, point.sceneZ);
        mesh.setMatrixAt(counts[key], matrix);
        counts[key] += 1;
      }
      for (const [mesh, count] of [[garrisoned, counts.garrisoned], [open, counts.open]] as const) {
        mesh.count = count;
        if (count > 0) mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose: () => {
      rings.dispose();
      scene.remove(garrisoned, open, outline);
      geometry.dispose();
      outlineGeometry.dispose();
      outlineMaterial.dispose();
      garrisonedMaterial.dispose();
      openMaterial.dispose();
      hatch?.dispose();
    }
  };
};

import {
  CanvasTexture, Color, CylinderGeometry, Group, InstancedBufferAttribute, InstancedMesh,
  Matrix4, MeshStandardMaterial, Scene, Sprite, SpriteMaterial
} from "three";
import { relicOperationalState, type NaturalWonderState } from "@border-empires/shared";
import { createRelicCoreOverlay } from "./relic-core-overlay.js";
import { getMusterBannerGeometry, BANNER_CLOTH } from "../client-map-3d-muster-banner/muster-banner-geometry.js";
import { createMusterBannerClothMaterials } from "../client-map-3d-muster-banner/muster-banner-cloth-material.js";

export type RelicMapInstance = {
  readonly x: number; readonly z: number; readonly y: number;
  readonly worldKey: string; readonly ownerId?: string | undefined; readonly ownerColor: string;
  readonly garrisoned: boolean; readonly state: NaturalWonderState;
};

type FlagEntry = { x: number; y: number; z: number; color: string; hoistAt?: number | undefined };

export type RelicMapOverlay = {
  readonly clear: () => void;
  readonly addInstance: (entry: RelicMapInstance) => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

/** One shared model/cloth batch; only the few depleted-site sprites are individual. */
export const createRelicMapOverlay = (scene: Scene, capacity: number): RelicMapOverlay => {
  const core = createRelicCoreOverlay(scene, capacity);
  const group = new Group();
  scene.add(group);
  const mastGeometry = new CylinderGeometry(0.008, 0.010, 0.78, 6).translate(0, 0.39, 0);
  const barGeometry = new CylinderGeometry(0.005, 0.005, 0.33, 6).rotateZ(Math.PI / 2).translate(0, 0.78, 0);
  const iron = new MeshStandardMaterial({ color: "#606360", roughness: 0.8, metalness: 0.15 });
  const brass = new MeshStandardMaterial({ color: "#b39861", roughness: 0.8, metalness: 0.15 });
  const mast = new InstancedMesh(mastGeometry, iron, capacity);
  const bar = new InstancedMesh(barGeometry, brass, capacity);
  const geometry = getMusterBannerGeometry().cloth.clone();
  const wind = new Float32Array(capacity * 2);
  for (let i = 0; i < capacity; i += 1) wind.set([i * 0.19, 0.8], i * 2);
  geometry.setAttribute("aBannerWind", new InstancedBufferAttribute(wind, 2));
  const fabric = createMusterBannerClothMaterials();
  const cloth = new InstancedMesh(geometry, fabric.cloth, capacity);
  cloth.customDepthMaterial = fabric.depth;
  const flags = [mast, bar, cloth];
  for (const mesh of flags) { mesh.count = 0; mesh.frustumCulled = false; group.add(mesh); }
  const markerCanvas = document.createElement("canvas");
  markerCanvas.width = 96; markerCanvas.height = 92;
  const ctx = markerCanvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#202521"; ctx.strokeStyle = "#ead9ad"; ctx.lineWidth = 5;
    ctx.fillRect(12, 14, 64, 36); ctx.strokeRect(12, 14, 64, 36);
    ctx.fillStyle = "#ead9ad"; ctx.fillRect(78, 25, 8, 14);
    ctx.strokeStyle = "#e6ac6e"; ctx.beginPath(); ctx.moveTo(9, 57); ctx.lineTo(79, 7); ctx.stroke();
  }
  if (ctx) { ctx.fillStyle = "#f2e8d3"; ctx.font = "bold 17px sans-serif"; ctx.textAlign = "center"; ctx.fillText("Depleted", 48, 83); }
  const texture = new CanvasTexture(markerCanvas);
  const markerMaterial = new SpriteMaterial({ toneMapped: false, map: texture, depthTest: false, depthWrite: false });
  const markers = Array.from({ length: capacity }, () => {
    const sprite = new Sprite(markerMaterial);
    sprite.renderOrder = 122; sprite.scale.set(0.48, 0.46, 1); sprite.visible = false; group.add(sprite);
    return sprite;
  });
  // Previous/current render-frame state, bounded by the instance capacity.
  // Offscreen sites are dropped at commit; returning owned sites start fully raised.
  const history = new Map<string, { owner?: string | undefined; hoistAt?: number | undefined }>();
  const frameHistory = new Map<string, { owner?: string | undefined; hoistAt?: number | undefined }>();
  let entries: FlagEntry[] = [];
  let markerCount = 0;
  let count = 0;
  let now = 0;
  const matrix = new Matrix4();
  const color = new Color();
  const clear = (): void => {
    core.clear(); entries = []; markerCount = 0; count = 0; frameHistory.clear();
    for (const mesh of flags) mesh.count = 0;
    for (const marker of markers) marker.visible = false;
  };
  const addInstance = (entry: RelicMapInstance): void => {
    if (count >= capacity) throw new RangeError("Relic overlay capacity exceeded");
    count += 1;
    const status = relicOperationalState(entry.state, entry.garrisoned);
    core.addInstance(entry.x, entry.z, entry.y, status === "active");
    const previous = history.get(entry.worldKey);
    const hoistAt = previous && previous.owner !== entry.ownerId ? now : previous?.hoistAt;
    frameHistory.set(entry.worldKey, { owner: entry.ownerId, hoistAt });
    if (entry.ownerId) entries.push({ x: entry.x, y: entry.y, z: entry.z, color: entry.ownerColor, hoistAt });
    if (status === "depleted") {
      const marker = markers[markerCount++];
      if (marker) { marker.position.set(entry.x, entry.y + 1.18, entry.z + 0.30); marker.visible = true; }
    }
  };
  const update = (nowMs: number): void => {
    now = nowMs;
    core.update(nowMs); fabric.tick(nowMs);
    entries.forEach((entry, i) => {
      const progress = entry.hoistAt === undefined ? 1 : Math.max(0.02, Math.min(1, (nowMs - entry.hoistAt) / 1600));
      const y = entry.y + 1.04;
      matrix.makeScale(1, progress, 1); matrix.setPosition(entry.x + 0.10, y, entry.z - 0.09);
      mast.setMatrixAt(i, matrix); bar.setMatrixAt(i, matrix);
      matrix.makeScale(0.95, 0.95 * progress, 0.95);
      matrix.setPosition(entry.x + 0.10, y + (0.78 - BANNER_CLOTH.topY * 0.95) * progress, entry.z - 0.09);
      cloth.setMatrixAt(i, matrix); cloth.setColorAt(i, color.set(entry.color));
    });
    for (const mesh of flags) { mesh.count = entries.length; mesh.instanceMatrix.needsUpdate = true; }
    if (cloth.instanceColor) cloth.instanceColor.needsUpdate = true;
  };
  const commit = (): void => {
    history.clear(); for (const [key, value] of frameHistory) history.set(key, value);
    core.commit(); update(now);
  };
  const dispose = (): void => {
    core.dispose(); group.removeFromParent();
    for (const mesh of flags) mesh.dispose();
    for (const shape of [mastGeometry, barGeometry, geometry]) shape.dispose();
    iron.dispose(); brass.dispose(); fabric.dispose(); texture.dispose(); markerMaterial.dispose();
    history.clear(); frameHistory.clear(); entries = []; group.clear();
  };
  return { clear, addInstance, commit, update, dispose };
};

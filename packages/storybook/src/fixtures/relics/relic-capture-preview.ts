import {
  BoxGeometry, Color, ConeGeometry, CylinderGeometry, Group,
  InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Scene
} from "three";
import { createMusterBannerClothMaterials } from "@client/client-map-3d-muster-banner/muster-banner-cloth-material.js";
import { BANNER_CLOTH, getMusterBannerGeometry } from "@client/client-map-3d-muster-banner/muster-banner-geometry.js";

export type RelicCapturePreview = {
  readonly setCaptured: (captured: boolean) => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

/** A House banner hoisted above the ruin; uses the muster banner's real cloth. */
export const createRelicCapturePreview = (
  scene: Scene,
  relicY: number,
  ownerColor: string
): RelicCapturePreview => {
  const banner = new Group();
  banner.name = "relic-captured-house-banner";
  banner.position.set(0.10, relicY + 1.04, -0.09);
  scene.add(banner);

  const poleGeometry = new CylinderGeometry(0.007, 0.010, 0.78, 8).translate(0, 0.39, 0);
  const barGeometry = new CylinderGeometry(0.006, 0.006, 0.33, 8).rotateZ(Math.PI / 2);
  const capGeometry = new ConeGeometry(0.018, 0.036, 6);
  const socketGeometry = new BoxGeometry(0.055, 0.025, 0.055);
  const iron = new MeshStandardMaterial({ color: "#596061", roughness: 0.87, metalness: 0.15 });
  const brass = new MeshStandardMaterial({ color: "#a78b55", roughness: 0.72, metalness: 0.15 });
  const pole = new Mesh(poleGeometry, iron);
  const crossbar = new Mesh(barGeometry, brass);
  const cap = new Mesh(capGeometry, brass);
  const socket = new Mesh(socketGeometry, iron);
  banner.add(pole, crossbar, cap, socket);

  // Clone the shared muster cloth so its per-instance wind data stays local.
  const clothGeometry = getMusterBannerGeometry().cloth.clone();
  clothGeometry.setAttribute("aBannerWind", new InstancedBufferAttribute(new Float32Array([0.23, 0.8]), 2));
  const fabric = createMusterBannerClothMaterials();
  const cloth = new InstancedMesh(clothGeometry, fabric.cloth, 1);
  cloth.setMatrixAt(0, new Matrix4());
  cloth.setColorAt(0, new Color(ownerColor));
  cloth.instanceMatrix.needsUpdate = true;
  if (cloth.instanceColor) cloth.instanceColor.needsUpdate = true;
  cloth.customDepthMaterial = fabric.depth;
  cloth.castShadow = true;
  cloth.frustumCulled = false;
  banner.add(cloth);

  let captured: boolean | undefined;
  let lastNow = 0;
  let hoistStartedAt = 0;
  let progress = 0;
  const pose = (): void => {
    const eased = progress * progress * (3 - 2 * progress);
    pole.scale.y = Math.max(0.035, eased);
    crossbar.position.y = 0.78 * eased;
    cap.position.y = 0.78 * eased + 0.022;
    // Unfurl as the mast rises, keeping the hem above the roof throughout.
    cloth.scale.set(0.95, 0.95 * eased, 0.95);
    cloth.position.y = crossbar.position.y - BANNER_CLOTH.topY * 0.95 * eased;
  };
  const setCaptured = (next: boolean): void => {
    if (next === captured) return;
    progress = captured === undefined && next ? 1 : 0;
    captured = next;
    hoistStartedAt = lastNow;
    banner.visible = next;
    pose();
  };
  const update = (nowMs: number): void => {
    lastNow = nowMs;
    fabric.tick(nowMs);
    if (captured && progress < 1) {
      progress = Math.min(1, (nowMs - hoistStartedAt) / 1600);
      pose();
    }
  };
  const dispose = (): void => {
    scene.remove(banner);
    for (const geometry of [poleGeometry, barGeometry, capGeometry, socketGeometry, clothGeometry]) geometry.dispose();
    iron.dispose();
    brass.dispose();
    fabric.dispose();
    cloth.dispose();
    banner.clear();
  };
  return { setCaptured, update, dispose };
};

// True-3D lost-tile flash (the 2D counterpart is client-battle-flash-2d.ts):
// a red wash on each tile you just lost plus a ring that widens as it fades.
// Additive blending, so per-instance color scaled by the flash strength
// fades each tile on its own without per-instance materials.
import { AdditiveBlending, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, RingGeometry, Scene } from "three";
import { RENDER_ORDER } from "../client-map-3d-render-order.js";
import { BATTLE_FLASH_CAP, battleFlashIntensity, type BattleFlash } from "./client-battle-warnings.js";

export type BattleFlashScenePoint = { sceneX: number; sceneZ: number; surfaceY: number };

export type BattleFlashOverlay3D = {
  readonly sync: (flashes: readonly BattleFlash[], toScene: (x: number, y: number) => BattleFlashScenePoint, nowMs: number) => void;
  readonly dispose: () => void;
};

const PLATE_COLOR = new Color("#ff3a30");
const RING_COLOR = new Color("#ff7a6e");

const createFlashMesh = (geometry: PlaneGeometry | RingGeometry, name: string): InstancedMesh => {
  const material = new MeshBasicMaterial({ toneMapped: false, color: "#ffffff", transparent: true, blending: AdditiveBlending, depthTest: false, depthWrite: false });
  const mesh = new InstancedMesh(geometry, material, BATTLE_FLASH_CAP);
  mesh.name = name;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = RENDER_ORDER.battleFlash;
  return mesh;
};

export const createBattleFlashOverlay3D = (scene: Scene): BattleFlashOverlay3D => {
  const plateGeometry = new PlaneGeometry(0.94, 0.94);
  plateGeometry.rotateX(-Math.PI * 0.5);
  const ringGeometry = new RingGeometry(0.4, 0.5, 32);
  ringGeometry.rotateX(-Math.PI * 0.5);
  const plates = createFlashMesh(plateGeometry, "battle-flash-plate");
  const rings = createFlashMesh(ringGeometry, "battle-flash-ring");
  scene.add(plates, rings);
  const matrix = new Matrix4();
  const color = new Color();
  let lastCount = 0;
  return {
    sync: (flashes, toScene, nowMs) => {
      let count = 0;
      for (const flash of flashes) {
        if (count >= BATTLE_FLASH_CAP) break;
        const strength = battleFlashIntensity(flash, nowMs);
        if (strength <= 0.01) continue;
        const life = Math.min(1, Math.max(0, (nowMs - flash.startedAt) / Math.max(1, flash.until - flash.startedAt)));
        const point = toScene(flash.x, flash.y);
        matrix.makeTranslation(point.sceneX, point.surfaceY + 0.02, point.sceneZ);
        plates.setMatrixAt(count, matrix);
        plates.setColorAt(count, color.copy(PLATE_COLOR).multiplyScalar(0.55 * strength));
        const scale = 1 + life * 0.7;
        matrix.makeScale(scale, 1, scale).setPosition(point.sceneX, point.surfaceY + 0.03, point.sceneZ);
        rings.setMatrixAt(count, matrix);
        rings.setColorAt(count, color.copy(RING_COLOR).multiplyScalar(strength));
        count += 1;
      }
      if (count === 0 && lastCount === 0) return;
      lastCount = count;
      for (const mesh of [plates, rings]) {
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    },
    dispose: () => {
      scene.remove(plates, rings);
      plateGeometry.dispose();
      ringGeometry.dispose();
      (plates.material as MeshBasicMaterial).dispose();
      (rings.material as MeshBasicMaterial).dispose();
    }
  };
};

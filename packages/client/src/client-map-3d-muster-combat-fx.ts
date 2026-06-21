import {
  ConeGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Scene,
  Color,
} from "three";
import type { ClientState } from "./client-state/client-state.js";

const DOTS_PER_SIDE = 10;
const FORMATION_T = 0.67;
const DOT_RADIUS = 0.011;
const DOT_HEIGHT = 0.048;
const DOT_Y_OFFSET = 0.08;

function hash01(i: number, side: number, salt: number): number {
  let h = (i * 374761393) ^ (side * 668265263) ^ (salt * 15485863);
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = (h >> 16) ^ h;
  return (h >>> 0) / 0xFFFFFFFF;
}

interface DotKit {
  offset: number;
  perpPos: number;
  freq: number;
  phase: number;
}

interface CachedSetup {
  srcWorldX: number;
  srcWorldZ: number;
  tgtWorldX: number;
  tgtWorldZ: number;
  srcSurfaceY: number;
  tgtSurfaceY: number;
  attackerColor: string;
}

export type MusterCombatFx = ReturnType<typeof createMusterCombatFx>;

export function createMusterCombatFx(scene: Scene) {
  const dotGeom = new ConeGeometry(DOT_RADIUS, DOT_HEIGHT, 4);
  const attackerMat = new MeshBasicMaterial({
    color: "#ffffff",
    depthTest: false,
    depthWrite: false,
  });
  const defenderMat = new MeshBasicMaterial({
    color: "#0a0d18",
    depthTest: false,
    depthWrite: false,
  });

  const attackerMesh = new InstancedMesh(dotGeom, attackerMat, DOTS_PER_SIDE);
  const defenderMesh = new InstancedMesh(dotGeom, defenderMat, DOTS_PER_SIDE);
  attackerMesh.frustumCulled = false;
  attackerMesh.count = 0;
  attackerMesh.renderOrder = 37;
  defenderMesh.frustumCulled = false;
  defenderMesh.count = 0;
  defenderMesh.renderOrder = 37;
  scene.add(attackerMesh);
  scene.add(defenderMesh);

  const tmpColor = new Color();
  const tmpM = new Matrix4();

  const kits: DotKit[] = [];
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < DOTS_PER_SIDE; i++) {
      kits.push({
        offset: hash01(i, side, 3) * 0.25,
        perpPos: (hash01(i, side, 0) - 0.5) * 0.8,
        freq: 4 + hash01(i, side, 1) * 8,
        phase: hash01(i, side, 2) * Math.PI * 2,
      });
    }
  }

  let cache: CachedSetup | undefined;

  const setSource = (
    source: { wx: number; wy: number },
    target: { wx: number; wy: number },
    srcSurfaceY: number,
    tgtSurfaceY: number,
    srcWorldX: number,
    srcWorldZ: number,
    tgtWorldX: number,
    tgtWorldZ: number,
    attackerColor: string,
  ): void => {
    cache = {
      srcWorldX,
      srcWorldZ,
      tgtWorldX,
      tgtWorldZ,
      srcSurfaceY,
      tgtSurfaceY,
      attackerColor,
    };
  };

  const tick = (nowMs: number, capture: ClientState["capture"]): void => {
    if (!capture || !cache) { clear(); return; }
    const { startAt, resolvesAt } = capture;
    const duration = resolvesAt - startAt;
    if (duration <= 0) { clear(); return; }
    const t = (nowMs - startAt) / duration;
    if (t < 0 || t > 2) { clear(); return; }

    const { srcWorldX, srcWorldZ, tgtWorldX, tgtWorldZ, srcSurfaceY, tgtSurfaceY, attackerColor } = cache;

    let dirX = tgtWorldX - srcWorldX;
    let dirZ = tgtWorldZ - srcWorldZ;
    const dist = Math.sqrt(dirX * dirX + dirZ * dirZ);
    if (dist < 0.001) { clear(); return; }
    dirX /= dist;
    dirZ /= dist;
    const perpX = -dirZ;
    const perpZ = dirX;

    const midX = (srcWorldX + tgtWorldX) * 0.5;
    const midZ = (srcWorldZ + tgtWorldZ) * 0.5;
    const midY = (srcSurfaceY + tgtSurfaceY) * 0.5 + DOT_Y_OFFSET;

    tmpColor.set(attackerColor);
    for (let i = 0; i < DOTS_PER_SIDE; i++) {
      attackerMesh.setColorAt(i, tmpColor);
    }
    if (attackerMesh.instanceColor) attackerMesh.instanceColor.needsUpdate = true;

    let atkWrite = 0;
    let defWrite = 0;

    for (let side = 0; side < 2; side++) {
      const isAttacker = side === 0;
      const startX = isAttacker ? srcWorldX : tgtWorldX;
      const startZ = isAttacker ? srcWorldZ : tgtWorldZ;
      const mesh = isAttacker ? attackerMesh : defenderMesh;

      for (let i = 0; i < DOTS_PER_SIDE; i++) {
        const kit = kits[side * DOTS_PER_SIDE + i]!;
        const localT = Math.max(0, Math.min(1, (t - kit.offset) / (FORMATION_T - kit.offset)));

        let x: number;
        let z: number;
        if (localT < 1) {
          const p = localT;
          x = startX + (midX - startX) * p + perpX * kit.perpPos;
          z = startZ + (midZ - startZ) * p + perpZ * kit.perpPos;
        } else {
          const osc = Math.sin(nowMs / kit.freq + kit.phase) * 0.06;
          x = midX + perpX * (kit.perpPos + osc);
          z = midZ + perpZ * (kit.perpPos + osc);
        }

        tmpM.makeTranslation(x, midY, z);
        mesh.setMatrixAt(isAttacker ? atkWrite : defWrite, tmpM);
        if (isAttacker) atkWrite++; else defWrite++;
      }
    }

    attackerMesh.count = atkWrite;
    defenderMesh.count = defWrite;
    attackerMesh.instanceMatrix.needsUpdate = true;
    defenderMesh.instanceMatrix.needsUpdate = true;
  };

  const clear = (): void => {
    attackerMesh.count = 0;
    defenderMesh.count = 0;
  };

  const dispose = (): void => {
    scene.remove(attackerMesh, defenderMesh);
    dotGeom.dispose();
    attackerMat.dispose();
    defenderMat.dispose();
  };

  return { setSource, tick, clear, dispose };
}

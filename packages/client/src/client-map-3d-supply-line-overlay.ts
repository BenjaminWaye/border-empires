import {
  BufferGeometry,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Scene
} from "three";

export type SupplyLinePhase = "transit" | "locked";

export type SupplyLineOverlay = {
  clear: () => void;
  addLine: (
    fromX: number, fromZ: number, fromSurfaceY: number,
    toX: number, toZ: number, toSurfaceY: number,
    phase: SupplyLinePhase,
    ownerColor: string
  ) => void;
  commit: () => void;
  tick: (nowMs: number) => void;
  dispose: () => void;
};

const FLOAT_ABOVE = 0.06;

type PendingLine = {
  fromX: number; fromZ: number; fromY: number;
  toX: number; toZ: number; toY: number;
  phase: SupplyLinePhase;
  ownerColor: string;
};

export const createSupplyLineOverlay = (scene: Scene): SupplyLineOverlay => {
  const activeLines: Array<{ line: Line; mat: LineBasicMaterial; phase: SupplyLinePhase }> = [];
  const pending: PendingLine[] = [];

  const clear = (): void => {
    for (const { line, mat } of activeLines) {
      scene.remove(line);
      line.geometry.dispose();
      mat.dispose();
    }
    activeLines.length = 0;
    pending.length = 0;
  };

  const addLine = (
    fromX: number, fromZ: number, fromSurfaceY: number,
    toX: number, toZ: number, toSurfaceY: number,
    phase: SupplyLinePhase,
    ownerColor: string
  ): void => {
    pending.push({ fromX, fromZ, fromY: fromSurfaceY + FLOAT_ABOVE, toX, toZ, toY: toSurfaceY + FLOAT_ABOVE, phase, ownerColor });
  };

  const commit = (): void => {
    for (const p of pending) {
      const geo = new BufferGeometry();
      geo.setAttribute("position", new Float32BufferAttribute([
        p.fromX, p.fromY, p.fromZ,
        p.toX, p.toY, p.toZ
      ], 3));
      const mat = new LineBasicMaterial({
        color: p.ownerColor,
        transparent: true,
        opacity: p.phase === "transit" ? 0.95 : 0.75,
        depthTest: false,
        depthWrite: false
      });
      const line = new Line(geo, mat);
      line.renderOrder = 37;
      scene.add(line);
      activeLines.push({ line, mat, phase: p.phase });
    }
    pending.length = 0;
  };

  const tick = (nowMs: number): void => {
    for (const { mat, phase } of activeLines) {
      if (phase === "transit") {
        mat.opacity = 0.6 + 0.35 * Math.abs(Math.sin(nowMs / 400));
        mat.needsUpdate = true;
      }
    }
  };

  const dispose = (): void => {
    clear();
  };

  return { clear, addLine, commit, tick, dispose };
};

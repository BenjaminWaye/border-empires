import {
  CanvasTexture,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Scene,
  Vector3
} from "three";

// Floating progress bars for mustering and fort garrisons.
//
// Muster bar: shown on any tile with a `muster` flag (visible to anyone
// in range — no special building required; lets you see an enemy massing
// against you). Filled with the owner's empire color, labeled "M".
//
// Garrison bar: shown on fort tiles that have a garrison value. Filled in
// gold to differentiate it from muster. Labeled "G".
//
// Both bars are flat horizontal planes floating just above the tile, tilted
// back along X to face the default camera angle (matching other badge overlays).

const BAR_W = 0.58;
const BAR_H = 0.14;
const FLOAT_Y = 1.02;
const TILT_X = -0.50; // back-tilt to face the camera
const CANVAS_W = 256;
const CANVAS_H = 64;
const MAX_INSTANCES = 1024;

const buildCanvas = (
  fillRatio: number,
  label: string,
  fillStyle: string
): HTMLCanvasElement | null => {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const pad = 6;
  const barX = pad;
  const barY = pad;
  const barW = CANVAS_W - pad * 2;
  const barH = CANVAS_H - pad * 2;
  const radius = 6;

  // Background track
  ctx.fillStyle = "#00000066";
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, radius);
  ctx.fill();

  // Fill
  const fillW = Math.max(0, Math.min(1, fillRatio)) * barW;
  if (fillW > 2) {
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.roundRect(barX, barY, fillW, barH, radius);
    ctx.fill();
  }

  // Label + percentage
  const pct = Math.round(fillRatio * 100);
  ctx.fillStyle = "#ffffffdd";
  ctx.font = `bold ${Math.round(CANVAS_H * 0.52)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${label} ${pct}%`, CANVAS_W / 2, CANVAS_H / 2 + 1);

  return canvas;
};

const tilted = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), TILT_X);
const tmpMatrix = new Matrix4();
const tmpVec = new Vector3();

type BarKind = "muster" | "garrison";

type PendingBar = {
  x: number;
  z: number;
  surfaceY: number;
  fillRatio: number;
  kind: BarKind;
  ownerColor: string;
};

export type MusterOverlay = {
  readonly clear: () => void;
  readonly addMuster: (
    centerX: number, centerZ: number, surfaceY: number,
    fillRatio: number, ownerColor: string
  ) => void;
  readonly addGarrison: (
    centerX: number, centerZ: number, surfaceY: number,
    fillRatio: number
  ) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createMusterOverlay = (scene: Scene): MusterOverlay => {
  const geom = new PlaneGeometry(BAR_W, BAR_H);

  // One instanced mesh per unique canvas texture is expensive; instead we
  // maintain separate meshes for muster (per-color) and garrison (fixed gold).
  // For simplicity: rebuild instanced meshes on commit from the pending list.
  // With MAX_INSTANCES bars this is cheap.

  let pending: PendingBar[] = [];
  const meshes: InstancedMesh[] = [];

  const commitMeshes = () => {
    for (const m of meshes) {
      scene.remove(m);
      // Do NOT dispose m.geometry — it is the shared `geom` instance.
      (m.material as MeshBasicMaterial).map?.dispose();
      (m.material as MeshBasicMaterial).dispose();
    }
    meshes.length = 0;

    // Group by kind+color to batch instances with the same texture.
    const byKey = new Map<string, PendingBar[]>();
    for (const b of pending) {
      const key = b.kind === "garrison" ? "__garrison__" : b.ownerColor;
      let arr = byKey.get(key);
      if (!arr) { arr = []; byKey.set(key, arr); }
      arr.push(b);
    }

    for (const [key, bars] of byKey) {
      const isGarrison = key === "__garrison__";
      // Pick a representative bar for the canvas (they all share fill style)
      const sampleBar = bars[0]!;
      const canvas = buildCanvas(
        sampleBar.fillRatio,
        isGarrison ? "G" : "M",
        isGarrison ? "#d4af37" : sampleBar.ownerColor
      );
      if (!canvas) continue;

      const texture = new CanvasTexture(canvas);

      // Each bar needs its own ratio → separate mesh per bar (ratio differs).
      for (const bar of bars) {
        const barCanvas = buildCanvas(
          bar.fillRatio,
          isGarrison ? "G" : "M",
          isGarrison ? "#d4af37" : bar.ownerColor
        );
        if (!barCanvas) continue;
        const barTex = new CanvasTexture(barCanvas);
        const mat = new MeshBasicMaterial({ map: barTex, transparent: true, side: DoubleSide, depthWrite: false });
        const mesh = new InstancedMesh(geom, mat, 1);
        tmpVec.set(bar.x, bar.surfaceY + FLOAT_Y, bar.z);
        tmpMatrix.makeRotationFromQuaternion(tilted);
        tmpMatrix.setPosition(tmpVec);
        mesh.setMatrixAt(0, tmpMatrix);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.frustumCulled = false;
        scene.add(mesh);
        meshes.push(mesh);
      }
      texture.dispose(); // the sample texture isn't used
    }
  };

  return {
    clear() { pending = []; },
    addMuster(x, z, surfaceY, fillRatio, ownerColor) {
      if (pending.length >= MAX_INSTANCES) return;
      pending.push({ x, z, surfaceY, fillRatio, kind: "muster", ownerColor });
    },
    addGarrison(x, z, surfaceY, fillRatio) {
      if (pending.length >= MAX_INSTANCES) return;
      pending.push({ x, z, surfaceY: surfaceY + 0.18, fillRatio, kind: "garrison", ownerColor: "#d4af37" });
    },
    commit() { commitMeshes(); },
    dispose() {
      for (const m of meshes) {
        scene.remove(m);
        // Do NOT dispose m.geometry here — it is the shared `geom` instance.
        (m.material as MeshBasicMaterial).map?.dispose();
        (m.material as MeshBasicMaterial).dispose();
      }
      meshes.length = 0;
      geom.dispose();
    }
  };
};

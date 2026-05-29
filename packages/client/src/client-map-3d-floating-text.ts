import { CanvasTexture, Scene, Sprite, SpriteMaterial } from "three";

const FLOAT_DURATION_MS = 3200;
const FLOAT_RISE_HEIGHT = 4.2;
const SPRITE_BASE_SCALE_X = 3.2;
const SPRITE_BASE_SCALE_Y = 1.0;
const POP_IN_SCALE = 1.35;

const buildLabelTexture = (text: string, color: string): CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "900 96px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Soft dark shadow so red reads against bright smoke/terrain without a chunky outline.
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.95)";
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
};

type FloatingEntry = {
  sprite: Sprite;
  material: SpriteMaterial;
  texture: CanvasTexture;
  startMs: number;
  worldX: number;
  worldZ: number;
  baseY: number;
};

export type FloatingTextLayer = {
  readonly spawn: (worldX: number, worldZ: number, surfaceY: number, text: string, color?: string) => void;
  readonly update: (nowMs: number) => void;
  readonly clear: () => void;
  readonly dispose: () => void;
};

export const createFloatingTextLayer = (scene: Scene): FloatingTextLayer => {
  const entries: FloatingEntry[] = [];

  const spawn = (worldX: number, worldZ: number, surfaceY: number, text: string, color = "#ff2d2d"): void => {
    const texture = buildLabelTexture(text, color);
    const material = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false });
    const sprite = new Sprite(material);
    sprite.scale.set(SPRITE_BASE_SCALE_X, SPRITE_BASE_SCALE_Y, 1);
    sprite.position.set(worldX, surfaceY + 2.2, worldZ);
    sprite.renderOrder = 9999;
    scene.add(sprite);
    entries.push({ sprite, material, texture, startMs: performance.now(), worldX, worldZ, baseY: surfaceY + 2.2 });
  };

  const disposeEntry = (entry: FloatingEntry): void => {
    scene.remove(entry.sprite);
    entry.material.dispose();
    entry.texture.dispose();
  };

  const update = (nowMs: number): void => {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i]!;
      const t = (nowMs - entry.startMs) / FLOAT_DURATION_MS;
      if (t >= 1) {
        disposeEntry(entry);
        entries.splice(i, 1);
        continue;
      }
      // Ease-out rise: fast at first, slows as it floats away.
      const rise = 1 - Math.pow(1 - t, 2);
      entry.sprite.position.y = entry.baseY + rise * FLOAT_RISE_HEIGHT;
      // Pop-in scale: briefly larger than rest size for the first ~120ms.
      const popPhase = Math.min(1, t / 0.12);
      const popScale = 1 + (POP_IN_SCALE - 1) * (1 - popPhase);
      entry.sprite.scale.set(SPRITE_BASE_SCALE_X * popScale, SPRITE_BASE_SCALE_Y * popScale, 1);
      // Hold full opacity longer, then fade in the final third.
      entry.material.opacity = t < 0.08 ? t / 0.08 : t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
    }
  };

  const clear = (): void => {
    for (const entry of entries) disposeEntry(entry);
    entries.length = 0;
  };

  const dispose = (): void => {
    clear();
  };

  return { spawn, update, clear, dispose };
};

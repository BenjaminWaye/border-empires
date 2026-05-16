import { CanvasTexture, Scene, Sprite, SpriteMaterial } from "three";

const FLOAT_DURATION_MS = 2200;
const FLOAT_RISE_HEIGHT = 1.6;
const SPRITE_BASE_SCALE_X = 1.4;
const SPRITE_BASE_SCALE_Y = 0.45;

const buildLabelTexture = (text: string, color: string): CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "bold 60px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
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

  const spawn = (worldX: number, worldZ: number, surfaceY: number, text: string, color = "#ff6b6b"): void => {
    const texture = buildLabelTexture(text, color);
    const material = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false });
    const sprite = new Sprite(material);
    sprite.scale.set(SPRITE_BASE_SCALE_X, SPRITE_BASE_SCALE_Y, 1);
    sprite.position.set(worldX, surfaceY + 1.6, worldZ);
    sprite.renderOrder = 999;
    scene.add(sprite);
    entries.push({ sprite, material, texture, startMs: performance.now(), worldX, worldZ, baseY: surfaceY + 1.6 });
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
      entry.sprite.position.y = entry.baseY + t * FLOAT_RISE_HEIGHT;
      entry.material.opacity = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
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

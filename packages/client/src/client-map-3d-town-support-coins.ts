import { CanvasTexture, Scene, Sprite, SpriteMaterial } from "three";

const COIN_POOL_SIZE = 8;
const COIN_TEXTURE_SIZE = 128;
const COIN_SCALE = 0.55;
const COIN_RISE_ABOVE_SURFACE = 0.95;

export type TownSupportCoinKind = "gold" | "grey";

export type TownSupportCoinEntry = {
  worldX: number;
  worldZ: number;
  surfaceY: number;
  kind: TownSupportCoinKind;
};

export type TownSupportCoinLayer = {
  readonly sync: (entries: readonly TownSupportCoinEntry[]) => void;
  readonly clear: () => void;
  readonly dispose: () => void;
};

const buildCoinTexture = (kind: TownSupportCoinKind): CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = COIN_TEXTURE_SIZE;
  canvas.height = COIN_TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const cx = COIN_TEXTURE_SIZE / 2;
    const cy = COIN_TEXTURE_SIZE / 2;
    const r = COIN_TEXTURE_SIZE * 0.42;
    ctx.clearRect(0, 0, COIN_TEXTURE_SIZE, COIN_TEXTURE_SIZE);
    const gradient = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r);
    if (kind === "gold") {
      gradient.addColorStop(0, "#fff3a0");
      gradient.addColorStop(0.55, "#ffd24a");
      gradient.addColorStop(1, "#b07a00");
    } else {
      gradient.addColorStop(0, "#dcdfe4");
      gradient.addColorStop(0.55, "#9aa1ad");
      gradient.addColorStop(1, "#5a6170");
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = kind === "gold" ? "#6b4500" : "#2e333d";
    ctx.stroke();
    ctx.font = `bold ${Math.round(r * 1.25)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 5;
    ctx.strokeStyle = kind === "gold" ? "#6b4500" : "#2e333d";
    ctx.strokeText("$", cx, cy + 2);
    ctx.fillStyle = kind === "gold" ? "#fff8c4" : "#cdd2da";
    ctx.fillText("$", cx, cy + 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
};

export const createTownSupportCoinLayer = (scene: Scene): TownSupportCoinLayer => {
  const goldTexture = buildCoinTexture("gold");
  const greyTexture = buildCoinTexture("grey");
  const slots = Array.from({ length: COIN_POOL_SIZE }, () => {
    const material = new SpriteMaterial({
      map: goldTexture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      opacity: 1
    });
    const sprite = new Sprite(material);
    sprite.scale.set(COIN_SCALE, COIN_SCALE, 1);
    sprite.renderOrder = 32;
    sprite.visible = false;
    scene.add(sprite);
    return { sprite, material };
  });

  const sync = (entries: readonly TownSupportCoinEntry[]): void => {
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i]!;
      const entry = entries[i];
      if (!entry) {
        slot.sprite.visible = false;
        continue;
      }
      const desiredMap = entry.kind === "gold" ? goldTexture : greyTexture;
      if (slot.material.map !== desiredMap) {
        slot.material.map = desiredMap;
        slot.material.opacity = entry.kind === "gold" ? 1 : 0.78;
        slot.material.needsUpdate = true;
      }
      slot.sprite.position.set(entry.worldX, entry.surfaceY + COIN_RISE_ABOVE_SURFACE, entry.worldZ);
      slot.sprite.visible = true;
    }
  };

  const clear = (): void => {
    for (const slot of slots) slot.sprite.visible = false;
  };

  const dispose = (): void => {
    for (const slot of slots) {
      scene.remove(slot.sprite);
      slot.material.dispose();
    }
    goldTexture.dispose();
    greyTexture.dispose();
  };

  return { sync, clear, dispose };
};

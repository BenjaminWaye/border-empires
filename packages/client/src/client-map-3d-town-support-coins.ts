import { CanvasTexture, Scene, Sprite, SpriteMaterial } from "three";

const COIN_POOL_SIZE = 8;
const COIN_TEXTURE_SIZE = 160;
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

// Real gold coins read as gold because of these cues stacked together:
//   1. A warm radial gradient (highlight upper-left, deep amber lower-right)
//      that suggests 3D form lit from above.
//   2. A dark rim outline + a thinner inner ring framing a recessed face.
//   3. Tiny radial tick marks suggesting the milled/reeded edge.
//   4. A soft specular highlight in the upper-left to sell the metallic shine.
// No glyph or denomination on the face — the disk's metallic look is what
// makes it read as a coin; adding a symbol clutters the icon. The grey
// coin uses the same construction with desaturated silvery tones so
// "not yet contributing" reads as a tarnished/empty coin instead of a
// different shape.
const buildCoinTexture = (kind: TownSupportCoinKind): CanvasTexture => {
  const size = COIN_TEXTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.44;
  ctx.clearRect(0, 0, size, size);

  const palette = kind === "gold"
    ? {
        highlight: "#fff5c2",
        midLight: "#ffdc5b",
        mid: "#e8b923",
        shadow: "#8b5a06",
        rim: "#3a2204",
        innerShadow: "rgba(60, 36, 4, 0.35)",
        specular: "rgba(255, 252, 215, 0.55)"
      }
    : {
        highlight: "#f0f2f6",
        midLight: "#cfd3da",
        mid: "#9aa0ab",
        shadow: "#52596a",
        rim: "#23272f",
        innerShadow: "rgba(34, 38, 46, 0.30)",
        specular: "rgba(255, 255, 255, 0.40)"
      };

  // 1. Coin body — radial gradient offset toward upper-left so the form
  // reads as a domed disk lit from above.
  const bodyGradient = ctx.createRadialGradient(
    cx - r * 0.35, cy - r * 0.4, r * 0.05,
    cx + r * 0.15, cy + r * 0.2, r * 1.05
  );
  bodyGradient.addColorStop(0, palette.highlight);
  bodyGradient.addColorStop(0.25, palette.midLight);
  bodyGradient.addColorStop(0.65, palette.mid);
  bodyGradient.addColorStop(1, palette.shadow);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = bodyGradient;
  ctx.fill();

  // 2. Outer rim outline.
  ctx.lineWidth = Math.max(3, size * 0.025);
  ctx.strokeStyle = palette.rim;
  ctx.stroke();

  // 3. Milled (reeded) edge — short radial ticks just inside the rim.
  const tickInner = r * 0.86;
  const tickOuter = r * 0.95;
  ctx.strokeStyle = palette.rim;
  ctx.lineWidth = Math.max(1.5, size * 0.011);
  ctx.globalAlpha = 0.5;
  const tickCount = 40;
  for (let i = 0; i < tickCount; i += 1) {
    const angle = (i / tickCount) * Math.PI * 2;
    const ix = cx + Math.cos(angle) * tickInner;
    const iy = cy + Math.sin(angle) * tickInner;
    const ox = cx + Math.cos(angle) * tickOuter;
    const oy = cy + Math.sin(angle) * tickOuter;
    ctx.beginPath();
    ctx.moveTo(ix, iy);
    ctx.lineTo(ox, oy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 4. Inner ring framing a slightly recessed face. Soft inner-shadow
  // gradient inside the ring sells the recess without requiring a glyph.
  const innerRingRadius = r * 0.78;
  const faceGradient = ctx.createRadialGradient(
    cx - r * 0.18, cy - r * 0.2, r * 0.05,
    cx + r * 0.1, cy + r * 0.15, innerRingRadius
  );
  faceGradient.addColorStop(0, "rgba(255, 255, 255, 0)");
  faceGradient.addColorStop(0.7, "rgba(0, 0, 0, 0)");
  faceGradient.addColorStop(1, palette.innerShadow);
  ctx.beginPath();
  ctx.arc(cx, cy, innerRingRadius, 0, Math.PI * 2);
  ctx.fillStyle = faceGradient;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, size * 0.014);
  ctx.strokeStyle = palette.rim;
  ctx.globalAlpha = 0.55;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 5. Soft specular highlight in the upper-left to sell the metallic shine.
  const specGradient = ctx.createRadialGradient(
    cx - r * 0.4, cy - r * 0.45, 0,
    cx - r * 0.4, cy - r * 0.45, r * 0.55
  );
  specGradient.addColorStop(0, palette.specular);
  specGradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.97, 0, Math.PI * 2);
  ctx.fillStyle = specGradient;
  ctx.fill();

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

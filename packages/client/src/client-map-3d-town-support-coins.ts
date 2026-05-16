import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene,
  Sprite,
  SpriteMaterial
} from "three";

const COIN_POOL_SIZE = 8;
const COIN_TEXTURE_SIZE = 160;
const COIN_SCALE = 0.55;
const COIN_RISE_ABOVE_SURFACE = 0.95;
const COIN_SHADOW_TEXTURE_SIZE = 128;
const COIN_SHADOW_SCALE = 0.7;
const COIN_SHADOW_LIFT = 0.05;
const GREY_COIN_OPACITY = 0.55;
const SHADOW_OPACITY_GOLD = 0.6;
const SHADOW_OPACITY_GREY = 0.35;

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

// Stylized 3D coin in the same style as the reference: a slightly-tilted
// disk drawn as an ellipse, with a visible edge thickness underneath
// (the side of the coin) and a recessed inner face on top. Cues:
//   1. Edge/side band — a darker copy of the top ellipse, offset down,
//      with the gap between them filled by a vertical metallic gradient.
//      This is what makes the coin read as a thick disk, not a flat sticker.
//   2. Top face — bright ellipse with a smooth radial highlight on the
//      upper-left, fading to a deeper tone at the lower-right.
//   3. Inset inner ellipse forming the recessed face, ringed by a dark
//      band (the recess shadow) and a thin bright bevel just inside it.
// The ground shadow is NOT baked here — it's drawn on a separate flat
// plane anchored to the tile so it stays on the ground while the coin
// hovers above it (see buildShadowTexture / sync).
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
  const cy = size * 0.48;
  const rx = size * 0.42;
  const ry = size * 0.34;
  const edgeDepth = size * 0.10;
  ctx.clearRect(0, 0, size, size);

  const palette = kind === "gold"
    ? {
        faceHi: "#ffe27a",
        faceMid: "#f5b827",
        faceLo: "#b6790c",
        recessRing: "#7a4d05",
        bevel: "#fff1a8",
        edgeHi: "#e7a91a",
        edgeLo: "#7a4d05",
        rim: "#2a1a02"
      }
    : {
        faceHi: "#f1f3f7",
        faceMid: "#b9bec7",
        faceLo: "#6b7180",
        recessRing: "#3d4250",
        bevel: "#ffffff",
        edgeHi: "#9aa0ab",
        edgeLo: "#3d4250",
        rim: "#1a1d24"
      };

  // 1. Edge / side band — draw bottom ellipse (dark rim color) then fill
  // the vertical band between the two ellipses with a metallic gradient.
  // Build the band as a path: outer side of the top ellipse from left to
  // right (going through the bottom), then outer side of the bottom
  // ellipse from right to left (going through the top), closing back.
  ctx.beginPath();
  ctx.ellipse(cx, cy + edgeDepth, rx, ry, 0, Math.PI, Math.PI * 2);
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI, true);
  ctx.closePath();
  const edgeGrad = ctx.createLinearGradient(0, cy, 0, cy + edgeDepth);
  edgeGrad.addColorStop(0, palette.edgeHi);
  edgeGrad.addColorStop(0.5, palette.edgeLo);
  edgeGrad.addColorStop(1, palette.edgeHi);
  ctx.fillStyle = edgeGrad;
  ctx.fill();
  // Dark outline around the side.
  ctx.lineWidth = Math.max(2, size * 0.012);
  ctx.strokeStyle = palette.rim;
  ctx.stroke();

  // 2. Top face — ellipse with a radial highlight upper-left → lower-right.
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  const faceGrad = ctx.createRadialGradient(
    cx - rx * 0.35, cy - ry * 0.5, rx * 0.05,
    cx + rx * 0.2, cy + ry * 0.35, rx * 1.1
  );
  faceGrad.addColorStop(0, palette.faceHi);
  faceGrad.addColorStop(0.45, palette.faceMid);
  faceGrad.addColorStop(1, palette.faceLo);
  ctx.fillStyle = faceGrad;
  ctx.fill();
  ctx.lineWidth = Math.max(2, size * 0.014);
  ctx.strokeStyle = palette.rim;
  ctx.stroke();

  // 3. Recessed inner face — dark ring then a slightly-smaller inset
  // ellipse with its own gradient. The ring sells the recess depth.
  const innerRx = rx * 0.72;
  const innerRy = ry * 0.7;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.06, innerRx, innerRy, 0, 0, Math.PI * 2);
  ctx.fillStyle = palette.recessRing;
  ctx.fill();
  // Bright bevel ring sitting just inside the recess shadow.
  ctx.lineWidth = Math.max(1.5, size * 0.010);
  ctx.strokeStyle = palette.bevel;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.04, innerRx * 0.97, innerRy * 0.97, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Inner face fill — slightly smaller, with its own subtle gradient,
  // offset down a touch so the upper recess shadow is visible.
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.08, innerRx * 0.92, innerRy * 0.9, 0, 0, Math.PI * 2);
  const innerGrad = ctx.createRadialGradient(
    cx - innerRx * 0.3, cy - innerRy * 0.3, innerRx * 0.05,
    cx + innerRx * 0.15, cy + innerRy * 0.25, innerRx * 1.1
  );
  innerGrad.addColorStop(0, palette.faceHi);
  innerGrad.addColorStop(0.6, palette.faceMid);
  innerGrad.addColorStop(1, palette.faceLo);
  ctx.fillStyle = innerGrad;
  ctx.fill();

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
};

const buildShadowTexture = (): CanvasTexture => {
  const size = COIN_SHADOW_TEXTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const cx = size / 2;
    const cy = size / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.5);
    grad.addColorStop(0, "rgba(0,0,0,0.22)");
    grad.addColorStop(0.35, "rgba(0,0,0,0.14)");
    grad.addColorStop(0.7, "rgba(0,0,0,0.05)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
};

export const createTownSupportCoinLayer = (scene: Scene): TownSupportCoinLayer => {
  const goldTexture = buildCoinTexture("gold");
  const greyTexture = buildCoinTexture("grey");
  const shadowTexture = buildShadowTexture();
  const shadowGeometry = new PlaneGeometry(1, 1);
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

    const shadowMaterial = new MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      opacity: 1
    });
    const shadow = new Mesh(shadowGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(COIN_SHADOW_SCALE, COIN_SHADOW_SCALE, 1);
    shadow.renderOrder = 30;
    shadow.visible = false;
    scene.add(shadow);

    return { sprite, material, shadow, shadowMaterial };
  });

  const sync = (entries: readonly TownSupportCoinEntry[]): void => {
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i]!;
      const entry = entries[i];
      if (!entry) {
        slot.sprite.visible = false;
        slot.shadow.visible = false;
        continue;
      }
      const desiredMap = entry.kind === "gold" ? goldTexture : greyTexture;
      const desiredOpacity = entry.kind === "gold" ? 1 : GREY_COIN_OPACITY;
      if (slot.material.map !== desiredMap) {
        slot.material.map = desiredMap;
        slot.material.needsUpdate = true;
      }
      if (slot.material.opacity !== desiredOpacity) {
        slot.material.opacity = desiredOpacity;
      }
      slot.sprite.position.set(entry.worldX, entry.surfaceY + COIN_RISE_ABOVE_SURFACE, entry.worldZ);
      slot.sprite.visible = true;
      slot.shadow.position.set(entry.worldX, entry.surfaceY + COIN_SHADOW_LIFT, entry.worldZ);
      const desiredShadowOpacity = entry.kind === "gold" ? SHADOW_OPACITY_GOLD : SHADOW_OPACITY_GREY;
      if (slot.shadowMaterial.opacity !== desiredShadowOpacity) {
        slot.shadowMaterial.opacity = desiredShadowOpacity;
      }
      slot.shadow.visible = true;
    }
  };

  const clear = (): void => {
    for (const slot of slots) {
      slot.sprite.visible = false;
      slot.shadow.visible = false;
    }
  };

  const dispose = (): void => {
    for (const slot of slots) {
      scene.remove(slot.sprite);
      slot.material.dispose();
      scene.remove(slot.shadow);
      slot.shadowMaterial.dispose();
    }
    shadowGeometry.dispose();
    shadowTexture.dispose();
    goldTexture.dispose();
    greyTexture.dispose();
  };

  return { sync, clear, dispose };
};

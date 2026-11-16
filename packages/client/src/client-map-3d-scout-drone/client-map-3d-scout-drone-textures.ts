import { CanvasTexture, SRGBColorSpace } from "three";

// Canvas textures for the scout drone (client-map-3d-scout-drone-overlay.ts), drawn once when the
// overlay is created and shared by every frame. Each is white or near-white so material colour
// tints it. Every builder returns null where there is no canvas (tests, workers); the materials
// then fall back to flat colour.

const canvasTexture = (size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): CanvasTexture | null => {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  draw(ctx, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

/** A soft round glow: bright core, long falloff. For lights, beads and trails. */
export const makeGlowTexture = (): CanvasTexture | null =>
  canvasTexture(64, (ctx, size) => {
    const half = size / 2;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.18, "rgba(255,255,255,0.85)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.25)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  });

/** A small, sharp point of light: a hard bright core with a short, tight halo. For the strobe. */
export const makePointGlowTexture = (): CanvasTexture | null =>
  canvasTexture(64, (ctx, size) => {
    const half = size / 2;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.08, "rgba(255,255,255,1)");
    grad.addColorStop(0.2, "rgba(255,255,255,0.35)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.06)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  });

/**
 * A prop seen at speed: a soft radial gradient, clear over the hub (never a hot core), fullest mid-blade and translucent toward the
 * tips, with a faint tip-path ring where the blade tips trace their circle.
 */
export const makeRotorBlurTexture = (): CanvasTexture | null =>
  canvasTexture(128, (ctx, size) => {
    const half = size / 2;
    const grad = ctx.createRadialGradient(half, half, size * 0.05, half, half, half);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.2, "rgba(255,255,255,0.2)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.22)");
    grad.addColorStop(0.85, "rgba(255,255,255,0.1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(half, half, half, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = size * 0.012;
    ctx.beginPath();
    ctx.arc(half, half, half * 0.95, 0, Math.PI * 2);
    ctx.stroke();
  });

/**
 * The radar sweep: a bright leading edge with a trailing wedge that fades out behind it, laid on
 * a full disc so the plane can simply rotate. The leading edge points along +X in the texture.
 */
export const makeSweepTexture = (): CanvasTexture | null =>
  canvasTexture(256, (ctx, size) => {
    const half = size / 2;
    const trail = 1.15; // radians of fading wedge behind the leading edge
    const steps = 48;
    for (let i = 0; i < steps; i += 1) {
      const a0 = -(i + 1) * (trail / steps);
      const a1 = -i * (trail / steps);
      const alpha = 0.55 * (1 - i / steps) ** 2;
      const radial = ctx.createRadialGradient(half, half, 0, half, half, half);
      radial.addColorStop(0, `rgba(255,255,255,${alpha * 0.25})`);
      radial.addColorStop(0.85, `rgba(255,255,255,${alpha})`);
      radial.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = radial;
      ctx.beginPath();
      ctx.moveTo(half, half);
      ctx.arc(half, half, half, a0, a1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = size * 0.012;
    ctx.beginPath();
    ctx.moveTo(half, half);
    ctx.lineTo(size * 0.98, half);
    ctx.stroke();
  });

/**
 * The vision footprint: a faint fill that falls off toward the edge, a crisp rim, an inner range
 * ring and tick marks every 15 degrees, so it reads as an instrument rather than a painted disc.
 */
export const makeVisionRingTexture = (): CanvasTexture | null =>
  canvasTexture(512, (ctx, size) => {
    const half = size / 2;
    const fill = ctx.createRadialGradient(half, half, 0, half, half, half);
    fill.addColorStop(0, "rgba(255,255,255,0.0)");
    fill.addColorStop(0.7, "rgba(255,255,255,0.08)");
    fill.addColorStop(0.97, "rgba(255,255,255,0.22)");
    fill.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = size * 0.008;
    ctx.beginPath();
    ctx.arc(half, half, half * 0.975, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = size * 0.003;
    ctx.setLineDash([size * 0.012, size * 0.012]);
    ctx.beginPath();
    ctx.arc(half, half, half * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = size * 0.005;
    for (let i = 0; i < 24; i += 1) {
      const angle = (i * Math.PI) / 12;
      const inner = i % 6 === 0 ? 0.88 : 0.93;
      ctx.beginPath();
      ctx.moveTo(half + Math.cos(angle) * half * inner, half + Math.sin(angle) * half * inner);
      ctx.lineTo(half + Math.cos(angle) * half * 0.975, half + Math.sin(angle) * half * 0.975);
      ctx.stroke();
    }
  });

/** Half the width of the drone's shadow silhouette texture, in drone-local units (props included). */
export const SCOUT_SHADOW_HALF_EXTENT = 0.27;

/**
 * The drone's contact shadow seen from straight above: the body, the X of the arms, the motors and
 * the faint discs of the props, blurred by `blur` (a fraction of the texture). Drawn in drone-local
 * units, nose toward the bottom of the texture, so the ground plane only has to turn with the yaw.
 */
export const makeSilhouetteShadowTexture = (blur: number): CanvasTexture | null =>
  canvasTexture(128, (ctx, size) => {
    const half = size / 2;
    const px = half / SCOUT_SHADOW_HALF_EXTENT;
    ctx.filter = `blur(${Math.max(0.5, blur * size)}px)`;
    ctx.translate(half, half);
    const reach = 0.2 * Math.SQRT1_2 * px;
    ctx.fillStyle = "rgba(255,255,255,0.32)";
    for (const [x, y] of [[reach, reach], [-reach, reach], [reach, -reach], [-reach, -reach]] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 0.085 * px, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,255,255,1)";
    ctx.lineCap = "round";
    ctx.lineWidth = 0.02 * px;
    ctx.beginPath();
    ctx.moveTo(-reach, -reach);
    ctx.lineTo(reach, reach);
    ctx.moveTo(reach, -reach);
    ctx.lineTo(-reach, reach);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,1)";
    for (const [x, y] of [[reach, reach], [-reach, reach], [reach, -reach], [-reach, -reach]] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 0.02 * px, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.066 * px, 0.122 * px, 0, 0, Math.PI * 2);
    ctx.fill();
  });

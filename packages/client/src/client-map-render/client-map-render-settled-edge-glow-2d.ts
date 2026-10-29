// 2D canvas half of the settled-territory edge glow (see
// client-settled-edge-glow.ts). Canvas can't take a per-pixel max over
// several edge gradients, so each (owner colour, neighbour mask) pair is
// baked once into a small tile -- the owner colour with the exact per-pixel
// fade alpha the 3D shader computes -- and stretched over the tile with
// drawImage. The boundary line itself is the existing exposed-side stroke
// (client-tile-borders.ts), so it isn't baked in here.
import { settledEdgeAlpha, settledEdgeDistance, type SettledEdgeGlow } from "../client-settled-edge-glow/client-settled-edge-glow.js";

type GlowCanvas = HTMLCanvasElement | OffscreenCanvas;
type GlowContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// Texels per tile edge. The fade spans a whole tile and drawImage filters
// bilinearly, so this stays smooth at any zoom.
const GLOW_TILE_RES = 32;
// At most 256 masks x a handful of visible owners; cleared wholesale if a
// palette churns past this so the cache can't grow without bound.
const MAX_TINTED_TILES = 512;

const createGlowCanvas = (): GlowCanvas => {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(GLOW_TILE_RES, GLOW_TILE_RES);
  const canvas = document.createElement("canvas");
  canvas.width = GLOW_TILE_RES;
  canvas.height = GLOW_TILE_RES;
  return canvas;
};

const contextOf = (canvas: GlowCanvas): GlowContext => {
  const ctx = canvas.getContext("2d") as GlowContext | null;
  if (!ctx) throw new Error("2D context unavailable for settled edge glow tile");
  return ctx;
};

export type SettledEdgeGlow2D = {
  /** Paints a settled tile's owner tint with the edge fade; alphaScale multiplies the whole tile (breach shock dimming). */
  readonly draw: (ctx: CanvasRenderingContext2D, ownerColor: string, mask: number, px: number, py: number, size: number, alphaScale: number) => void;
};

export const createSettledEdgeGlow2D = (glow: SettledEdgeGlow): SettledEdgeGlow2D => {
  const alphaMasks = new Map<number, GlowCanvas>();
  const tinted = new Map<string, GlowCanvas>();

  const alphaMaskFor = (mask: number): GlowCanvas => {
    const cached = alphaMasks.get(mask);
    if (cached) return cached;
    const canvas = createGlowCanvas();
    const ctx = contextOf(canvas);
    const image = ctx.createImageData(GLOW_TILE_RES, GLOW_TILE_RES);
    for (let y = 0; y < GLOW_TILE_RES; y += 1) {
      for (let x = 0; x < GLOW_TILE_RES; x += 1) {
        const alpha = settledEdgeAlpha(settledEdgeDistance((x + 0.5) / GLOW_TILE_RES, (y + 0.5) / GLOW_TILE_RES, mask), glow);
        const i = (y * GLOW_TILE_RES + x) * 4;
        image.data[i] = 255;
        image.data[i + 1] = 255;
        image.data[i + 2] = 255;
        image.data[i + 3] = Math.round(alpha * 255);
      }
    }
    ctx.putImageData(image, 0, 0);
    alphaMasks.set(mask, canvas);
    return canvas;
  };

  const tintedFor = (ownerColor: string, mask: number): GlowCanvas => {
    const key = `${ownerColor}|${mask}`;
    const cached = tinted.get(key);
    if (cached) return cached;
    if (tinted.size >= MAX_TINTED_TILES) tinted.clear();
    const canvas = createGlowCanvas();
    const ctx = contextOf(canvas);
    ctx.fillStyle = ownerColor;
    ctx.fillRect(0, 0, GLOW_TILE_RES, GLOW_TILE_RES);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(alphaMaskFor(mask), 0, 0);
    tinted.set(key, canvas);
    return canvas;
  };

  const draw: SettledEdgeGlow2D["draw"] = (ctx, ownerColor, mask, px, py, size, alphaScale) => {
    if (mask === 0) {
      // Interior tile: a flat fill at interiorOpacity, no baked tile needed.
      ctx.fillStyle = ownerColor;
      ctx.globalAlpha = glow.interiorOpacity * alphaScale;
      ctx.fillRect(px, py, size, size);
    } else {
      ctx.globalAlpha = alphaScale;
      ctx.drawImage(tintedFor(ownerColor, mask), px, py, size, size);
    }
    ctx.globalAlpha = 1;
  };

  return { draw };
};

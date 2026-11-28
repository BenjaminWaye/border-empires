// 2D canvas half of the frontier hatch (3D: client-map-3d-frontier-hatch.ts).
// Owner-colour diagonal stripes over a faint wash, so frontier reads as
// "claimed, not settled" on any ground colour instead of a thin flat tint
// that a green or brown empire loses on grass or sand. Same stripe recipe as
// the 3D shader: stripePairsPerTile whole stripe pairs on tile-local UVs, so
// stripes run on across tile seams. Each owner colour is baked once into a
// small tile and stretched over the map tile with drawImage.
import type { FrontierHatch } from "../client-map-3d-settled-edge-glow/client-map-3d-frontier-hatch.js";

type HatchCanvas = HTMLCanvasElement | OffscreenCanvas;
type HatchContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// Texels per tile edge: 4 stripe pairs get 8 texels each, which drawImage
// stretches smoothly at map zooms.
const HATCH_TILE_RES = 32;
// Least-recently-used eviction past this many owner colours.
const MAX_TINTED_TILES = 256;

/** Hatch opacity at tile-local (u, v) in [0, 1): stripeOpacity on a stripe, gapOpacity between. Matches the 3D shader. */
export const frontierHatchAlpha = (u: number, v: number, hatch: FrontierHatch): number => {
  const pairs = Math.max(1, Math.round(hatch.stripePairsPerTile));
  const t = (u + v) * pairs;
  const tri = Math.abs(t - Math.floor(t) - 0.5);
  return tri > 0.25 ? hatch.stripeOpacity : hatch.gapOpacity;
};

const createHatchCanvas = (): HatchCanvas | undefined => {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(HATCH_TILE_RES, HATCH_TILE_RES);
  if (typeof document === "undefined") return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = HATCH_TILE_RES;
  canvas.height = HATCH_TILE_RES;
  return canvas;
};

export type FrontierHatch2D = {
  /** Paints a frontier tile's hatch in its owner colour; alphaScale multiplies the whole tile (decay blink, breach dimming). */
  readonly draw: (ctx: CanvasRenderingContext2D, ownerColor: string, px: number, py: number, size: number, alphaScale: number) => void;
};

export const createFrontierHatch2D = (hatch: FrontierHatch): FrontierHatch2D => {
  let alphaMask: HatchCanvas | undefined;
  const tinted = new Map<string, HatchCanvas>();
  const averageOpacity = (hatch.stripeOpacity + hatch.gapOpacity) / 2;

  const maskCanvas = (): HatchCanvas | undefined => {
    if (alphaMask) return alphaMask;
    const canvas = createHatchCanvas();
    const ctx = canvas?.getContext("2d") as HatchContext | null | undefined;
    if (!canvas || !ctx) return undefined;
    const image = ctx.createImageData(HATCH_TILE_RES, HATCH_TILE_RES);
    for (let y = 0; y < HATCH_TILE_RES; y += 1) {
      for (let x = 0; x < HATCH_TILE_RES; x += 1) {
        const i = (y * HATCH_TILE_RES + x) * 4;
        image.data[i] = 255;
        image.data[i + 1] = 255;
        image.data[i + 2] = 255;
        image.data[i + 3] = Math.round(frontierHatchAlpha((x + 0.5) / HATCH_TILE_RES, (y + 0.5) / HATCH_TILE_RES, hatch) * 255);
      }
    }
    ctx.putImageData(image, 0, 0);
    alphaMask = canvas;
    return canvas;
  };

  const tintedFor = (ownerColor: string): HatchCanvas | undefined => {
    const cached = tinted.get(ownerColor);
    if (cached) {
      // Map keeps insertion order: re-inserting marks this entry most recent.
      tinted.delete(ownerColor);
      tinted.set(ownerColor, cached);
      return cached;
    }
    const mask = maskCanvas();
    const canvas = createHatchCanvas();
    const ctx = canvas?.getContext("2d") as HatchContext | null | undefined;
    if (!mask || !canvas || !ctx) return undefined;
    if (tinted.size >= MAX_TINTED_TILES) {
      const oldest = tinted.keys().next().value;
      if (oldest !== undefined) tinted.delete(oldest);
    }
    ctx.fillStyle = ownerColor;
    ctx.fillRect(0, 0, HATCH_TILE_RES, HATCH_TILE_RES);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0);
    tinted.set(ownerColor, canvas);
    return canvas;
  };

  const draw: FrontierHatch2D["draw"] = (ctx, ownerColor, px, py, size, alphaScale) => {
    // Below ~2px per stripe the stripes alias into moire; fall back to their average, as the 3D shader does.
    const stripes = size / Math.max(1, Math.round(hatch.stripePairsPerTile)) >= 4 ? tintedFor(ownerColor) : undefined;
    if (stripes) {
      ctx.globalAlpha = alphaScale;
      ctx.drawImage(stripes, px, py, size, size);
    } else {
      ctx.fillStyle = ownerColor;
      ctx.globalAlpha = averageOpacity * alphaScale;
      ctx.fillRect(px, py, size, size);
    }
    ctx.globalAlpha = 1;
  };

  return { draw };
};

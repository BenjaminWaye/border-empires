import type { CrestCosmeticId } from "@border-empires/shared";

import { CREST_GLYPHS } from "./client-house-crest-art.js";

// House crests as images for the map renderers: the 2D canvas draws them on
// the muster pennant, and the true-3D banner rasterises them into its crest
// atlas (muster-banner-crest-atlas.ts). One image per crest and colour, made
// once from the same SVG the HUD uses, so map and HUD always match.

/** A standalone SVG document for one crest, painted in `color`. */
export const crestSvgDocument = (id: CrestCosmeticId, color: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96" color="${color}" fill="${color}">${CREST_GLYPHS[id]}</svg>`;

export const crestSvgDataUrl = (id: CrestCosmeticId, color: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(crestSvgDocument(id, color))}`;

const images = new Map<string, HTMLImageElement>();

/**
 * The crest as a decoded image, or undefined until it has loaded (the first
 * call starts loading it; a later frame draws it). Bounded: 12 crests, and
 * callers use a fixed colour or two.
 */
export const crestImage = (id: CrestCosmeticId, color = "#ffffff"): HTMLImageElement | undefined => {
  if (typeof Image === "undefined") return undefined;
  const key = `${id}|${color}`;
  let image = images.get(key);
  if (!image) {
    image = new Image();
    image.decoding = "async";
    image.src = crestSvgDataUrl(id, color);
    images.set(key, image);
  }
  return image.complete && image.naturalWidth > 0 ? image : undefined;
};

/** Resolves once the crest image has loaded (or failed: undefined). */
export const loadCrestImage = (id: CrestCosmeticId, color = "#ffffff"): Promise<HTMLImageElement | undefined> => {
  const ready = crestImage(id, color);
  const image = images.get(`${id}|${color}`);
  if (ready || !image) return Promise.resolve(ready);
  return new Promise((resolve) => {
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => resolve(undefined), { once: true });
  });
};

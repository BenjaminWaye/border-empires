import type { CrestCosmeticId } from "@border-empires/shared";

import { CREST_GLYPHS } from "./client-house-crest-art.js";
import { esc } from "./client-crest-escape.js";

// House crests as images for the map renderers: the 2D canvas draws them on
// the muster pennant, and the true-3D banner rasterises them into its crest
// atlas (muster-banner-crest-atlas.ts). One image per crest and colour, made
// once from the same SVG the HUD uses, so map and HUD always match.

/** A standalone SVG document for one crest, painted in `color`. */
export const crestSvgDocument = (id: CrestCosmeticId, color: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96" color="${esc(color)}" fill="${esc(color)}">${CREST_GLYPHS[id]}</svg>`;

export const crestSvgDataUrl = (id: CrestCosmeticId, color: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(crestSvgDocument(id, color))}`;

const images = new Map<string, HTMLImageElement>();
// Keys whose image failed to load and were dropped once so the next request
// tries again. A second failure stays cached as a broken image (no retries
// every frame).
const retried = new Set<string>();

const forgetFailedOnce = (key: string, image: HTMLImageElement): void => {
  if (retried.has(key) || images.get(key) !== image) return;
  retried.add(key);
  images.delete(key);
};

/**
 * The crest as a decoded image, or undefined until it has loaded (the first
 * call starts loading it; a later frame draws it). A failed load is retried
 * once. Bounded: 12 crests, and callers use a fixed colour or two.
 */
export const crestImage = (id: CrestCosmeticId, color = "#ffffff"): HTMLImageElement | undefined => {
  if (typeof Image === "undefined") return undefined;
  const key = `${id}|${color}`;
  let image = images.get(key);
  if (!image) {
    const created = new Image();
    created.decoding = "async";
    created.addEventListener("error", () => forgetFailedOnce(key, created), { once: true });
    created.src = crestSvgDataUrl(id, color);
    images.set(key, created);
    image = created;
  }
  return image.complete && image.naturalWidth > 0 ? image : undefined;
};

const loadOnce = (id: CrestCosmeticId, color: string): Promise<HTMLImageElement | undefined> => {
  const ready = crestImage(id, color);
  const image = images.get(`${id}|${color}`);
  if (ready || !image) return Promise.resolve(ready);
  // Already settled as broken: listeners would never fire.
  if (image.complete) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => resolve(undefined), { once: true });
  });
};

/** Resolves once the crest image has loaded, trying a failed load once more (undefined if both fail). */
export const loadCrestImage = async (id: CrestCosmeticId, color = "#ffffff"): Promise<HTMLImageElement | undefined> =>
  (await loadOnce(id, color)) ?? loadOnce(id, color);

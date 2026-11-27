import { CREST_COSMETIC_IDS, type CrestCosmeticId } from "@border-empires/shared";
import { CanvasTexture, DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, type Texture } from "three";

import { loadCrestImage } from "../client-house-crest/client-crest-image.js";

// House crests for the muster banner's cloth (muster-banner-cloth-material.ts).
// Every crest is rasterised once into one atlas: red is the crest, green the
// crest grown by a few pixels, so the shader can stitch a dark outline round
// it like the standard cog's. `aBannerCrest` per instance picks the cell:
// 0 means no crest (the cog), n is CREST_COSMETIC_IDS[n - 1].

export const CREST_ATLAS_COLUMNS = 4;
export const CREST_ATLAS_ROWS = Math.ceil(CREST_COSMETIC_IDS.length / CREST_ATLAS_COLUMNS);
const CELL = 128;
/** Crest size inside its cell; the rest is room for the outline. */
const GLYPH = 104;
const OUTLINE_PX = 7;

/** `aBannerCrest` value for an owner's crest: 0 for none. */
export const bannerCrestIndex = (crest: CrestCosmeticId | undefined): number =>
  crest ? CREST_COSMETIC_IDS.indexOf(crest) + 1 : 0;

/** Cell (column, row from the top) of a crest index from bannerCrestIndex. */
export const crestAtlasCell = (index: number): { column: number; row: number } => ({
  column: (index - 1) % CREST_ATLAS_COLUMNS,
  row: Math.floor((index - 1) / CREST_ATLAS_COLUMNS)
});

const OFFSETS: ReadonlyArray<readonly [number, number]> = Array.from({ length: 16 }, (_, i) => {
  const angle = (i / 16) * Math.PI * 2;
  return [Math.round(Math.cos(angle) * OUTLINE_PX), Math.round(Math.sin(angle) * OUTLINE_PX)] as const;
});

/** Paints one crest's cell: the crest into red, its grown outline into green. */
const paintCell = (ctx: CanvasRenderingContext2D, image: CanvasImageSource, column: number, row: number): void => {
  const x = column * CELL + (CELL - GLYPH) / 2;
  const y = row * CELL + (CELL - GLYPH) / 2;
  ctx.globalCompositeOperation = "lighter";
  // Green: the crest stamped round a ring, i.e. grown by OUTLINE_PX.
  const green = document.createElement("canvas");
  green.width = CELL;
  green.height = CELL;
  const g = green.getContext("2d");
  if (!g) return;
  for (const [dx, dy] of OFFSETS) g.drawImage(image, (CELL - GLYPH) / 2 + dx, (CELL - GLYPH) / 2 + dy, GLYPH, GLYPH);
  g.drawImage(image, (CELL - GLYPH) / 2, (CELL - GLYPH) / 2, GLYPH, GLYPH);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = "#00ff00";
  g.fillRect(0, 0, CELL, CELL);
  ctx.drawImage(green, column * CELL, row * CELL);
  // Red: the crest itself (the image is drawn in pure red).
  ctx.drawImage(image, x, y, GLYPH, GLYPH);
};

export type BannerCrestAtlas = { readonly texture: Texture; readonly dispose: () => void };

/**
 * The atlas texture. It starts black (no crest anywhere) and fills in once
 * the crest images have loaded, which takes a frame or two; until then a
 * crested flag shows a plain field where the crest will be.
 */
export const createBannerCrestAtlas = (): BannerCrestAtlas => {
  // No DOM (a worker or a test): an empty atlas, so every flag keeps its device.
  if (typeof document === "undefined") {
    const empty = new DataTexture(new Uint8Array(4), 1, 1);
    empty.needsUpdate = true;
    return { texture: empty, dispose: () => empty.dispose() };
  }
  const canvas = document.createElement("canvas");
  canvas.width = CREST_ATLAS_COLUMNS * CELL;
  canvas.height = CREST_ATLAS_ROWS * CELL;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = NoColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  let disposed = false;
  if (ctx) {
    void Promise.all(CREST_COSMETIC_IDS.map((id) => loadCrestImage(id, "#ff0000"))).then((images) => {
      if (disposed) return;
      images.forEach((image, i) => {
        if (!image) return;
        const { column, row } = crestAtlasCell(i + 1);
        paintCell(ctx, image, column, row);
      });
      ctx.globalCompositeOperation = "source-over";
      texture.needsUpdate = true;
    });
  }
  return {
    texture,
    dispose: () => {
      disposed = true;
      texture.dispose();
    }
  };
};

let shared: BannerCrestAtlas | undefined;

/** One atlas for every banner cloth material in the session (a 512×384 texture), made on first use. */
export const sharedBannerCrestAtlas = (): BannerCrestAtlas => {
  shared ??= createBannerCrestAtlas();
  return shared;
};

// Steampunk resource icon set (PNGs under public/icons/resources, exported at
// 48/72/96 px). HTML callers use resourceIconHtml; canvas callers (the 2D tile
// corner marker, 3D badge textures) use drawResourceIconOnCanvas, which falls
// back to the text glyph until the PNG has decoded. resourceIconGlyph stays the
// plain-text form for contexts that can't hold markup (canvas text, titles).

export type ResourceIconKey = "GOLD" | "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD";
export type ResourceIconPx = 48 | 72 | 96 | 256;
// "inline" sits in running text (~16-24 px); "large" fills art slots (~40-70 px).
export type ResourceIconSize = "inline" | "large";

const RESOURCE_ICON_FILE: Record<ResourceIconKey, string> = {
  GOLD: "gold",
  FOOD: "food",
  TITANIUM: "titanium",
  CRYSTAL: "crystal",
  UMBRITE: "umbrite",
  SHARD: "shard"
};

const RESOURCE_ICON_LABEL: Record<ResourceIconKey, string> = {
  GOLD: "Gold",
  FOOD: "Food",
  TITANIUM: "Titanium",
  CRYSTAL: "Crystal",
  UMBRITE: "Umbrite",
  SHARD: "Shard"
};

const RESOURCE_ICON_GLYPH: Record<ResourceIconKey, string> = {
  GOLD: "◉",
  FOOD: "🍞",
  TITANIUM: "⛏",
  CRYSTAL: "💎",
  UMBRITE: "🟣",
  SHARD: "✦"
};

// Tile deposit kinds map onto the strategic resource they feed.
const DEPOSIT_ICON_KEY: Readonly<Record<string, ResourceIconKey>> = {
  FARM: "FOOD",
  FISH: "FOOD",
  TITANIUM: "TITANIUM",
  GEMS: "CRYSTAL",
  UMBRITE: "UMBRITE"
};

export const isResourceIconKey = (value: string): value is ResourceIconKey =>
  Object.prototype.hasOwnProperty.call(RESOURCE_ICON_FILE, value);

export const depositIconKey = (resource: string | undefined): ResourceIconKey | undefined =>
  resource && Object.prototype.hasOwnProperty.call(DEPOSIT_ICON_KEY, resource) ? DEPOSIT_ICON_KEY[resource] : undefined;

export const resourceIconUrl = (key: ResourceIconKey, px: ResourceIconPx): string =>
  `/icons/resources/${RESOURCE_ICON_FILE[key]}-${px}.png`;

export const resourceIconGlyph = (resource: string): string =>
  isResourceIconKey(resource) ? RESOURCE_ICON_GLYPH[resource] : "•";

// Sized by CSS (.resource-icon-img, ~1em square) so it takes the slot the emoji
// glyph used to occupy in running text. Unknown keys fall back to the glyph.
export const resourceIconHtml = (resource: string, size: ResourceIconSize = "inline"): string => {
  if (!isResourceIconKey(resource)) return resourceIconGlyph(resource);
  const src = (px: ResourceIconPx): string => resourceIconUrl(resource, px);
  const srcset = size === "large" ? `${src(96)} 1x, ${src(256)} 2x` : `${src(48)} 1x, ${src(72)} 1.5x, ${src(96)} 2x`;
  return `<img class="resource-icon-img" src="${size === "large" ? src(96) : src(48)}" srcset="${srcset}" alt="${RESOURCE_ICON_LABEL[resource]}" draggable="false" decoding="async">`;
};

// At most one entry per ResourceIconKey (6), so this cache is bounded.
const canvasImages = new Map<ResourceIconKey, HTMLImageElement>();

const canvasImageFor = (key: ResourceIconKey): HTMLImageElement | undefined => {
  if (typeof Image === "undefined") return undefined;
  let image = canvasImages.get(key);
  if (!image) {
    image = new Image();
    image.decoding = "async";
    image.src = resourceIconUrl(key, 96);
    canvasImages.set(key, image);
  }
  return image;
};

const isDecoded = (image: HTMLImageElement): boolean => image.complete && image.naturalWidth > 0;

// Runs onReady once the PNG is usable on a canvas (immediately if it already is).
// Callers that paint into a cached texture use this to repaint after the load.
export const whenResourceIconReady = (key: ResourceIconKey, onReady: () => void): void => {
  const image = canvasImageFor(key);
  if (!image) return;
  if (isDecoded(image)) {
    onReady();
    return;
  }
  image.addEventListener("load", () => onReady(), { once: true });
};

// Draws the icon centred on (cx, cy) in a size×size box. Before the PNG has
// decoded it draws the text glyph instead, so the first frame is never empty.
export const drawResourceIconOnCanvas = (
  ctx: CanvasRenderingContext2D,
  key: ResourceIconKey,
  cx: number,
  cy: number,
  size: number,
  glyphFont = `${Math.round(size * 0.9)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif`
): void => {
  const image = canvasImageFor(key);
  if (image && isDecoded(image)) {
    ctx.drawImage(image, cx - size / 2, cy - size / 2, size, size);
    return;
  }
  ctx.save();
  ctx.font = glyphFont;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(RESOURCE_ICON_GLYPH[key], cx, cy + size * 0.03);
  ctx.restore();
};

// Steampunk resource icons, in two tiers. Small sizes (inline text, the
// resource bar, map badges) use the simple emoji-style SVGs under
// public/icons/simple, which stay legible at 16-30px. Large art slots use the
// detailed painted PNGs under public/icons/resources (96/256 px).
// HTML callers use resourceIconHtml; canvas callers (the 2D tile corner marker,
// 3D badge textures, minimap) use drawResourceIconOnCanvas, which falls back to
// the text glyph until the SVG has decoded. resourceIconGlyph stays the
// plain-text form for contexts that can't hold markup (canvas text, titles).

export type ResourceIconKey = "GOLD" | "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD";
export type ResourceIconPx = 96 | 256;
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
  GOLD: "Coin",
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

export const resourceSimpleIconUrl = (key: ResourceIconKey): string => `/icons/simple/${RESOURCE_ICON_FILE[key]}.svg`;

export const resourceIconUrl = (key: ResourceIconKey, px: ResourceIconPx): string =>
  `/icons/resources/${RESOURCE_ICON_FILE[key]}-${px}.png`;

export const resourceIconGlyph = (resource: string): string =>
  isResourceIconKey(resource) ? RESOURCE_ICON_GLYPH[resource] : "•";

// Sized by CSS (.resource-icon-img, ~1em square) so it takes the slot the emoji
// glyph used to occupy in running text. Unknown keys fall back to the glyph.
export const resourceIconHtml = (resource: string, size: ResourceIconSize = "inline"): string => {
  if (!isResourceIconKey(resource)) return resourceIconGlyph(resource);
  const alt = RESOURCE_ICON_LABEL[resource];
  if (size === "large") {
    return `<img class="resource-icon-img" src="${resourceIconUrl(resource, 96)}" srcset="${resourceIconUrl(resource, 96)} 1x, ${resourceIconUrl(resource, 256)} 2x" alt="${alt}" draggable="false" decoding="async">`;
  }
  return `<img class="resource-icon-img" src="${resourceSimpleIconUrl(resource)}" alt="${alt}" draggable="false" decoding="async">`;
};

// At most one entry per ResourceIconKey (6), so this cache is bounded.
const canvasImages = new Map<ResourceIconKey, HTMLImageElement>();

const canvasImageFor = (key: ResourceIconKey): HTMLImageElement | undefined => {
  if (typeof Image === "undefined") return undefined;
  let image = canvasImages.get(key);
  if (!image) {
    image = new Image();
    image.decoding = "async";
    image.src = resourceSimpleIconUrl(key);
    canvasImages.set(key, image);
  }
  return image;
};

const isDecoded = (image: HTMLImageElement): boolean => image.complete && image.naturalWidth > 0;

// Runs onReady once the icon is usable on a canvas (immediately if it already is).
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

// Draws the icon centred on (cx, cy) in a size×size box. Before the SVG has
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

// Plain-text messages (plunder alerts, feed entries) keep the text glyphs so
// they stay safe in any text-only sink; these swap the glyphs for the icon images at
// display time. The glyph set is the resource glyphs only.
const GLYPH_ICON_KEY = new Map<string, ResourceIconKey>(
  (Object.keys(RESOURCE_ICON_GLYPH) as ResourceIconKey[]).map((key) => [RESOURCE_ICON_GLYPH[key], key])
);
const GLYPH_PATTERN = new RegExp([...GLYPH_ICON_KEY.keys()].join("|"), "gu");
// Non-global twin for presence checks: .test() on a /g regex moves lastIndex,
// which matchAll would then inherit and skip the first glyph.
const HAS_GLYPH = new RegExp(GLYPH_PATTERN.source, "u");

// For strings that are already rendered as HTML (e.g. feed entry text).
export const resourceGlyphsToIconHtml = (html: string): string =>
  html.replace(GLYPH_PATTERN, (glyph) => {
    const key = GLYPH_ICON_KEY.get(glyph);
    return key ? resourceIconHtml(key) : glyph;
  });

// For elements that show untrusted text via textContent (e.g. the capture
// alert card, which includes player names): builds text nodes and <img>
// elements directly, so nothing in the text is ever parsed as HTML. Skips the
// rebuild when the text hasn't changed, since callers re-render every frame,
// but only while the element still holds the nodes built here: other code
// paths write the same element's textContent directly.
const lastIconText = new WeakMap<HTMLElement, { text: string; first: Node | null; count: number }>();

export const setTextWithResourceIcons = (el: HTMLElement, text: string): void => {
  // Most alert text has no resource glyphs: keep it a plain textContent write.
  if (!HAS_GLYPH.test(text)) {
    lastIconText.delete(el);
    if (el.textContent !== text) el.textContent = text;
    return;
  }
  const last = lastIconText.get(el);
  if (last && last.text === text && el.firstChild === last.first && el.childNodes.length === last.count) return;
  const doc = el.ownerDocument;
  const nodes: Node[] = [];
  let cursor = 0;
  for (const match of text.matchAll(GLYPH_PATTERN)) {
    const key = GLYPH_ICON_KEY.get(match[0]);
    const index = match.index ?? 0;
    if (!key) continue;
    if (index > cursor) nodes.push(doc.createTextNode(text.slice(cursor, index)));
    const img = doc.createElement("img");
    img.className = "resource-icon-img";
    img.src = resourceSimpleIconUrl(key);
    img.alt = RESOURCE_ICON_LABEL[key];
    img.draggable = false;
    nodes.push(img);
    cursor = index + match[0].length;
  }
  if (cursor < text.length) nodes.push(doc.createTextNode(text.slice(cursor)));
  el.replaceChildren(...nodes);
  lastIconText.set(el, { text, first: el.firstChild, count: el.childNodes.length });
};

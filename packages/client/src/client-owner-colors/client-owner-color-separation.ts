import { normalizeColorForThree } from "../client-three-color/client-three-color.js";

// Viewer-local colour spacing: players pick their own tile colours, so two
// neighbouring empires can easily end up in near-identical blues or reds. On
// each viewer's own client, any rival whose hue sits within
// SEPARATION_WINDOW_DEG of the viewer's own hue is remapped outward so it
// lands at least MIN_HUE_SEPARATION_DEG away. The remap is a linear
// compression of [0, WINDOW] onto [MIN, WINDOW] on each side of the viewer's
// hue, so several rivals near "me" stay in their original order and don't
// all collapse onto the same boundary hue. Rivals already further away than
// the window are untouched, and the viewer's own colour never changes.

export const MIN_HUE_SEPARATION_DEG = 42;
export const SEPARATION_WINDOW_DEG = 90;
/** Below this HSL saturation a colour reads as grey -- hue is meaningless, so it is left alone. */
const MIN_CHROMATIC_SATURATION = 0.18;
const CACHE_LIMIT = 512;

type Hsl = { readonly h: number; readonly s: number; readonly l: number };

const hexToHsl = (hex: string): Hsl => {
  const full = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const r = parseInt(full.slice(1, 3), 16) / 255;
  const g = parseInt(full.slice(3, 5), 16) / 255;
  const b = parseInt(full.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
};

const channel = (p: number, q: number, t: number): number => {
  const tt = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
};

const hslToHex = ({ h, s, l }: Hsl): string => {
  const hh = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const toHex = (v: number): string => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
  return `#${toHex(channel(p, q, hh + 1 / 3))}${toHex(channel(p, q, hh))}${toHex(channel(p, q, hh - 1 / 3))}`;
};

/** Signed shortest hue offset from `from` to `to`, in (-180, 180]. */
const signedHueOffset = (from: number, to: number): number => {
  const d = (((to - from) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
};

/** Pure remap of one rival colour against the viewer's colour. Both inputs are any CSS colour string. */
export const separateRivalColor = (rivalColor: string, myColor: string): string => {
  const rival = hexToHsl(normalizeColorForThree(rivalColor));
  const mine = hexToHsl(normalizeColorForThree(myColor));
  if (rival.s < MIN_CHROMATIC_SATURATION || mine.s < MIN_CHROMATIC_SATURATION) return rivalColor;
  const offset = signedHueOffset(mine.h, rival.h);
  const distance = Math.abs(offset);
  if (distance >= SEPARATION_WINDOW_DEG) return rivalColor;
  const direction = offset < 0 ? -1 : 1;
  const remapped = MIN_HUE_SEPARATION_DEG + (distance / SEPARATION_WINDOW_DEG) * (SEPARATION_WINDOW_DEG - MIN_HUE_SEPARATION_DEG);
  return hslToHex({ ...rival, h: mine.h + direction * remapped });
};

/**
 * Wraps an owner-colour lookup so every rival is spaced away from the
 * viewer's own colour. Memoised per (rival colour, my colour) pair since the
 * map renderers call this per tile per frame; the cache is bounded and simply
 * cleared when full (the key space is just the set of distinct player colours).
 */
export const createSeparatedOwnerColor = (
  baseColor: (ownerId: string) => string,
  myOwnerId: () => string | undefined
): ((ownerId: string) => string) => {
  const cache = new Map<string, string>();
  return (ownerId: string): string => {
    const color = baseColor(ownerId);
    const me = myOwnerId();
    if (!me || ownerId === me || ownerId.startsWith("barbarian")) return color;
    const myColor = baseColor(me);
    const key = `${color}|${myColor}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    if (cache.size >= CACHE_LIMIT) cache.clear();
    const separated = separateRivalColor(color, myColor);
    cache.set(key, separated);
    return separated;
  };
};

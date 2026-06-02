// -- palette ------------------------------------------------------------------

export const BASE_PALETTE: readonly string[] = [
  "#f3c300", "#00ffff", "#f032e6", "#2b3d26", "#ff0000", "#39ff14",
  "#aaffc3", "#1f77b4", "#b3446c", "#ffbc79", "#8bc34a", "#800000",
  "#e6beff", "#808000", "#008856", "#673ab7", "#9e9e9e", "#ff5722",
  "#ff1493", "#03a9f4", "#d2f53c", "#5f9ed1", "#be0032", "#e377c2",
  "#3cb44b", "#595959", "#46f0f0", "#a1caf1", "#fabebe", "#98df8a",
  "#c85200", "#9467bd", "#bcbd22", "#ffff00", "#654522", "#f38400",
  "#aa6e28", "#9c27b0", "#8db600", "#d0342c", "#e91e63", "#7f7f7f",
  "#c7c7c7", "#8c564b", "#009688", "#dbdb8d", "#cc0000", "#c2b280",
  "#17becf", "#f58231", "#ff9896", "#3f51b5", "#ffeb3b", "#875692",
  "#882d17", "#ff3131", "#2ca02c", "#0082c8", "#ff4500", "#604e97",
  "#0067a5", "#dc143c", "#b22222", "#2196f3", "#ffe119", "#ff2400",
  "#e68fac", "#ffa500", "#ff6700", "#f99379", "#c49c94", "#ffd8b1",
  "#e25822", "#dcd300", "#c5b0d5", "#cddc39", "#00bcd4", "#008080",
  "#ababab", "#f7b6d2", "#f44336", "#ff0f0f", "#9edae5", "#795548",
  "#ff7f0e", "#e6194b", "#cc1919", "#ba9b2c", "#65da0b", "#19cc58",
  "#2ca7ba", "#0b1dda", "#9719cc", "#ba2c75", "#f46734", "#dfe740",
  "#68d651", "#34f4aa", "#40a5e7", "#6a51d6",
] as const;

// -- reserved colours ---------------------------------------------------------

export const RESERVED_COLORS = new Set(["#2f3842"]); // barbarian grey

// -- normalise -----------------------------------------------------------------

/**
 * Trim + lowercase.  Accepts #rrggbb (stable) and #rgb (expanded).
 * Returns null for anything else.
 */
export function normalizeHex(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  return null;
}

// -- colour distance -----------------------------------------------------------

export function colorDistance(a: string, b: string): number {
  const ra = parseInt(a.slice(1, 3), 16);
  const ga = parseInt(a.slice(3, 5), 16);
  const ba = parseInt(a.slice(5, 7), 16);
  const rb = parseInt(b.slice(1, 3), 16);
  const gb = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  return Math.sqrt((ra - rb) ** 2 + (ga - gb) ** 2 + (ba - bb) ** 2);
}

// -- taken helpers -------------------------------------------------------------

export function isTaken(hex: string, taken: ReadonlySet<string>): boolean {
  return taken.has(hex) || RESERVED_COLORS.has(hex);
}

// -- HSL helpers (used by suggestAlternative) -----------------------------------

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function hexToHsl(hex: string): Hsl {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    case b: h = ((r - g) / d + 4) / 6; break;
  }
  return { h: h * 360, s, l };
}

function hslToHex(hsl: Hsl): string {
  const { h, s, l } = hsl;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60)       { r1 = c; g1 = x; b1 = 0; }
  else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
  else              { r1 = c; g1 = 0; b1 = x; }
  const toHex = (v: number) => Math.min(255, Math.round((v + m) * 255)).toString(16).padStart(2, "0");
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

// -- suggest alternative --------------------------------------------------------

const MIN_SUGGESTION_DISTANCE = 22;

export function suggestAlternative(desired: string, taken: ReadonlySet<string>): string {
  const hsl = hexToHsl(desired);

  for (let i = 1; i <= 60; i++) {
    // interleaved ± hue steps: 12°, -12°, 24°, -24°, …
    const sign = i % 2 === 1 ? 1 : -1;
    const hueShift = sign * Math.ceil(i / 2) * 12;
    const lightnessShifts = [0, 0.08, -0.08, 0.04, -0.04, 0.12, -0.12];

    for (const lShift of lightnessShifts) {
      const candidateHsl: Hsl = {
        h: (hsl.h + hueShift + 360) % 360,
        s: hsl.s,
        l: Math.max(0.05, Math.min(0.95, hsl.l + lShift)),
      };
      const candidate = hslToHex(candidateHsl);
      const norm = normalizeHex(candidate);
      if (!norm) continue;
      if (isTaken(norm, taken)) continue;
      if (colorDistance(norm, desired) < MIN_SUGGESTION_DISTANCE) continue;
      return norm;
    }
  }

  // fall through — pick from palette
  return pickSuggestedPalette(1, taken)[0] ?? "#ff00ff";
}

// -- palette selection ---------------------------------------------------------

export function pickSuggestedPalette(count: number, taken: ReadonlySet<string>): string[] {
  const free: string[] = [];
  for (const entry of BASE_PALETTE) {
    if (!isTaken(entry, taken)) free.push(entry);
  }

  if (free.length >= count) return free.slice(0, count);

  // generate additional colours by rotating hue evenly
  const result = [...free];
  let hue = 0;
  let iter = 0;
  while (result.length < count && iter++ < 720) {
    const generated = hslToHex({ h: hue, s: 0.6, l: 0.5 });
    if (!isTaken(generated, taken)) result.push(generated);
    hue = (hue + 1) % 360;
  }
  return result.slice(0, count);
}

// -- deterministic AI assignment ------------------------------------------------

function fnv32(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function assignUniqueColor(seed: string, taken: ReadonlySet<string>): string {
  const hash = fnv32(seed);
  const start = hash % BASE_PALETTE.length;

  // walk forward from hashed index
  for (let offset = 0; offset < BASE_PALETTE.length; offset++) {
    const idx = (start + offset) % BASE_PALETTE.length;
    const entry = BASE_PALETTE[idx];
    if (entry && !isTaken(entry, taken)) return entry;
  }

  // all 100 taken — generate via HSL rotation
  let hue = (hash % 360);
  for (let i = 0; i < 360; i++) {
    const generated = hslToHex({ h: hue, s: 0.6, l: 0.5 });
    if (!isTaken(generated, taken)) return generated;
    hue = (hue + 1) % 360;
  }

  // ultimate fallback (should never reach here)
  return "#ff00ff";
}

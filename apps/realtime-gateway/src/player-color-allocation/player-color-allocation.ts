import { isPerceptuallyClose, perceptualDistance } from "./perceptual-color-distance.js";

// -- palette ------------------------------------------------------------------

// Every pair here (and every entry against RESERVED_COLORS) is at least
// MIN_PERCEPTUAL_GAP apart in OKLab, so two neighbours never both get "blue".
// Order matters: assignUniqueColor starts at a hashed index and walks forward,
// so adjacent entries are deliberately far apart in hue.

export const BASE_PALETTE: readonly string[] = [
  "#f3c300", "#00ffff", "#f032e6", "#ff0000", "#39ff14", "#aaffc3",
  "#1f77b4", "#b3446c", "#ffbc79", "#8bc34a", "#800000", "#e6beff",
  "#808000", "#008856", "#673ab7", "#9e9e9e", "#ff5722", "#ff1493",
  "#03a9f4", "#d2f53c", "#be0032", "#e377c2", "#3cb44b", "#595959",
  "#a1caf1", "#fabebe", "#98df8a", "#c85200", "#9467bd", "#654522",
  "#f38400", "#aa6e28", "#9c27b0", "#e91e63", "#7f7f7f", "#c7c7c7",
  "#8c564b", "#009688", "#dbdb8d", "#c2b280", "#17becf", "#ff9896",
  "#3f51b5", "#875692", "#ffe119", "#ffa500", "#ffd8b1", "#c5b0d5",
  "#ba9b2c", "#65da0b", "#0b1dda", "#34f4aa",
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

/** Taken means an exact match OR a colour too close to look different on the map. */
export function isTaken(hex: string, taken: ReadonlySet<string>): boolean {
  if (taken.has(hex) || RESERVED_COLORS.has(hex)) return true;
  return isPerceptuallyClose(hex, taken) || isPerceptuallyClose(hex, RESERVED_COLORS);
}

/** Never-refuse fallback: the candidate whose nearest taken/reserved colour is furthest away. */
function mostDistinctCandidate(candidates: Iterable<string>, taken: ReadonlySet<string>): string {
  let best = "#ff00ff";
  let bestGap = -1;
  for (const candidate of candidates) {
    let nearest = Infinity;
    for (const other of taken) nearest = Math.min(nearest, perceptualDistance(candidate, other));
    for (const other of RESERVED_COLORS) nearest = Math.min(nearest, perceptualDistance(candidate, other));
    if (nearest > bestGap) { bestGap = nearest; best = candidate; }
  }
  return best;
}

function* hueWheel(saturation: number, lightness: number, startHue = 0): Generator<string> {
  for (let i = 0; i < 360; i++) yield hslToHex({ h: (startHue + i) % 360, s: saturation, l: lightness });
}

const FALLBACK_WHEEL: readonly (readonly [number, number])[] = [[0.6, 0.5], [0.75, 0.35], [0.5, 0.7]];

function* fallbackCandidates(startHue = 0): Generator<string> {
  for (const [s, l] of FALLBACK_WHEEL) yield* hueWheel(s, l, startHue);
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

  // BASE_PALETTE entries are already pairwise distinct, so `free` needs no extra spreading
  if (free.length >= count) return free.slice(0, count);

  // generate additional colours by rotating hue; each must also clear the ones already picked
  const result = [...free];
  for (const generated of fallbackCandidates()) {
    if (result.length >= count) break;
    if (!isTaken(generated, taken) && !isPerceptuallyClose(generated, result)) result.push(generated);
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

  // palette exhausted — generate via HSL rotation, then fall back to the most distinct colour
  const startHue = hash % 360;
  for (const generated of fallbackCandidates(startHue)) {
    if (!isTaken(generated, taken)) return generated;
  }
  return mostDistinctCandidate(fallbackCandidates(startHue), taken);
}

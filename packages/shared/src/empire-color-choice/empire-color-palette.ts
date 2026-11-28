// The colours an empire can be offered or suggested, shared by the gateway
// (which checks and suggests) and the client (which marks swatches and shows
// the same suggestion inline). Moved here from the gateway's
// player-color-allocation.ts so both sides walk the same candidates.

export const EMPIRE_COLOR_PALETTE: readonly string[] = [
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

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function hexToHsl(hex: string): Hsl {
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

export function hslToHex(hsl: Hsl): string {
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

/** Hue-wheel colours past the palette, at a few saturations and lightnesses, starting from `startHue`. */
export function* hueWheelCandidates(startHue: number): Generator<string> {
  for (const s of [0.65, 0.9]) {
    for (const l of [0.5, 0.4, 0.62, 0.3, 0.74]) {
      for (let step = 0; step < 120; step++) yield hslToHex({ h: (startHue + step * 3) % 360, s, l });
    }
  }
}

// An even 8x8x8 sRGB grid: covers the very dark, very light and greyish
// corners the palette and hue wheel skip, so a crowded map still has
// somewhere to put a new empire.
const GRID_LEVELS = [0, 36, 73, 109, 146, 182, 219, 255] as const;
const toHexByte = (v: number): string => v.toString(16).padStart(2, "0");

export function* rgbGridCandidates(): Generator<string> {
  for (const r of GRID_LEVELS) for (const g of GRID_LEVELS) for (const b of GRID_LEVELS) yield `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

let allCandidates: readonly string[] | undefined;

/** Every candidate colour, palette first, then the hue wheel, then the grid; no duplicates. */
export const allEmpireColorCandidates = (): readonly string[] => {
  if (allCandidates) return allCandidates;
  const seen = new Set<string>();
  for (const hex of EMPIRE_COLOR_PALETTE) seen.add(hex);
  for (const hex of hueWheelCandidates(0)) seen.add(hex);
  for (const hex of rgbGridCandidates()) seen.add(hex);
  allCandidates = [...seen];
  return allCandidates;
};

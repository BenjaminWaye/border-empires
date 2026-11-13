// Perceptual colour distance that also holds for red-green colour-blind
// viewers. Plain RGB distance (colorDistance) calls bright green #39ff14 and
// red #f44336 very different, but to a deuteranope or protanope both read as
// a similar olive/yellow-brown: the red-green axis collapses and only
// lightness and the blue-yellow axis are left. So two colours count as only
// as far apart as they look under the worst of normal, deuteranopic and
// protanopic vision, each measured in OKLab (a perceptually uniform space
// whose L axis is lightness).

type Rgb = readonly [number, number, number];
export type OkLab = { readonly l: number; readonly a: number; readonly b: number };

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

const hexToLinearRgb = (hex: string): Rgb => [
  srgbToLinear(parseInt(hex.slice(1, 3), 16) / 255),
  srgbToLinear(parseInt(hex.slice(3, 5), 16) / 255),
  srgbToLinear(parseInt(hex.slice(5, 7), 16) / 255)
];

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

// Dichromat simulation in linear RGB (Viénot, Brettel & Mollon 1999).
const DEUTERANOPIA: readonly Rgb[] = [
  [0.29275, 0.70725, 0],
  [0.29275, 0.70725, 0],
  [-0.02234, 0.02234, 1]
];
const PROTANOPIA: readonly Rgb[] = [
  [0.11238, 0.88762, 0],
  [0.11238, 0.88762, 0],
  [0.00401, -0.00401, 1]
];

const applyMatrix = (m: readonly Rgb[], [r, g, b]: Rgb): Rgb => [
  clamp01(m[0]![0] * r + m[0]![1] * g + m[0]![2] * b),
  clamp01(m[1]![0] * r + m[1]![1] * g + m[1]![2] * b),
  clamp01(m[2]![0] * r + m[2]![1] * g + m[2]![2] * b)
];

const linearRgbToOkLab = ([r, g, b]: Rgb): OkLab => {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  };
};

const okDistance = (x: OkLab, y: OkLab): number => Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b);

/** OKLab of a #rrggbb colour under normal vision. */
export const hexToOkLab = (hex: string): OkLab => linearRgbToOkLab(hexToLinearRgb(hex));

/** OKLab lightness (0 black .. 1 white) of a #rrggbb colour. */
export const okLightness = (hex: string): number => hexToOkLab(hex).l;

/** How a #rrggbb colour looks to a deuteranope, in OKLab. */
export const deuteranopeOkLab = (hex: string): OkLab => linearRgbToOkLab(applyMatrix(DEUTERANOPIA, hexToLinearRgb(hex)));

/**
 * Smallest OKLab distance between two #rrggbb colours across normal,
 * deuteranopic and protanopic vision. Around 0.1 is clearly distinct on a
 * map; below 0.05 the two read as the same colour.
 */
export const colorBlindSafeDistance = (a: string, b: string): number => {
  const la = hexToLinearRgb(a);
  const lb = hexToLinearRgb(b);
  return Math.min(
    okDistance(linearRgbToOkLab(la), linearRgbToOkLab(lb)),
    okDistance(linearRgbToOkLab(applyMatrix(DEUTERANOPIA, la)), linearRgbToOkLab(applyMatrix(DEUTERANOPIA, lb))),
    okDistance(linearRgbToOkLab(applyMatrix(PROTANOPIA, la)), linearRgbToOkLab(applyMatrix(PROTANOPIA, lb)))
  );
};

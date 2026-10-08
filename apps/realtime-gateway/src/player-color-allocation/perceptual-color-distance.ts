// Perceptual colour distance for the empire colour allocator. Two hexes are
// compared as OKLab points (Ottosson 2020), scaled x100 so a "just noticeable
// difference" is about 2 and a clearly different hue is 20+. Exact-hex
// comparison let neighbours both be "blue" (see docs/map-readability-plan.md).

/** Colours closer than this (OKLab distance x100) count as the same colour. */
export const MIN_PERCEPTUAL_GAP = 7;

const srgbToLinear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export const hexToOklab = (hex: string): [number, number, number] => {
  const r = srgbToLinear(parseInt(hex.slice(1, 3), 16));
  const g = srgbToLinear(parseInt(hex.slice(3, 5), 16));
  const b = srgbToLinear(parseInt(hex.slice(5, 7), 16));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ];
};

/** OKLab Euclidean distance x100 between two normalised #rrggbb colours. */
export const perceptualDistance = (a: string, b: string): number => {
  const [l1, a1, b1] = hexToOklab(a);
  const [l2, a2, b2] = hexToOklab(b);
  return 100 * Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
};

/** True when `hex` is within the minimum gap of any colour in `others`. */
export const isPerceptuallyClose = (hex: string, others: Iterable<string>, gap: number = MIN_PERCEPTUAL_GAP): boolean => {
  for (const other of others) if (perceptualDistance(hex, other) < gap) return true;
  return false;
};

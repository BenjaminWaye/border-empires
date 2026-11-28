// CIEDE2000 colour difference between two #rrggbb colours (Sharma, Wu &
// Dalal 2005, "The CIEDE2000 Color-Difference Formula"). sRGB is converted to
// CIE L*a*b* under D65; kL = kC = kH = 1. A difference of about 1 is the
// smallest a trained eye can see side by side.

export type Lab = { readonly l: number; readonly a: number; readonly b: number };

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

// D65 reference white.
const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;

const labF = (t: number): number => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116);

/** CIE L*a*b* (D65) of a #rrggbb colour. The caller must pass a valid 6-digit hex. */
export const hexToLab = (hex: string): Lab => {
  const r = srgbToLinear(parseInt(hex.slice(1, 3), 16) / 255);
  const g = srgbToLinear(parseInt(hex.slice(3, 5), 16) / 255);
  const b = srgbToLinear(parseInt(hex.slice(5, 7), 16) / 255);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / XN;
  const y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) / YN;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / ZN;
  const fx = labF(x);
  const fy = labF(y);
  const fz = labF(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
};

const DEG = Math.PI / 180;
const POW25_7 = 25 ** 7;

const hueAngle = (b: number, a: number): number => {
  if (a === 0 && b === 0) return 0;
  const h = Math.atan2(b, a) / DEG;
  return h >= 0 ? h : h + 360;
};

/** CIEDE2000 ΔE between two Lab colours. */
export const ciede2000Lab = (x: Lab, y: Lab): number => {
  const c1 = Math.hypot(x.a, x.b);
  const c2 = Math.hypot(y.a, y.b);
  const cBar7 = ((c1 + c2) / 2) ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + POW25_7)));
  const a1 = (1 + g) * x.a;
  const a2 = (1 + g) * y.a;
  const c1p = Math.hypot(a1, x.b);
  const c2p = Math.hypot(a2, y.b);
  const h1p = hueAngle(x.b, a1);
  const h2p = hueAngle(y.b, a2);

  const dL = y.l - x.l;
  const dC = c2p - c1p;
  let dh = 0;
  if (c1p * c2p !== 0) {
    dh = h2p - h1p;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(c1p * c2p) * Math.sin((dh * DEG) / 2);

  const lBar = (x.l + y.l) / 2;
  const cBarP = (c1p + c2p) / 2;
  let hBarP = h1p + h2p;
  if (c1p * c2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hBarP = (h1p + h2p) / 2;
    else hBarP = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const t =
    1 -
    0.17 * Math.cos((hBarP - 30) * DEG) +
    0.24 * Math.cos(2 * hBarP * DEG) +
    0.32 * Math.cos((3 * hBarP + 6) * DEG) -
    0.2 * Math.cos((4 * hBarP - 63) * DEG);
  const dTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2));
  const cBarP7 = cBarP ** 7;
  const rc = 2 * Math.sqrt(cBarP7 / (cBarP7 + POW25_7));
  const lBar50 = (lBar - 50) ** 2;
  const sl = 1 + (0.015 * lBar50) / Math.sqrt(20 + lBar50);
  const sc = 1 + 0.045 * cBarP;
  const sh = 1 + 0.015 * cBarP * t;
  const rt = -Math.sin(2 * dTheta * DEG) * rc;
  const termL = dL / sl;
  const termC = dC / sc;
  const termH = dH / sh;
  return Math.sqrt(termL * termL + termC * termC + termH * termH + rt * termC * termH);
};

/** CIEDE2000 ΔE between two #rrggbb colours. */
export const ciede2000 = (hexA: string, hexB: string): number => ciede2000Lab(hexToLab(hexA), hexToLab(hexB));

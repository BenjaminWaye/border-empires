const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const toHex = (value: number): string => Math.round(clamp01(value) * 255).toString(16).padStart(2, "0");
let browserColorContext: CanvasRenderingContext2D | undefined;

const hue2rgb = (p: number, q: number, t: number): number => {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
};

const hslToHex = (hueDegrees: number, saturationPercent: number, lightnessPercent: number): string => {
  const h = ((hueDegrees % 360) + 360) % 360 / 360;
  const s = clamp01(saturationPercent / 100);
  const l = clamp01(lightnessPercent / 100);
  if (s === 0) {
    const channel = toHex(l);
    return `#${channel}${channel}${channel}`;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgb(p, q, h + 1 / 3);
  const g = hue2rgb(p, q, h);
  const b = hue2rgb(p, q, h - 1 / 3);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export const normalizeColorForThree = (value: string, fallback = "#ffffff"): string => {
  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(trimmed)) return trimmed;
  if (typeof document !== "undefined") {
    if (!browserColorContext) {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      browserColorContext = canvas.getContext("2d") ?? undefined;
    }
    if (browserColorContext) {
      browserColorContext.fillStyle = fallback;
      browserColorContext.fillStyle = value;
      const normalized = browserColorContext.fillStyle.trim().toLowerCase();
      if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(normalized)) return normalized;
      const rgbMatch = normalized.match(
        /^rgba?\(\s*(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:\s*(?:\/|,)\s*[\d.]+%?)?\s*\)$/
      );
      if (rgbMatch) {
        const [, rRaw, gRaw, bRaw] = rgbMatch;
        return `#${Number(rRaw).toString(16).padStart(2, "0")}${Number(gRaw).toString(16).padStart(2, "0")}${Number(bRaw).toString(16).padStart(2, "0")}`;
      }
    }
  }
  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:\s*(?:\/|,)\s*[\d.]+%?)?\s*\)$/
  );
  if (rgbMatch) {
    const [, rRaw, gRaw, bRaw] = rgbMatch;
    return `#${Number(rRaw).toString(16).padStart(2, "0")}${Number(gRaw).toString(16).padStart(2, "0")}${Number(bRaw).toString(16).padStart(2, "0")}`;
  }
  const hslMatch = trimmed.match(
    /^hsla?\(\s*([-+]?\d*\.?\d+)(?:deg)?(?:\s*,\s*|\s+)(\d*\.?\d+)%(?:\s*,\s*|\s+)(\d*\.?\d+)%(?:\s*(?:\/|,)\s*[\d.]+%?)?\s*\)$/
  );
  if (hslMatch) {
    const [, hRaw, sRaw, lRaw] = hslMatch;
    return hslToHex(Number(hRaw), Number(sRaw), Number(lRaw));
  }
  return fallback;
};

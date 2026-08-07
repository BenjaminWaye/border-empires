// Small pure helpers extracted from client-map-3d.ts so that large render
// integration file stays at or under its line budget — see the repo's
// file-lines check (already-over-500 files may not grow).

// Lighten a hex color by mixing toward white. Used for the waypoint
// flag so its empire-color outline pops against owned territory
// rendered in the same hue at lower brightness.
export const lightenHex = (hex: string, amount: number): string => {
  const trimmed = hex.trim().replace(/^#/, "");
  let r: number;
  let g: number;
  let b: number;
  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
    r = parseInt(trimmed[0]! + trimmed[0]!, 16);
    g = parseInt(trimmed[1]! + trimmed[1]!, 16);
    b = parseInt(trimmed[2]! + trimmed[2]!, 16);
  } else if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    const value = parseInt(trimmed, 16);
    r = (value >> 16) & 0xff;
    g = (value >> 8) & 0xff;
    b = value & 0xff;
  } else {
    return hex;
  }
  const k = Math.max(0, Math.min(1, amount));
  const mix = (channel: number): number => Math.round(channel + (255 - channel) * k);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
};

export const parseTileKey = (tileKey: string): { x: number; y: number } | undefined => {
  const [xRaw, yRaw] = tileKey.split(",");
  const x = Number(xRaw);
  const y = Number(yRaw);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return { x, y };
};
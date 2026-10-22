// Draws one name along a world-space path on the overlay canvas. Used by both
// renderers: `project` is the runtime loop's worldToScreen, which in true-3D
// mode projects through the 3D camera onto the ground plane, so the letters
// foreshorten and follow the land in perspective exactly as they lie flat in
// 2D. Each glyph is placed and rotated individually along the projected path.

export type LabelStyle = {
  readonly font: (px: number) => string;
  readonly fill: string;
  readonly stroke: string;
  readonly alpha: number;
  /** Letter spacing never exceeds this many glyph heights per gap. */
  readonly maxSpacingEm: number;
  readonly minFontPx: number;
  readonly maxFontPx: number;
  /** Outline width as a fraction of the glyph height (a soft halo for ink-on-map lettering). */
  readonly strokeEm?: number;
};

export type NameLabelPath = {
  readonly text: string;
  readonly points: ReadonlyArray<{ x: number; y: number }>;
  readonly heightTiles: number;
  readonly spanTiles: number;
};

type ScreenPoint = { sx: number; sy: number };

const pointAt = (polyline: readonly ScreenPoint[], cumulative: readonly number[], distance: number): { x: number; y: number; angle: number } => {
  let index = 1;
  while (index < polyline.length - 1 && cumulative[index]! < distance) index += 1;
  const a = polyline[index - 1]!;
  const b = polyline[index]!;
  const segment = cumulative[index]! - cumulative[index - 1]!;
  const t = segment > 0 ? (distance - cumulative[index - 1]!) / segment : 0;
  return { x: a.sx + (b.sx - a.sx) * t, y: a.sy + (b.sy - a.sy) * t, angle: Math.atan2(b.sy - a.sy, b.sx - a.sx) };
};

/** Returns false when nothing was drawn (off-screen, degenerate, or too small to read). */
export const drawNameAlongPath = (
  ctx: CanvasRenderingContext2D,
  label: NameLabelPath,
  style: LabelStyle,
  project: (wx: number, wy: number) => ScreenPoint,
  viewport: { width: number; height: number }
): boolean => {
  if (style.alpha <= 0.01 || label.points.length < 2 || label.text.length === 0) return false;
  let polyline = label.points.map((p) => project(p.x, p.y));
  if (polyline.some((p) => !Number.isFinite(p.sx) || !Number.isFinite(p.sy))) return false;
  // Keep the text reading left to right on screen.
  if (polyline[polyline.length - 1]!.sx < polyline[0]!.sx) polyline = [...polyline].reverse();
  const cumulative = [0];
  for (let index = 1; index < polyline.length; index += 1) {
    const a = polyline[index - 1]!;
    const b = polyline[index]!;
    cumulative.push(cumulative[index - 1]! + Math.hypot(b.sx - a.sx, b.sy - a.sy));
  }
  const pathPx = cumulative[cumulative.length - 1]!;
  if (pathPx < 1) return false;
  let pathTiles = 0;
  for (let index = 1; index < label.points.length; index += 1) {
    pathTiles += Math.hypot(label.points[index]!.x - label.points[index - 1]!.x, label.points[index]!.y - label.points[index - 1]!.y);
  }
  pathTiles = Math.max(0.5, pathTiles);
  const tilePx = pathPx / pathTiles;
  const availablePx = tilePx * label.spanTiles;
  const mid = pointAt(polyline, cumulative, pathPx / 2);
  const margin = availablePx;
  if (mid.x < -margin || mid.y < -margin || mid.x > viewport.width + margin || mid.y > viewport.height + margin) return false;

  const chars = [...label.text];
  ctx.save();
  ctx.font = style.font(100);
  const widthsAt100 = chars.map((char) => ctx.measureText(char).width);
  const naturalAt100 = widthsAt100.reduce((sum, width) => sum + width, 0);
  // Largest font that fits the span, capped by the territory's thickness.
  const fontPx = Math.min(label.heightTiles * tilePx, (availablePx / naturalAt100) * 100, style.maxFontPx);
  // Never overflow the land: a name that would have to be smaller than readable is left out.
  if (fontPx < style.minFontPx) {
    ctx.restore();
    return false;
  }
  const scale = fontPx / 100;
  const glyphWidths = widthsAt100.map((width) => width * scale);
  const naturalPx = naturalAt100 * scale;
  const gaps = Math.max(1, chars.length - 1);
  const spacing = chars.length > 1 ? Math.max(0, Math.min((availablePx - naturalPx) / gaps, style.maxSpacingEm * fontPx)) : 0;
  const totalPx = naturalPx + spacing * (chars.length - 1);
  // Centre on the path; a name longer than the path runs on along the end tangents.
  let cursor = pathPx / 2 - totalPx / 2;
  ctx.font = style.font(fontPx);
  ctx.globalAlpha = style.alpha;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, fontPx * (style.strokeEm ?? 0.16));
  ctx.strokeStyle = style.stroke;
  ctx.fillStyle = style.fill;
  chars.forEach((char, index) => {
    const width = glyphWidths[index]!;
    const centre = cursor + width / 2;
    const clamped = Math.min(Math.max(centre, 0), pathPx);
    const anchor = pointAt(polyline, cumulative, clamped);
    const overshoot = centre - clamped;
    const x = anchor.x + Math.cos(anchor.angle) * overshoot;
    const y = anchor.y + Math.sin(anchor.angle) * overshoot;
    if (char !== " ") {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(anchor.angle);
      ctx.strokeText(char, 0, 0);
      ctx.fillText(char, 0, 0);
      ctx.restore();
    }
    cursor += width + spacing;
  });
  ctx.restore();
  return true;
};

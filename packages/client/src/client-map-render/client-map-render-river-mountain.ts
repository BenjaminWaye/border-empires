// 2D half of the river mountain (docs/river-mountains-plan.md, PR C; the 3D
// stream welling up at the mountain's base lives in
// client-map-3d-river-cascade.ts): a dark notch in the peak on the river's
// side and a falling stream from it to the mountain's corner nearest the
// river head. The land tiles on the cascade's edge draw the rest of it as a
// rapids band (client-map-render-river-edges.ts).
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { RiverMountainFace } from "../client-map-river-mountains/client-map-river-mountains.js";
import type { PeakShape } from "./client-map-render-mountain-peaks.js";

type Point = { readonly x: number; readonly y: number };

/** The stream down a river mountain's tile, in tile units (0..1, y down). */
export type RiverMountainStream = {
  /** Notch in the peak where the water comes out. */
  readonly source: Point;
  /** Foot of the peak. */
  readonly foot: Point;
  /** The tile corner the cascade leaves by (toward the river head). */
  readonly exit: Point;
};

const toroid = (from: number, to: number, size: number): number => {
  let d = to - from;
  if (d > size / 2) d -= size;
  if (d < -size / 2) d += size;
  return d;
};

const SOURCE_HEIGHT = 0.45; // fraction down the peak from its apex

export const riverMountainStream = (face: RiverMountainFace, wx: number, wy: number, mainPeak: PeakShape): RiverMountainStream => {
  const exit = { x: toroid(wx, face.exit.x, WORLD_WIDTH), y: toroid(wy, face.exit.y, WORLD_HEIGHT) };
  const side = exit.x > 0.5 ? 1 : -1;
  const { apex, baseLeft } = mainPeak;
  const source = { x: apex.x + side * 0.06, y: apex.y + (baseLeft.y - apex.y) * SOURCE_HEIGHT };
  const foot = { x: source.x + side * 0.08, y: baseLeft.y };
  return { source, foot, exit };
};

export const drawRiverMountainStream = (ctx: CanvasRenderingContext2D, stream: RiverMountainStream, px: number, py: number, size: number): void => {
  const X = (x: number): number => px + x * size;
  const Y = (y: number): number => py + y * size;
  // Notch: a dark slot above the water's source.
  ctx.fillStyle = "rgba(38, 38, 43, 0.9)";
  ctx.beginPath();
  ctx.moveTo(X(stream.source.x), Y(stream.source.y));
  ctx.lineTo(X(stream.source.x - 0.03), Y(stream.source.y - 0.12));
  ctx.lineTo(X(stream.source.x + 0.03), Y(stream.source.y - 0.12));
  ctx.closePath();
  ctx.fill();
  // Foam, then a thinner water core down the middle.
  for (const [color, width] of [["rgba(214, 236, 244, 0.95)", 0.07], ["rgba(60, 130, 160, 0.95)", 0.03]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size * width);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(X(stream.source.x), Y(stream.source.y));
    ctx.lineTo(X(stream.foot.x), Y(stream.foot.y));
    ctx.lineTo(X(stream.exit.x), Y(stream.exit.y));
    ctx.stroke();
  }
};

// 2D half of the river mountain (docs/rivers-remake-plan.md, "River mountains"; the 3D
// version lives in client-map-3d-river-cascade.ts): as in 3D, the river wells
// up at the mountain's foot -- a spring between two boulders at the base of
// the main peak, on the side facing the river head -- and a short banked
// stream runs over the tile to the mountain's corner nearest the head:
// straight there for a near (south) corner, round the tile's side for a far
// (north) one, so it never crosses the peak. The land tiles on the edge from
// that corner to the head draw the rest (client-map-render-river-edges.ts).
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { RiverMountainFace } from "../client-map-river-mountains/client-map-river-mountains.js";
import type { PeakShape } from "./client-map-render-mountain-peaks.js";
import { RIVER_BANK, RIVER_WATER } from "./client-map-render-river-edges.js";

type Point = { readonly x: number; readonly y: number };

/** The stream on a river mountain's tile, in tile units (0..1, y down). */
export type RiverMountainStream = {
  /** The spring, at the main peak's foot on the river's side. */
  readonly source: Point;
  /** The stream's course from the spring to the exit corner (inclusive). */
  readonly path: readonly Point[];
  /** The tile corner the stream leaves by (toward the river head). */
  readonly exit: Point;
  /** Boulders either side of the spring. */
  readonly boulders: readonly [Point, Point];
};

const toroid = (from: number, to: number, size: number): number => {
  let d = to - from;
  if (d > size / 2) d -= size;
  if (d < -size / 2) d += size;
  return d;
};

// The spring sits this far inside the peak's base corner, just below its base line.
const SPRING_INSET = 0.03;
const SPRING_DROP = 0.03;
// A far-corner stream runs this far in from the tile's side edge.
const SIDE_RUN_INSET = 0.07;
const BANK_WIDTH = 0.11;
const WATER_WIDTH = 0.065;
const SPRING_FOAM_RADIUS = 0.045;
const BOULDER_RADIUS = 0.032;

export const riverMountainStream = (face: RiverMountainFace, wx: number, wy: number, mainPeak: PeakShape): RiverMountainStream => {
  const exit = { x: toroid(wx, face.exit.x, WORLD_WIDTH), y: toroid(wy, face.exit.y, WORLD_HEIGHT) };
  const side = exit.x > 0.5 ? 1 : -1;
  const baseX = side > 0 ? mainPeak.baseRight.x : mainPeak.baseLeft.x;
  const source = { x: baseX - side * SPRING_INSET, y: mainPeak.baseLeft.y + SPRING_DROP };
  // A far (north) corner: run along the tile's side, clear of the peak.
  const path: Point[] =
    exit.y < source.y - 0.2 ? [source, { x: exit.x - side * SIDE_RUN_INSET, y: source.y }, { x: exit.x - side * SIDE_RUN_INSET, y: exit.y + SIDE_RUN_INSET }, exit] : [source, exit];
  const boulders: [Point, Point] = [
    { x: source.x - side * 0.06, y: source.y - 0.02 },
    { x: source.x + side * 0.01, y: source.y + 0.06 }
  ];
  return { source, path, exit, boulders };
};

export const drawRiverMountainStream = (ctx: CanvasRenderingContext2D, stream: RiverMountainStream, px: number, py: number, size: number): void => {
  const X = (x: number): number => px + x * size;
  const Y = (y: number): number => py + y * size;
  // Banks, then water down the middle (the same colours as the 2D rivers).
  for (const [color, width] of [[RIVER_BANK, BANK_WIDTH], [RIVER_WATER, WATER_WIDTH]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size * width);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    stream.path.forEach((p, i) => (i === 0 ? ctx.moveTo(X(p.x), Y(p.y)) : ctx.lineTo(X(p.x), Y(p.y))));
    ctx.stroke();
  }
  // White water where it wells up, between two boulders.
  ctx.fillStyle = "rgba(214, 236, 244, 0.9)";
  ctx.beginPath();
  ctx.arc(X(stream.source.x), Y(stream.source.y), Math.max(1, size * SPRING_FOAM_RADIUS), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(104, 106, 114, 0.95)";
  for (const b of stream.boulders) {
    ctx.beginPath();
    ctx.arc(X(b.x), Y(b.y), Math.max(1, size * BOULDER_RADIUS), 0, Math.PI * 2);
    ctx.fill();
  }
};

import type { DockPair, Tile } from "../client-types.js";
import { slipwayPlacementsFor, type SlipwayPlacement } from "./client-harbour-slipways.js";

// 2D canvas counterpart of the true-3D landing slipways
// (client-map-3d-harbour/client-map-3d-harbour-parts.ts): on each beach of a
// dock's landing ground, a timber ramp running into the water with iron rails
// and a landing barge hauled up it. Shrunk to the waterline beside another
// structure, like the 3D one; placement is shared (client-harbour-slipways.ts).

export type Slipway2DDeps = {
  readonly tileCenter: (x: number, y: number) => { sx: number; sy: number };
  readonly size: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  /** Only tiles in sight get a slipway, as only docks in sight get a marker. */
  readonly tileVisible: (x: number, y: number) => boolean;
};

const RAMP = "#7c5a39";
const RAIL = "#2a2826";
const HULL = "#5a2f26";
const CABIN = "#b9a98a";
// Matches SHRUNK_SLIPWAY_SCALE / SHRUNK_SLIPWAY_SEAWARD_OFFSET in the 3D part tables.
const SHRUNK_SCALE = 0.6;
const SHRUNK_OFFSET = 0.32;

const drawSlipway = (ctx: CanvasRenderingContext2D, slipway: SlipwayPlacement, sx: number, sy: number, size: number): void => {
  const scale = slipway.fit === "shrunk" ? SHRUNK_SCALE : 1;
  const offset = slipway.fit === "shrunk" ? SHRUNK_OFFSET : 0;
  const { dx, dy } = slipway.facing;
  // (along, across) in tiles: along points out to sea, across to its right.
  const at = (along: number, across: number): [number, number] => {
    const a = along * scale + offset;
    const c = across * scale;
    return [sx + (dx * a - dy * c) * size, sy + (dy * a + dx * c) * size];
  };
  const quad = (fromAlong: number, toAlong: number, halfWidth: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(...at(fromAlong, -halfWidth));
    ctx.lineTo(...at(toAlong, -halfWidth));
    ctx.lineTo(...at(toAlong, halfWidth));
    ctx.lineTo(...at(fromAlong, halfWidth));
    ctx.closePath();
    ctx.fill();
  };
  quad(-0.12, 0.62, 0.17, RAMP);
  ctx.strokeStyle = RAIL;
  ctx.lineWidth = Math.max(1, size * 0.03);
  for (const across of [-0.1, 0.1]) {
    ctx.beginPath();
    ctx.moveTo(...at(-0.12, across));
    ctx.lineTo(...at(0.62, across));
    ctx.stroke();
  }
  quad(0.08, 0.42, 0.11, HULL);
  quad(0.31, 0.4, 0.06, CABIN);
};

/** Always on: a landing slipway on every visible beach beside a dock. */
export const drawSlipways2D = (
  ctx: CanvasRenderingContext2D,
  state: { readonly dockPairs: readonly DockPair[]; readonly tiles: ReadonlyMap<string, Tile> },
  deps: Slipway2DDeps
): void => {
  if (state.dockPairs.length === 0) return;
  const size = deps.size;
  ctx.save();
  for (const slipway of slipwayPlacementsFor(state).values()) {
    if (!deps.tileVisible(slipway.x, slipway.y)) continue;
    const { sx, sy } = deps.tileCenter(slipway.x, slipway.y);
    if (sx < -size || sy < -size || sx > deps.viewportWidth + size || sy > deps.viewportHeight + size) continue;
    drawSlipway(ctx, slipway, sx, sy, size);
  }
  ctx.restore();
};

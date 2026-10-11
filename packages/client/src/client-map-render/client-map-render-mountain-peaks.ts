// 2D canvas mountain peaks, drawn per tile over the plain rock texture
// (which no longer bakes in one identical pair of peaks). Height, twin peak,
// snow and rock tint come from the same per-tile variation the true-3D
// massif uses (client-map-mountain-variation.ts), so a tall, snow-capped
// twin peak in 3D is also one in the 2D fallback.
import { terrainAt, visualLandBiomeAt, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import {
  mountainNeighbourhoodAt,
  mountainVariationAt,
  type MountainNeighbourhood,
  type MountainNeighbourhoodLookup,
  type MountainVariation
} from "../client-map-mountain-variation/client-map-mountain-variation.js";
import { riverMountainFaceAt } from "../client-map-river-mountains/client-map-river-mountains.js";
import { drawRiverMountainStream, riverMountainStream } from "./client-map-render-river-mountain.js";

type Point = { readonly x: number; readonly y: number };

/** One peak in tile-relative units (0..1 across the tile, y down). */
export type PeakShape = {
  readonly apex: Point;
  readonly baseLeft: Point;
  readonly baseRight: Point;
  readonly snow: boolean;
};

/** Low ridge shoulder from the tile centre to the middle of one tile edge. */
export type RidgeShape = { readonly toward: "north" | "east" | "south" | "west" };

export type MountainPeaksLayout = {
  /** Back to front: secondary peak (if any) first, main peak last. */
  readonly peaks: readonly PeakShape[];
  readonly ridges: readonly RidgeShape[];
  /** Rock lightness shift in [-1, 1]. */
  readonly tint: number;
};

const BASE_Y = 0.84;
const MAIN_HALF_WIDTH = 0.34;
const MAIN_HEIGHT = 0.5;
const APEX_LEAN = 0.12;
// Secondary peaks sit up and to the side: dz moves them up the tile (behind).
const SECONDARY_DEPTH_SQUASH = 0.6;
const SNOW_DEPTH = 0.3; // fraction of the peak's height the snow cap covers
const TINT_STEP = 14; // rgb units per unit of tint

const wrapWorldX = (x: number): number => ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
const wrapWorldY = (y: number): number => ((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;

const WORLD_LOOKUP: MountainNeighbourhoodLookup = {
  isMountainAt: (x, y) => terrainAt(x, y) === "MOUNTAIN",
  isColdAt: (x, y) => {
    const biome = visualLandBiomeAt(x, y);
    return biome === "TUNDRA" || biome === "SNOW";
  },
  wrapX: wrapWorldX,
  wrapY: wrapWorldY
};

/** The shared per-tile variation for a world tile, read from static worldgen terrain. */
export const mountainVariationForWorldTile = (wx: number, wy: number): MountainVariation =>
  mountainVariationAt(wx, wy, mountainNeighbourhoodAt(wx, wy, WORLD_LOOKUP));

/**
 * `riverMountain`: the tile is a river mountain (client-map-river-mountains.ts)
 * -- no second peak, so the stream down its face stays clear.
 */
export const mountainPeaksLayout = (wx: number, wy: number, neighbourhood: MountainNeighbourhood, riverMountain = false): MountainPeaksLayout => {
  const v = mountainVariationAt(wx, wy, neighbourhood);
  const lean = (v.yaw / (Math.PI / 2) - 0.5) * APEX_LEAN;
  const peak = (cx: number, baseY: number, halfWidth: number, height: number, snow: boolean): PeakShape => ({
    apex: { x: cx + lean, y: Math.max(0.04, baseY - height) },
    baseLeft: { x: cx - halfWidth, y: baseY },
    baseRight: { x: cx + halfWidth, y: baseY },
    snow
  });
  const peaks: PeakShape[] = [];
  const halfWidth = MAIN_HALF_WIDTH * v.footprintScale;
  if (v.secondary && !riverMountain) {
    const s = v.secondary.scale;
    peaks.push(
      peak(
        0.5 + v.secondary.dx,
        BASE_Y - 0.06 + v.secondary.dz * SECONDARY_DEPTH_SQUASH,
        halfWidth * s * 1.1,
        MAIN_HEIGHT * v.heightScale * s,
        v.snow && s >= 0.6
      )
    );
  }
  peaks.push(peak(0.5, BASE_Y, halfWidth, MAIN_HEIGHT * v.heightScale, v.snow));
  // Unlike 3D (one saddle per adjacent pair), each 2D tile is drawn on its
  // own, so it draws its half of the ridge toward every mountain neighbour.
  const ridges: RidgeShape[] = [];
  if (neighbourhood.north) ridges.push({ toward: "north" });
  if (neighbourhood.east) ridges.push({ toward: "east" });
  if (neighbourhood.south) ridges.push({ toward: "south" });
  if (neighbourhood.west) ridges.push({ toward: "west" });
  return { peaks, ridges, tint: v.tint };
};

const shade = (base: readonly [number, number, number], tint: number, alpha: number): string => {
  const d = Math.round(tint * TINT_STEP);
  const c = (n: number): number => Math.max(0, Math.min(255, n + d));
  return `rgba(${c(base[0])}, ${c(base[1])}, ${c(base[2])}, ${alpha})`;
};

// Warm brown rock, matching the 3D mountains (client-map-3d-mountain-palette.ts).
const LIT_ROCK: readonly [number, number, number] = [150, 114, 84];
const SHADED_ROCK: readonly [number, number, number] = [108, 80, 60];
const RIDGE_ROCK: readonly [number, number, number] = [128, 96, 70];

// East/west ridge: a sloped shoulder from the main peak's flank down to a
// low crest at the tile edge, where the neighbour's mirrored shoulder meets it.
const SHOULDER_INNER_X = 0.62;
const SHOULDER_INNER_CREST_Y = 0.6;
const SHOULDER_EDGE_CREST_Y = 0.7;
// North ridge: a small spur peak behind the main peak, so a north-south range
// reads as a chain of peaks (top-down, the tile to the south draws its own
// spur, which sits right behind this tile's main peak).
const SPUR = { x: 0.5, baseY: 0.36, halfWidth: 0.16, height: 0.2 } as const;

const drawRidge = (ctx: CanvasRenderingContext2D, ridge: RidgeShape, px: number, py: number, size: number, tint: number): void => {
  const at = (x: number, y: number): [number, number] => [px + x * size, py + y * size];
  if (ridge.toward === "south") return;
  if (ridge.toward === "north") {
    drawPeak(ctx, {
      apex: { x: SPUR.x, y: SPUR.baseY - SPUR.height },
      baseLeft: { x: SPUR.x - SPUR.halfWidth, y: SPUR.baseY },
      baseRight: { x: SPUR.x + SPUR.halfWidth, y: SPUR.baseY },
      snow: false
    }, px, py, size, tint);
    return;
  }
  const mirror = (x: number): number => (ridge.toward === "east" ? x : 1 - x);
  ctx.fillStyle = shade(RIDGE_ROCK, tint, 0.92);
  ctx.beginPath();
  ctx.moveTo(...at(mirror(0.5), BASE_Y));
  ctx.lineTo(...at(mirror(SHOULDER_INNER_X), SHOULDER_INNER_CREST_Y));
  ctx.lineTo(...at(mirror(1), SHOULDER_EDGE_CREST_Y));
  ctx.lineTo(...at(mirror(1), BASE_Y));
  ctx.closePath();
  ctx.fill();
};

const drawPeak = (ctx: CanvasRenderingContext2D, peak: PeakShape, px: number, py: number, size: number, tint: number): void => {
  const X = (x: number): number => px + x * size;
  const Y = (y: number): number => py + y * size;
  const midX = X(peak.apex.x);
  const baseY = Y(peak.baseLeft.y);
  // Sun from the upper left: lit left face, shaded right face.
  ctx.fillStyle = shade(LIT_ROCK, tint, 0.92);
  ctx.beginPath();
  ctx.moveTo(midX, Y(peak.apex.y));
  ctx.lineTo(X(peak.baseLeft.x), baseY);
  ctx.lineTo(midX, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(SHADED_ROCK, tint, 0.92);
  ctx.beginPath();
  ctx.moveTo(midX, Y(peak.apex.y));
  ctx.lineTo(midX, baseY);
  ctx.lineTo(X(peak.baseRight.x), baseY);
  ctx.closePath();
  ctx.fill();
  if (!peak.snow) return;
  // Snow cap: the top SNOW_DEPTH of the triangle, with a ragged lower edge.
  const t = SNOW_DEPTH;
  const capY = Y(peak.apex.y + (peak.baseLeft.y - peak.apex.y) * t);
  const leftX = midX + (X(peak.baseLeft.x) - midX) * t;
  const rightX = midX + (X(peak.baseRight.x) - midX) * t;
  ctx.fillStyle = "rgba(236, 240, 245, 0.92)";
  ctx.beginPath();
  ctx.moveTo(midX, Y(peak.apex.y));
  ctx.lineTo(leftX, capY);
  ctx.lineTo(midX - (midX - leftX) * 0.35, capY - size * 0.03);
  ctx.lineTo(midX, capY + size * 0.015);
  ctx.lineTo(midX + (rightX - midX) * 0.4, capY - size * 0.025);
  ctx.lineTo(rightX, capY);
  ctx.closePath();
  ctx.fill();
};

/** Draws a peaks layout into the tile square at (px, py). */
export const drawMountainPeaksLayout = (ctx: CanvasRenderingContext2D, layout: MountainPeaksLayout, px: number, py: number, size: number): void => {
  for (const ridge of layout.ridges) drawRidge(ctx, ridge, px, py, size, layout.tint);
  for (const peak of layout.peaks) drawPeak(ctx, peak, px, py, size, layout.tint);
};

export const drawMountainPeaks2D = (ctx: CanvasRenderingContext2D, wx: number, wy: number, px: number, py: number, size: number): void => {
  if (size < 8) return;
  const face = riverMountainFaceAt(wx, wy, WORLD_LOOKUP.isMountainAt);
  const layout = mountainPeaksLayout(wx, wy, mountainNeighbourhoodAt(wx, wy, WORLD_LOOKUP), face !== null);
  drawMountainPeaksLayout(ctx, layout, px, py, size);
  const main = layout.peaks[layout.peaks.length - 1];
  if (face && main) drawRiverMountainStream(ctx, riverMountainStream(face, wx, wy, main), px, py, size);
};

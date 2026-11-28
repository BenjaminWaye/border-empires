import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { PLANETARY_DEFENSE_ARMOR_COLOR } from "../client-planetary-defense-style.js";
import { drawSoldierGlyph2D } from "../client-map-render/client-map-render-planetary-defense-overlay.js";
import { activeInsurgentMarches, insurgentMarchPose, type InsurgentMarchOwnerAt } from "./client-insurgent-march.js";

// 2D-canvas side of the insurgent march (client-insurgent-march.ts): a small
// file of dark-grey soldiers walking from the camp to the tile the attack or
// expansion launches from, along the route the server timed, the same glyphs the camp's own patrol uses
// (client-map-render-planetary-defense-overlay.ts). Skipped below 10px tiles,
// as the patrol is; with reduced motion the soldiers still move along the
// route (that is the information) but don't swing their legs.

type WorldToScreen = (x: number, y: number, size: number, halfW: number, halfH: number) => { sx: number; sy: number };

// Three soldiers in a short column, each a little behind the one in front.
const COLUMN_OFFSETS = [0, -0.28, -0.56];
const COLUMN_SIDESTEP = [0, 0.14, -0.14];

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

let reducedMotionQuery: MediaQueryList | undefined;
const prefersReducedMotion = (): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  reducedMotionQuery ??= window.matchMedia("(prefers-reduced-motion: reduce)");
  return reducedMotionQuery.matches;
};

export type InsurgentMarches2DOptions = {
  /** Epoch ms (Date.now clock, like the server's deadlines). */
  nowEpochMs?: number;
  animate?: boolean;
  /** Tile owners as this client sees them, to drop a march whose camp or launch tile a House has taken. */
  ownerAt?: InsurgentMarchOwnerAt;
};

export function drawInsurgentMarches2D(
  ctx: CanvasRenderingContext2D,
  worldToScreen: WorldToScreen,
  size: number,
  halfW: number,
  halfH: number,
  options: InsurgentMarches2DOptions = {}
): void {
  const nowEpochMs = options.nowEpochMs ?? Date.now();
  const animate = options.animate ?? !prefersReducedMotion();
  if (size < 10) return;
  const marches = activeInsurgentMarches(nowEpochMs, options.ownerAt);
  if (marches.length === 0) return;
  const glyphH = Math.max(5, size * 0.34);
  ctx.save();
  for (const march of marches) {
    const point = insurgentMarchPose(march, nowEpochMs);
    // At sea the troops are aboard; the 2D map has no transport to draw, so they reappear on landing.
    if (!point || point.kind !== "WALK") continue;
    // Direction of the current step, so the column trails behind its leader.
    const ux = point.dirX;
    const uy = point.dirY;
    for (let i = 0; i < COLUMN_OFFSETS.length; i += 1) {
      const back = Math.min(COLUMN_OFFSETS[i]!, 0) * Math.min(1, point.progress * 4);
      const wx = point.x + ux * back - uy * COLUMN_SIDESTEP[i]!;
      const wy = point.y + uy * back + ux * COLUMN_SIDESTEP[i]!;
      // Place by the nearest whole tile (worldToScreen picks its on-screen
      // wrap copy) plus the fraction, so a march over the seam stays smooth.
      const tx = Math.round(wx);
      const ty = Math.round(wy);
      const center = worldToScreen(wrap(tx, WORLD_WIDTH), wrap(ty, WORLD_HEIGHT), size, halfW, halfH);
      const x = center.sx + (wx - tx) * size;
      const y = center.sy + (wy - ty) * size + glyphH * 0.45;
      const stride = animate ? Math.sin(nowEpochMs * 0.012 + i * 1.7) : 0;
      drawSoldierGlyph2D(ctx, x, y, glyphH, point.facingLeft, stride, PLANETARY_DEFENSE_ARMOR_COLOR);
    }
  }
  ctx.restore();
}

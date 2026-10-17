import type { ProspectSignature } from "@border-empires/shared";
import { prospectClueColor, prospectClueJitter, prospectCluePropCount, prospectCluePropOffset, prospectCluePropsAllowed } from "./client-prospect-clue/client-prospect-clue.js";
import type { Tile } from "./client-types.js";

const hexToRgba = (hex: string, alpha: number): string => {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
};

/** What the 2D forest overlay needs to draw a tile's clue (see client-map-facade.ts). */
export type ProspectClueDraw = {
  signature: ProspectSignature;
  /** False on tiles that draw their own feature (prospectCluePropsAllowed): tint only. */
  propsAllowed: boolean;
};

export const prospectClueDrawFor = (tile: Tile | undefined): ProspectClueDraw | undefined =>
  tile?.prospectSignature ? { signature: tile.prospectSignature, propsAllowed: prospectCluePropsAllowed(tile) } : undefined;

// Light ground wash under the props, matching the true-3D PROSPECT_CLUE_OPACITY's role.
const CLUE_TINT_ALPHA = 0.18;

const drawFerrousFlecks = (ctx: CanvasRenderingContext2D, wx: number, wy: number, px: number, py: number, size: number): void => {
  const count = prospectCluePropCount("FERROUS_DUST", wx, wy);
  for (let i = 0; i < count; i += 1) {
    const { ox, oy } = prospectCluePropOffset(wx, wy, i);
    const r = size * (0.035 + (prospectClueJitter(wx, wy, 83 + i * 5) + 0.5) * 0.035);
    const cx = px + size * (0.5 + ox);
    const cy = py + size * (0.5 + oy);
    ctx.fillStyle = "rgba(122, 52, 22, 0.85)";
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.25, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(196, 98, 48, 0.95)";
    ctx.beginPath();
    ctx.arc(cx - r * 0.2, cy - r * 0.1, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
};

const drawCrystalShards = (ctx: CanvasRenderingContext2D, wx: number, wy: number, px: number, py: number, size: number): void => {
  const count = prospectCluePropCount("REFRACTIVE_GROUND", wx, wy);
  // Slow twinkle so the ground reads as refracting light, staggered per tile.
  const glint = 0.55 + 0.45 * Math.sin(Date.now() / 700 + wx * 0.9 + wy * 0.6);
  for (let i = 0; i < count; i += 1) {
    const { ox, oy } = prospectCluePropOffset(wx, wy, i);
    const s = 0.8 + (prospectClueJitter(wx, wy, 109 + i * 3) + 0.5) * 0.6;
    const halfW = size * 0.05 * s;
    const height = size * 0.2 * s;
    const lean = prospectClueJitter(wx, wy, 113 + i * 3) * halfW * 1.6;
    const cx = px + size * (0.5 + ox);
    const baseY = py + size * (0.5 + oy) + height * 0.3;
    ctx.fillStyle = "rgba(63, 200, 230, 0.9)";
    ctx.beginPath();
    ctx.moveTo(cx + lean, baseY - height);
    ctx.lineTo(cx + halfW, baseY - height * 0.35);
    ctx.lineTo(cx, baseY);
    ctx.lineTo(cx - halfW, baseY - height * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(232, 252, 255, ${0.5 + glint * 0.45})`;
    ctx.beginPath();
    ctx.moveTo(cx + lean, baseY - height);
    ctx.lineTo(cx - halfW * 0.6, baseY - height * 0.4);
    ctx.lineTo(cx, baseY - height * 0.2);
    ctx.closePath();
    ctx.fill();
  }
};

/**
 * Clue ground wash plus the ferrous/refractive props. Blackwood's props are
 * trees, so the forest overlay draws those itself (client-map-render-forest-overlay.ts).
 * 2D twin of the true-3D client-map-3d-prospect-clue/ layer. Never marks the deposit tile.
 */
export const drawProspectSignatureOverlay = (ctx: CanvasRenderingContext2D, clue: ProspectClueDraw | undefined, wx: number, wy: number, px: number, py: number, size: number): void => {
  if (!clue || size < 10) return;
  ctx.save();
  ctx.fillStyle = hexToRgba(prospectClueColor(clue.signature), CLUE_TINT_ALPHA);
  ctx.fillRect(px, py, size, size);
  if (clue.propsAllowed) {
    if (clue.signature === "FERROUS_DUST") drawFerrousFlecks(ctx, wx, wy, px, py, size);
    else if (clue.signature === "REFRACTIVE_GROUND") drawCrystalShards(ctx, wx, wy, px, py, size);
  }
  ctx.restore();
};

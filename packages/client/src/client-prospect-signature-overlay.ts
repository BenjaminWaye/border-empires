import type { ProspectSignature } from "@border-empires/shared";
import { prospectClueJitter, prospectCluePropCount, prospectCluePropOffset, prospectCluePropsAllowed } from "./client-prospect-clue/client-prospect-clue.js";
import type { Tile } from "./client-types.js";
import { isTrue3DRendererActive } from "./client-renderer-mode.js";
import { terrainReliefPx, useTerrainReliefRenderer } from "./client-map-render/client-map-render.js";

/** What the 2D forest overlay needs to draw a tile's clue (see client-map-facade.ts). */
export type ProspectClueDraw = {
  signature: ProspectSignature;
  /** False on tiles that draw their own feature (prospectCluePropsAllowed): tint only. */
  propsAllowed: boolean;
};

/** `visible`: false for fogged/remembered tiles, which -- as in true-3D -- show no clue. */
export const prospectClueDrawFor = (tile: Tile | undefined, visible: boolean): ProspectClueDraw | undefined =>
  visible && tile?.prospectSignature ? { signature: tile.prospectSignature, propsAllowed: prospectCluePropsAllowed(tile) } : undefined;

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
  // Faint, slow twinkle staggered per tile: a clue, not a crystal deposit, so it stays understated.
  const glint = 0.5 + 0.5 * Math.sin(Date.now() / 900 + wx * 0.9 + wy * 0.6);
  for (let i = 0; i < count; i += 1) {
    const { ox, oy } = prospectCluePropOffset(wx, wy, i);
    const s = 0.6 + (prospectClueJitter(wx, wy, 109 + i * 3) + 0.5) * 0.3;
    const halfW = size * 0.04 * s;
    const height = size * 0.11 * s;
    const lean = prospectClueJitter(wx, wy, 113 + i * 3) * halfW * 1.6;
    const cx = px + size * (0.5 + ox);
    const baseY = py + size * (0.5 + oy) + height * 0.3;
    ctx.fillStyle = "rgba(196, 222, 220, 0.7)";
    ctx.beginPath();
    ctx.moveTo(cx + lean, baseY - height);
    ctx.lineTo(cx + halfW, baseY - height * 0.35);
    ctx.lineTo(cx, baseY);
    ctx.lineTo(cx - halfW, baseY - height * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(245, 252, 252, ${0.15 + glint * 0.35})`;
    ctx.beginPath();
    ctx.moveTo(cx + lean, baseY - height);
    ctx.lineTo(cx - halfW * 0.6, baseY - height * 0.4);
    ctx.lineTo(cx, baseY - height * 0.2);
    ctx.closePath();
    ctx.fill();
  }
};

/**
 * The ferrous/refractive props (no ground tint: a coloured wash read as territory and confused players). Blackwood's props are
 * trees, so the forest overlay draws those itself (client-map-render-forest-overlay.ts).
 * Drawn after the hills overlay so its mounds don't paint over them, lifted by the same relief offset as trees and mounds.
 * 2D twin of the true-3D client-map-3d-prospect-clue/ layer. Never marks the deposit tile.
 */
export const drawProspectSignatureOverlay = (ctx: CanvasRenderingContext2D, clue: ProspectClueDraw | undefined, wx: number, wy: number, px: number, py: number, size: number): void => {
  if (!clue?.propsAllowed || isTrue3DRendererActive() || size < 12) return;
  const reliefY = py - (useTerrainReliefRenderer ? Math.floor(terrainReliefPx(wx, wy, "LAND", size) * 0.45) : 0);
  ctx.save();
  if (clue.signature === "FERROUS_DUST") drawFerrousFlecks(ctx, wx, wy, px, reliefY, size);
  else if (clue.signature === "REFRACTIVE_GROUND") drawCrystalShards(ctx, wx, wy, px, reliefY, size);
  ctx.restore();
};

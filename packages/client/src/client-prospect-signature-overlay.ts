import type { ProspectSignature } from "@border-empires/shared";
import { blackwoodSwirlProgress, prospectClueJitter, prospectCluePropCount, prospectCluePropOffset, prospectCluePropsAllowed } from "./client-prospect-clue/client-prospect-clue.js";
import type { Tile } from "./client-types.js";
import { isTrue3DRendererActive } from "./client-renderer-mode.js";
import { terrainReliefPx, useTerrainReliefRenderer } from "./client-map-render/client-map-render.js";

/** What the 2D forest overlay needs to draw a tile's clue (see client-map-facade.ts). */
export type ProspectClueDraw = {
  signature: ProspectSignature;
  /** False on tiles that draw their own feature (prospectCluePropsAllowed): tint only. */
  propsAllowed: boolean;
};

/**
 * `visible`: false for fogged/remembered tiles, which -- as in true-3D -- show no clue.
 * `retired`: clues whose resource the player already revealed (retiredProspectClues): hidden.
 */
export const prospectClueDrawFor = (tile: Tile | undefined, visible: boolean, retired: ReadonlySet<ProspectSignature>): ProspectClueDraw | undefined =>
  visible && tile?.prospectSignature && !retired.has(tile.prospectSignature)
    ? { signature: tile.prospectSignature, propsAllowed: prospectCluePropsAllowed(tile) }
    : undefined;

const drawFerrousFlecks = (ctx: CanvasRenderingContext2D, wx: number, wy: number, px: number, py: number, size: number): void => {
  const count = prospectCluePropCount("FERROUS_DUST", wx, wy);
  for (let i = 0; i < count; i += 1) {
    const { ox, oy } = prospectCluePropOffset(wx, wy, i);
    // Tiny titanium-grey chips.
    const r = size * (0.02 + (prospectClueJitter(wx, wy, 83 + i * 5) + 0.5) * 0.017);
    const cx = px + size * (0.5 + ox);
    const cy = py + size * (0.5 + oy);
    ctx.fillStyle = "rgba(78, 82, 88, 0.85)";
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.25, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(168, 174, 181, 0.95)";
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

const SWIRL_TURNS = 2.2;
const SWIRL_POINTS = 32;

/**
 * Blackwood canopy: a purple spiral rising out of a forest tile and fading,
 * once every BLACKWOOD_SWIRL_PERIOD_S per tile (client-prospect-clue.ts) --
 * the 2D twin of client-map-3d-blackwood-swirl.ts. `py` is already lifted by
 * the tile's relief offset, like its trees.
 */
export const drawBlackwoodSwirl = (ctx: CanvasRenderingContext2D, wx: number, wy: number, px: number, py: number, size: number, nowS = Date.now() / 1000): void => {
  const k = blackwoodSwirlProgress(wx, wy, nowS);
  if (k === undefined) return;
  const alpha = Math.sin(Math.PI * k) * 0.85;
  if (alpha < 0.01) return;
  const cx = px + size * 0.5;
  const cy = py + size * (0.4 - 0.25 * k);
  const spin = k * 3;
  const grow = 0.7 + 0.6 * k;
  ctx.save();
  ctx.strokeStyle = `rgba(168, 97, 242, ${alpha})`;
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i <= SWIRL_POINTS; i += 1) {
    const t = i / SWIRL_POINTS;
    const angle = t * SWIRL_TURNS * Math.PI * 2 + spin;
    const radius = size * (0.04 + 0.14 * t) * grow;
    const x = cx + Math.cos(angle) * radius;
    // Flattened vertically so the spiral reads as lying over the canopy.
    const y = cy - t * size * 0.3 + Math.sin(angle) * radius * 0.45;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
};

/**
 * The ferrous/refractive props (no ground tint: a coloured wash read as territory and confused players). Blackwood's swirl
 * rises from the forest, so the forest overlay draws it (client-map-render-forest-overlay.ts).
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

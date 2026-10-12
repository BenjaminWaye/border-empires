import type { ProspectSignature } from "@border-empires/shared";
import { prospectClueColor } from "./client-prospect-clue/client-prospect-clue.js";

const hexToRgba = (hex: string, alpha: number): string => {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
};

/** Patterned clue that never names or marks a deposit tile -- 2D twin of the true-3D tint (client-map-3d-prospect-overlay-sync.ts). */
export const drawProspectSignatureOverlay = (ctx: CanvasRenderingContext2D, signature: ProspectSignature | undefined, px: number, py: number, size: number): void => {
  if (!signature || size < 10) return;
  const color = prospectClueColor(signature);
  ctx.save();
  ctx.fillStyle = hexToRgba(color, 0.3);
  ctx.fillRect(px, py, size, size);
  ctx.strokeStyle = hexToRgba(color, 0.75);
  ctx.lineWidth = Math.max(1, size * 0.035);
  ctx.setLineDash([Math.max(2, size * 0.12), Math.max(3, size * 0.18)]);
  ctx.beginPath();
  ctx.moveTo(px - size * 0.2, py + size * 0.75);
  ctx.lineTo(px + size * 0.65, py - size * 0.1);
  ctx.stroke();
  ctx.restore();
};

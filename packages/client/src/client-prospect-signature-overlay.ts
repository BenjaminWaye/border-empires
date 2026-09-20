import type { ProspectSignature } from "@border-empires/shared";

/** Quiet, patterned clue that never names or marks a deposit tile. */
export const drawProspectSignatureOverlay = (ctx: CanvasRenderingContext2D, signature: ProspectSignature | undefined, px: number, py: number, size: number): void => {
  if (!signature || size < 10) return;
  const color = signature === "BLACKWOOD_CANOPY" ? "rgba(34, 16, 48, 0.22)" : signature === "FERROUS_DUST" ? "rgba(102, 82, 70, 0.2)" : "rgba(150, 224, 236, 0.18)";
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(px, py, size, size);
  ctx.strokeStyle = color.replace(/0\.\d+\)/, "0.48)");
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.setLineDash([Math.max(2, size * 0.12), Math.max(3, size * 0.18)]);
  ctx.beginPath();
  ctx.moveTo(px - size * 0.2, py + size * 0.75);
  ctx.lineTo(px + size * 0.65, py - size * 0.1);
  ctx.stroke();
  ctx.restore();
};

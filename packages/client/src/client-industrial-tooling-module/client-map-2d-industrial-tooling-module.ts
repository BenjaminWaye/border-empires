import type { Tile } from "../client-types.js";

/** A small milling gantry on the AFC rim, readable without WebGL. */
export const drawIndustrialToolingModule2D = (
  ctx: CanvasRenderingContext2D, afc: NonNullable<Tile["afc"]>, cx: number, cy: number, size: number
): void => {
  if (!afc.modules?.includes("trade")) return;
  ctx.save();
  ctx.translate(cx, cy + size * 0.28);
  ctx.globalAlpha *= afc.status === "active" ? 1 : 0.55;
  ctx.fillStyle = "#22282c";
  ctx.fillRect(-size * 0.16, -size * 0.13, size * 0.32, size * 0.25);
  ctx.strokeStyle = "#d0ac64";
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.strokeRect(-size * 0.12, -size * 0.10, size * 0.24, size * 0.19);
  ctx.fillStyle = "#d0ac64";
  ctx.fillRect(-size * 0.14, -size * 0.12, size * 0.28, size * 0.045);
  ctx.fillStyle = "#94a9ad";
  ctx.fillRect(-size * 0.02, -size * 0.075, size * 0.04, size * 0.11);
  ctx.fillRect(-size * 0.065, size * 0.045, size * 0.13, size * 0.04);
  ctx.fillStyle = afc.status === "active" ? "#60e0ff" : "#7896a0";
  ctx.fillRect(-size * 0.025, -size * 0.08, size * 0.05, size * 0.025);
  ctx.restore();
};

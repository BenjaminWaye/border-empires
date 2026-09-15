import type { Tile } from "./client-types.js";

/**
 * 2D (non-3D-renderer) waystation overlay — the sibling of
 * drawWatchtower2D (client-map-2d-watchtower-overlay.ts), kept in its own
 * file for the same reason (see that file's doc comment). Mirrors the 3D
 * rig (client-map-3d-waystation-overlay.ts) in silhouette: a riveted anchor
 * plate and banded plinth carrying a tapered mast up to a caged lens
 * housing, a slanted-roof shelter with a door/window seam and stovepipe
 * vent, and strapped supply crates at the base. Dim/dormant before
 * activation, bright/emissive after. Unlike drawWatchtower2D there is no
 * pulse ring: activation is permanent, with no countdown to visualize.
 */
export const drawWaystation2D = (
  ctx: CanvasRenderingContext2D,
  tile: Pick<Tile, "x" | "y" | "waystation">,
  px: number,
  py: number,
  size: number,
  nowMs: number
): void => {
  const waystation = tile.waystation;
  if (!waystation) return;
  const cx = px + size / 2;
  const phase = ((tile.x * 73_193) ^ (tile.y * 51_487)) % 1000 / 1000;
  const pulsePhase = 0.5 + 0.5 * Math.sin(nowMs / 300 + phase * Math.PI * 2);
  const vaneAngle = nowMs * 0.00035 + phase * Math.PI * 2;

  // Shadow footprint.
  ctx.fillStyle = "rgba(20, 14, 6, 0.3)";
  ctx.beginPath();
  ctx.ellipse(cx, py + size * 0.9, size * 0.26, size * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  // Shelter, offset from the mast so both read clearly.
  const shx = cx - size * 0.22;
  const shTop = py + size * 0.62;
  ctx.fillStyle = "#3a352f";
  ctx.fillRect(shx - size * 0.1, shTop, size * 0.2, size * 0.16);
  // Slanted dark-iron roof.
  ctx.fillStyle = "#232019";
  ctx.beginPath();
  ctx.moveTo(shx - size * 0.13, shTop);
  ctx.lineTo(shx + size * 0.13, shTop);
  ctx.lineTo(shx + size * 0.09, shTop - size * 0.07);
  ctx.lineTo(shx - size * 0.06, shTop - size * 0.07);
  ctx.closePath();
  ctx.fill();
  // Stovepipe vent.
  ctx.strokeStyle = "#5a5148";
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.beginPath();
  ctx.moveTo(shx + size * 0.05, shTop - size * 0.07);
  ctx.lineTo(shx + size * 0.05, shTop - size * 0.13);
  ctx.stroke();
  // Door/window seam.
  ctx.fillStyle = "#161310";
  ctx.fillRect(shx - size * 0.03, shTop + size * 0.04, size * 0.06, size * 0.11);
  ctx.fillStyle = "rgba(90, 130, 140, 0.55)";
  ctx.fillRect(shx + size * 0.05, shTop + size * 0.03, size * 0.045, size * 0.035);

  // Riveted anchor plate + banded plinth at the mast's foot.
  ctx.fillStyle = "#2c2e34";
  ctx.fillRect(cx - size * 0.1, py + size * 0.83, size * 0.2, size * 0.045);
  ctx.fillStyle = "#5a5148";
  ctx.beginPath();
  ctx.arc(cx - size * 0.08, py + size * 0.855, size * 0.012, 0, Math.PI * 2);
  ctx.arc(cx + size * 0.08, py + size * 0.855, size * 0.012, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5a4527";
  ctx.fillRect(cx - size * 0.06, py + size * 0.74, size * 0.12, size * 0.1);
  ctx.strokeStyle = "#9c7a42";
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.06, py + size * 0.75);
  ctx.lineTo(cx + size * 0.06, py + size * 0.75);
  ctx.stroke();

  // Tapered brass mast with two ring bands.
  ctx.strokeStyle = "#9c7a42";
  ctx.lineWidth = Math.max(1.4, size * 0.05);
  ctx.beginPath();
  ctx.moveTo(cx, py + size * 0.74);
  ctx.lineTo(cx, py + size * 0.24);
  ctx.stroke();
  ctx.strokeStyle = "#c98d3f";
  ctx.lineWidth = Math.max(1, size * 0.025);
  for (const bandY of [py + size * 0.58, py + size * 0.4]) {
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.045, bandY);
    ctx.lineTo(cx + size * 0.045, bandY);
    ctx.stroke();
  }

  // Caged lens housing near the top — dim while dormant, glowing once activated.
  ctx.strokeStyle = "#a5864d";
  ctx.lineWidth = Math.max(1, size * 0.022);
  ctx.beginPath();
  ctx.ellipse(cx, py + size * 0.22, size * 0.11, size * 0.045, 0, 0, Math.PI * 2);
  ctx.stroke();
  const lensColor = waystation.activated ? `rgba(90, 220, 235, ${0.85 + pulsePhase * 0.15})` : "rgba(120, 160, 165, 0.7)";
  ctx.fillStyle = lensColor;
  ctx.beginPath();
  ctx.arc(cx, py + size * 0.22, size * (waystation.activated ? 0.09 + pulsePhase * 0.012 : 0.07), 0, Math.PI * 2);
  ctx.fill();
  if (waystation.activated) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = `rgba(120, 230, 240, ${0.16 + pulsePhase * 0.1})`;
    ctx.beginPath();
    ctx.arc(cx, py + size * 0.22, size * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Slowly rotating weathercock vane on the shelter roof — the only
  // animated piece, mirroring the 3D overlay's vane technique.
  ctx.strokeStyle = "#a5864d";
  ctx.lineWidth = Math.max(1, size * 0.018);
  const vx = Math.cos(vaneAngle) * size * 0.06;
  const vaneCenterX = shx + size * 0.05;
  const vaneCenterY = shTop - size * 0.16;
  ctx.beginPath();
  ctx.moveTo(vaneCenterX - vx, vaneCenterY);
  ctx.lineTo(vaneCenterX + vx, vaneCenterY);
  ctx.stroke();

  // Strapped supply crates around the mast footprint.
  ctx.fillStyle = "#8a6b3c";
  ctx.fillRect(cx - size * 0.24, py + size * 0.79, size * 0.11, size * 0.11);
  ctx.fillRect(cx + size * 0.13, py + size * 0.81, size * 0.1, size * 0.1);
  ctx.fillRect(cx - size * 0.02, py + size * 0.85, size * 0.09, size * 0.09);
  ctx.strokeStyle = "#6b5a3f";
  ctx.lineWidth = Math.max(1, size * 0.015);
  ctx.strokeRect(cx - size * 0.24, py + size * 0.79, size * 0.11, size * 0.11);
  ctx.strokeRect(cx + size * 0.13, py + size * 0.81, size * 0.1, size * 0.1);
  ctx.strokeRect(cx - size * 0.02, py + size * 0.85, size * 0.09, size * 0.09);
};

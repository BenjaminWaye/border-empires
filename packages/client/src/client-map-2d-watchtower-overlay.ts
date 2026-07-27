import type { Tile } from "./client-types.js";

/**
 * 2D (non-3D-renderer) watchtower overlay — the sibling of drawShardFallback
 * in client-map-render.ts, but kept in its own file so the already-oversized
 * client-runtime-loop.ts / client-map-render.ts only need a single call site
 * each (see AGENTS.md file-size discipline) instead of growing inline.
 *
 * Draws a small steampunk brass watchtower directly on the tile canvas: a
 * riveted body, a copper band, and a lantern beacon (dim while dormant,
 * glowing amber once activated). While `tile.watchtower.revealUntil` is in
 * the future (~10s after a player expands onto the tile), an amber pulse
 * ring flares outward — matching both the minimap marker (client-minimap.ts)
 * and the 3D lantern/reveal-ring (client-map-3d-watchtower-overlay.ts).
 */
export const drawWatchtower2D = (
  ctx: CanvasRenderingContext2D,
  tile: Pick<Tile, "x" | "y" | "watchtower">,
  px: number,
  py: number,
  size: number,
  nowMs: number
): void => {
  const watchtower = tile.watchtower;
  if (!watchtower) return;
  const cx = px + size / 2;
  const cy = py + size / 2;
  const phase = ((tile.x * 92_821) ^ (tile.y * 68_917)) % 1000 / 1000;
  const pulsePhase = 0.5 + 0.5 * Math.sin(nowMs / 260 + phase * Math.PI * 2);

  const revealing = typeof watchtower.revealUntil === "number" && watchtower.revealUntil > Date.now();
  if (revealing) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = `rgba(255, 179, 71, ${0.4 + pulsePhase * 0.35})`;
    ctx.lineWidth = Math.max(1.5, size * 0.05);
    ctx.beginPath();
    ctx.arc(cx, cy, size * (0.32 + pulsePhase * 0.3), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Shadow footprint.
  ctx.fillStyle = "rgba(20, 14, 6, 0.32)";
  ctx.beginPath();
  ctx.ellipse(cx, py + size * 0.82, size * 0.22, size * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  // Riveted brass tower body (tapered trapezoid).
  ctx.fillStyle = "#8a6a3a";
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.1, py + size * 0.78);
  ctx.lineTo(cx + size * 0.1, py + size * 0.78);
  ctx.lineTo(cx + size * 0.06, py + size * 0.32);
  ctx.lineTo(cx - size * 0.06, py + size * 0.32);
  ctx.closePath();
  ctx.fill();

  // Copper rivet band mid-tower.
  ctx.strokeStyle = "#c98d3f";
  ctx.lineWidth = Math.max(1, size * 0.035);
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.09, py + size * 0.58);
  ctx.lineTo(cx + size * 0.09, py + size * 0.58);
  ctx.stroke();

  // Lantern beacon on top — dim brass while dormant, glowing amber once activated.
  const lanternColor = watchtower.activated ? `rgba(255, 179, 71, ${0.85 + pulsePhase * 0.15})` : "rgba(150, 120, 80, 0.85)";
  ctx.fillStyle = lanternColor;
  ctx.beginPath();
  ctx.arc(cx, py + size * 0.26, size * (watchtower.activated ? 0.1 + pulsePhase * 0.015 : 0.08), 0, Math.PI * 2);
  ctx.fill();
  if (watchtower.activated) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = `rgba(255, 200, 130, ${0.18 + pulsePhase * 0.12})`;
    ctx.beginPath();
    ctx.arc(cx, py + size * 0.26, size * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
};

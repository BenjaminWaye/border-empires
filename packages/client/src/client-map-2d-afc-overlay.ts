import type { Tile } from "./client-types.js";

/**
 * 2D (non-3D-renderer) Automated Fabrication Complex (AFC) overlay — the
 * sibling of drawWatchtower2D (client-map-2d-watchtower-overlay.ts), kept
 * in its own file for the same reason (see that file's doc comment).
 *
 * The true-3D renderer (client-map-3d-fabrication-complex.ts) shows a full
 * procedural reactor spanning 9 tiles with 8 individually-modeled docking
 * sockets for each Module a player has commissioned. The 2D canvas path has
 * no equivalent per-instance 3D asset system, so this draws a single,
 * simpler glyph on the AFC's own tile only: a brass-rimmed octagonal
 * reactor housing with a pulsing cyan aether core, distinct from a town's
 * plain circular silhouette, but with no per-module sockets or docked-module
 * detail — matching this repo's established precedent (see the Barbarian/
 * "the Bleed" changelog entry) that the 2D accessibility fallback may be
 * visually simpler than 3D as long as that's stated plainly.
 */
export const drawAfc2D = (
  ctx: CanvasRenderingContext2D,
  tile: Pick<Tile, "x" | "y" | "afc">,
  px: number,
  py: number,
  size: number,
  nowMs: number
): void => {
  const afc = tile.afc;
  if (!afc) return;
  const cx = px + size / 2;
  const cy = py + size / 2;
  const phase = ((tile.x * 41_777) ^ (tile.y * 29_989)) % 1000 / 1000;
  const pulsePhase = 0.5 + 0.5 * Math.sin(nowMs / 320 + phase * Math.PI * 2);

  // Shadow footprint.
  ctx.fillStyle = "rgba(20, 14, 6, 0.34)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.32, size * 0.3, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  const octagon = (radius: number): void => {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI / 4) * i + Math.PI / 8;
      const px2 = cx + Math.cos(angle) * radius;
      const py2 = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
    }
    ctx.closePath();
  };

  // Blackened-iron reactor housing.
  ctx.fillStyle = "#23262b";
  octagon(size * 0.34);
  ctx.fill();

  // Aged-brass rim.
  ctx.strokeStyle = "#b08a45";
  ctx.lineWidth = Math.max(1, size * 0.035);
  octagon(size * 0.34);
  ctx.stroke();

  // Inner brass ring marking the module-socket band.
  ctx.strokeStyle = "rgba(176, 138, 69, 0.6)";
  ctx.lineWidth = Math.max(1, size * 0.02);
  octagon(size * 0.22);
  ctx.stroke();

  // Central aether core, breathing cyan while active.
  const active = afc.status === "active";
  const coreColor = active ? `rgba(96, 224, 255, ${0.75 + pulsePhase * 0.25})` : "rgba(120, 150, 160, 0.6)";
  ctx.fillStyle = coreColor;
  ctx.beginPath();
  ctx.arc(cx, cy, size * (active ? 0.09 + pulsePhase * 0.015 : 0.07), 0, Math.PI * 2);
  ctx.fill();
  if (active) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = `rgba(96, 224, 255, ${0.16 + pulsePhase * 0.12})`;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
};

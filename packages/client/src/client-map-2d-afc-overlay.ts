import type { Tile } from "./client-types.js";
import { AFC_DELIVERY_2D_PULSE_MS } from "./client-afc-module-delivery/client-afc-module-delivery-detect.js";

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
 *
 * Delivery pulse: the true-3D renderer plays a full orbital-streak delivery
 * when a Module docks (client-map-3d-afc-module-delivery-fx.ts). 2D has no
 * per-module visuals to animate, so `deliveryLandedAtMs` (performance.now()
 * of the landing, from state.afcModuleDeliveryLandedAt) instead briefly
 * flares the reactor core and a brass ring -- a plain "something arrived"
 * acknowledgement, not the full sequence.
 */
export const drawAfc2D = (
  ctx: CanvasRenderingContext2D,
  tile: Pick<Tile, "x" | "y" | "afc">,
  px: number,
  py: number,
  size: number,
  nowMs: number,
  deliveryLandedAtMs?: number
): void => {
  const afc = tile.afc;
  if (!afc) return;
  const cx = px + size / 2;
  const cy = py + size / 2;
  const phase = ((tile.x * 41_777) ^ (tile.y * 29_989)) % 1000 / 1000;
  const pulsePhase = 0.5 + 0.5 * Math.sin(nowMs / 320 + phase * Math.PI * 2);

  const deliveryT = deliveryLandedAtMs === undefined ? 1 : (nowMs - deliveryLandedAtMs) / AFC_DELIVERY_2D_PULSE_MS;
  const deliveryActive = deliveryT >= 0 && deliveryT < 1;
  const deliveryBoost = deliveryActive ? 1 - deliveryT : 0;

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
  }  if (deliveryActive) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = `rgba(255, 214, 140, ${0.5 * deliveryBoost})`;
    ctx.beginPath();
    ctx.arc(cx, cy, size * (0.12 + 0.2 * deliveryBoost), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 190, 90, ${0.8 * deliveryBoost})`;
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.beginPath();
    ctx.arc(cx, cy, size * (0.34 + 0.3 * deliveryT), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
};

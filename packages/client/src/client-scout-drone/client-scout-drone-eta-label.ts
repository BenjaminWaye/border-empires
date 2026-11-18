// The "Back in 2m 51s" pill over the player's scout drone while it flies, so the time until it
// docks (and Explore frees up) is read off the drone itself rather than a launch popup. One text
// rule and one pill drawing for both renderers: the 2D canvas draws it straight onto the map
// (client-map-render-2d-scout-drone/), true-3D paints it into a sprite texture over the drone
// (client-map-3d-scout-drone/client-map-3d-scout-drone-eta-label.ts).
import type { ScoutDroneFlight } from "@border-empires/shared";
import { formatCooldownShort } from "../client-app-runtime-utils.js";

const CYAN = "#4fd8ff";

/** The pill's text at `nowMs` (local clock), or undefined once the drone has docked. */
export const scoutDroneEtaText = (flight: ScoutDroneFlight | undefined, nowMs: number): string | undefined => {
  if (!flight || nowMs >= flight.landsAt) return undefined;
  return `Back in ${formatCooldownShort(flight.landsAt - nowMs)}`;
};

/** Draws the pill centred on (cx, cy). Leaves font, alignment and alpha as it found them. */
export const drawScoutDroneEtaPill = (ctx: CanvasRenderingContext2D, cx: number, cy: number, text: string, fontPx: number): void => {
  ctx.save();
  ctx.font = `700 ${fontPx}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const width = ctx.measureText(text).width + fontPx * 1.1;
  const height = fontPx * 1.6;
  const left = cx - width / 2;
  const top = cy - height / 2;
  const r = height / 2;
  ctx.beginPath();
  ctx.moveTo(left + r, top);
  ctx.lineTo(left + width - r, top);
  ctx.arc(left + width - r, cy, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(left + r, top + height);
  ctx.arc(left + r, cy, r, Math.PI / 2, (Math.PI * 3) / 2);
  ctx.closePath();
  ctx.globalAlpha = 0.78;
  ctx.fillStyle = "#06141c";
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = Math.max(1, fontPx * 0.1);
  ctx.strokeStyle = CYAN;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#e8fbff";
  ctx.fillText(text, cx, cy + fontPx * 0.04);
  ctx.restore();
};

// The "Back in 2m 51s" pill over the player's scout drone while it flies, so the time until it
// docks (and Explore frees up) is read off the drone itself rather than a launch popup. Drawn by the
// 2D canvas only (client-map-render-2d-scout-drone/); true-3D dropped its copy for the bottom flight
// pill (client-scout-drone-hud.ts) after players found it unreadably small (review 2026-11-21).
import type { ScoutDroneFlight } from "@border-empires/shared";
import { formatCooldownShort } from "../client-app-runtime-utils.js";

const CYAN = "#4fd8ff";

// The 2D renderer calls these every frame, so the text and font strings are rebuilt only when they
// change (once a second, or on a new tile size), keeping the drone's draw path allocation-free.
let lastLandsAt = Number.NaN;
let lastSeconds = -1;
let lastText = "";
let lastFontPx = -1;
let lastFont = "";

/** The pill's text at `nowMs` (local clock), or undefined once the drone has docked. */
export const scoutDroneEtaText = (flight: ScoutDroneFlight | undefined, nowMs: number): string | undefined => {
  if (!flight || nowMs >= flight.landsAt) return undefined;
  const remaining = flight.landsAt - nowMs;
  const seconds = Math.ceil(remaining / 1_000);
  if (flight.landsAt !== lastLandsAt || seconds !== lastSeconds) {
    lastLandsAt = flight.landsAt;
    lastSeconds = seconds;
    lastText = `Back in ${formatCooldownShort(remaining)}`;
  }
  return lastText;
};

/** Draws the pill centred on (cx, cy). Leaves font, alignment and alpha as it found them. */
export const drawScoutDroneEtaPill = (ctx: CanvasRenderingContext2D, cx: number, cy: number, text: string, fontPx: number): void => {
  ctx.save();
  if (fontPx !== lastFontPx) {
    lastFontPx = fontPx;
    lastFont = `700 ${fontPx}px sans-serif`;
  }
  ctx.font = lastFont;
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

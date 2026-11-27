// The Insurgent insignia (docs/lore/galactic-lore.md §4, "Insurgents"): a
// cracked garrison shield with two rank chevrons, the old planetary defense badge the Court's purge
// broke but did not wipe out. Stamped on every Insurgent FRONTIER tile so
// the ground they picket reads as theirs instead of as empty terrain; camps
// show their patrolling soldiers instead. One drawer for both renderers: the
// 2D map paints it per tile (client-map-render-planetary-defense-overlay.ts)
// and the 3D map paints it once into the ground decal's texture
// (client-map-3d-insurgent-insignia-overlay.ts). Pure canvas paths, no assets.
import { PLANETARY_DEFENSE_ARMOR_COLOR } from "./client-planetary-defense-style.js";

const RIM_COLOR = "#d5d9de";
const CRACK_COLOR = "#1a1d21";

/** Draws the insignia centred on (cx, cy); `size` is the shield's height in pixels. */
export const drawInsurgentInsignia = (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void => {
  const h = size;
  const w = size * 0.82;
  const top = cy - h * 0.5;
  const left = cx - w * 0.5;
  const right = cx + w * 0.5;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Heater shield with its upper-right corner broken off.
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(right - w * 0.28, top);
  ctx.lineTo(right - w * 0.16, top + h * 0.1);
  ctx.lineTo(right - w * 0.06, top + h * 0.06);
  ctx.lineTo(right, top + h * 0.2);
  ctx.lineTo(right, top + h * 0.42);
  ctx.quadraticCurveTo(right, top + h * 0.82, cx, top + h);
  ctx.quadraticCurveTo(left, top + h * 0.82, left, top + h * 0.42);
  ctx.closePath();
  ctx.fillStyle = PLANETARY_DEFENSE_ARMOR_COLOR;
  ctx.fill();
  ctx.lineWidth = Math.max(1, h * 0.08);
  ctx.strokeStyle = RIM_COLOR;
  ctx.stroke();

  // Two upward rank chevrons: the old defense-force badge.
  ctx.beginPath();
  for (const dy of [0, h * 0.2]) {
    ctx.moveTo(cx - w * 0.26, top + h * 0.5 + dy);
    ctx.lineTo(cx, top + h * 0.32 + dy);
    ctx.lineTo(cx + w * 0.26, top + h * 0.5 + dy);
  }
  ctx.lineWidth = Math.max(1, h * 0.09);
  ctx.strokeStyle = RIM_COLOR;
  ctx.globalAlpha *= 0.75;
  ctx.stroke();
  ctx.globalAlpha /= 0.75;

  // Jagged crack from the broken corner down through the shield.
  ctx.beginPath();
  ctx.moveTo(right - w * 0.16, top + h * 0.1);
  ctx.lineTo(cx + w * 0.12, top + h * 0.3);
  ctx.lineTo(cx + w * 0.2, top + h * 0.46);
  ctx.lineTo(cx + w * 0.04, top + h * 0.64);
  ctx.lineTo(cx + w * 0.1, top + h * 0.8);
  ctx.lineWidth = Math.max(1, h * 0.07);
  ctx.strokeStyle = CRACK_COLOR;
  ctx.stroke();
  ctx.restore();
};

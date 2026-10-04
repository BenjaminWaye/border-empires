// Extracted from client-map-render.ts (which is already over the repo's
// 500-line file cap) to keep that file from growing further — see
// AGENTS.md's file-size discipline.
//
// 2D-canvas stand-in for the true-3D renderer's Planetary Defense patrol
// (client-map-3d-planetary-defense-overlay.ts): two small dark-grey-armored
// soldier glyphs per barbarian-owned tile, walking between the SAME
// time-derived waypoints the 3D soldiers use (client-map-3d-planetary-
// defense-patrol.ts), so the patrol is animated without this stateless
// per-tile draw call keeping any frame-to-frame state. Pure canvas paths,
// like every other 2D overlay — no external image assets. It does not
// reproduce the 3D overlay's jog between tiles on a capture (that needs
// cross-frame tile diffing this draw call has nowhere to keep), and the 2D
// path has no marine battle squads, so combat itself isn't shown here.
import { PLANETARY_DEFENSE_ARMOR_COLOR } from "../client-planetary-defense-style.js";
import { patrolPoseAt, SOLDIERS_PER_TILE } from "../client-map-3d-planetary-defense-patrol.js";

const VISOR_COLOR = "rgba(150, 205, 255, 0.9)";
const OUTLINE_COLOR = "rgba(12, 14, 18, 0.85)";

const drawSoldier = (ctx: CanvasRenderingContext2D, x: number, y: number, h: number, facingLeft: boolean, stride: number): void => {
  const w = h * 0.42;
  ctx.fillStyle = PLANETARY_DEFENSE_ARMOR_COLOR;
  ctx.strokeStyle = OUTLINE_COLOR;
  ctx.lineWidth = Math.max(0.75, h * 0.06);
  ctx.lineCap = "round";

  // Legs: swing opposite each other while walking (stride in [-1, 1]).
  ctx.beginPath();
  ctx.moveTo(x - w * 0.18, y - h * 0.32);
  ctx.lineTo(x - w * 0.18 + stride * w * 0.3, y);
  ctx.moveTo(x + w * 0.18, y - h * 0.32);
  ctx.lineTo(x + w * 0.18 - stride * w * 0.3, y);
  ctx.save();
  ctx.lineWidth = Math.max(1, h * 0.14);
  ctx.strokeStyle = PLANETARY_DEFENSE_ARMOR_COLOR;
  ctx.stroke();
  ctx.restore();

  // Armored torso with shoulder plates.
  ctx.beginPath();
  ctx.moveTo(x - w * 0.5, y - h * 0.72);
  ctx.lineTo(x + w * 0.5, y - h * 0.72);
  ctx.lineTo(x + w * 0.32, y - h * 0.3);
  ctx.lineTo(x - w * 0.32, y - h * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Helmet with a glowing visor slit on the facing side.
  ctx.beginPath();
  ctx.arc(x, y - h * 0.84, h * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = VISOR_COLOR;
  const dir = facingLeft ? -1 : 1;
  ctx.fillRect(x + (dir < 0 ? -h * 0.15 : h * 0.02), y - h * 0.87, h * 0.13, h * 0.05);

  // Carried rifle.
  ctx.strokeStyle = OUTLINE_COLOR;
  ctx.lineWidth = Math.max(0.75, h * 0.07);
  ctx.beginPath();
  ctx.moveTo(x - dir * w * 0.2, y - h * 0.4);
  ctx.lineTo(x + dir * w * 0.75, y - h * 0.62);
  ctx.stroke();
};

export const drawPlanetaryDefenseOverlay = (
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  wx: number,
  wy: number,
  nowMs: number
): void => {
  if (size < 10) return;
  const h = Math.max(5, size * 0.34);
  ctx.save();
  for (let i = 0; i < SOLDIERS_PER_TILE; i += 1) {
    const pose = patrolPoseAt(wx, wy, i, nowMs);
    // Feet sit at the patrol point; +z is screen-down in the 2D top-down view.
    const x = px + size / 2 + pose.offsetX * size;
    const y = py + size / 2 + pose.offsetZ * size + h * 0.45;
    const stride = pose.walking ? Math.sin(nowMs * 0.012 + i * 1.7) : 0;
    drawSoldier(ctx, x, y, h, Math.sin(pose.yaw) < 0, stride);
  }
  ctx.restore();
};

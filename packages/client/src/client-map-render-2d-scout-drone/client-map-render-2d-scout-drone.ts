// The 2D canvas view of the player's scout drone (docs/explore-scout-plan.md), the flat
// counterpart of client-map-3d-scout-drone/. Same pieces, drawn cheaply: an instrument ring for
// the vision footprint (faint fill, crisp rim, dashed inner ring, tick marks) with a radar sweep
// turning inside it, the dashed route still ahead, a soft shadow, and a top-down drone -- a
// tapered steel fuselage with a glass nose, four ducted fans shown as motion-blurred discs with
// bronze rims, red/green nav lights and a cyan heading wedge. It uses the same pose as the 3D
// drone (client-map-3d-scout-drone-pose.ts), so it also lifts off and settles back at the AFC.
// Called from client-runtime-loop.ts only while the true-3D renderer is off. No per-frame
// allocation; on Reduce Motion the sweep and rotor streaks hold still.
import { SCOUT_DRONE_VISION_RADIUS, type ScoutDroneFlight } from "@border-empires/shared";
import { createScoutDronePose, scoutDronePoseAt } from "../client-map-3d-scout-drone/client-map-3d-scout-drone-pose.js";

const CYAN = "#4fd8ff";
const STEEL = "#262c34";
const STEEL_LIGHT = "#5b6673";
const BRONZE = "#b48a4c";
const ROTORS: ReadonlyArray<readonly [number, number]> = [[0.33, 0.33], [0.33, -0.33], [-0.33, 0.33], [-0.33, -0.33]];
const SWEEP_SLICES = 7;

const pose = createScoutDronePose();
const dash = [0, 0];
let reducedMotionQuery: MediaQueryList | null | undefined;
const prefersReducedMotion = (): boolean => {
  if (reducedMotionQuery === undefined) {
    reducedMotionQuery = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  }
  return reducedMotionQuery?.matches ?? false;
};

const drawFootprint = (ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, size: number, strength: number, sweep: number, pulse: number): void => {
  ctx.globalAlpha = 0.07 * strength;
  ctx.fillStyle = CYAN;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  // Radar sweep: a few slices fading behind a bright leading edge.
  const slice = 0.16;
  for (let i = 0; i < SWEEP_SLICES; i += 1) {
    ctx.globalAlpha = 0.22 * strength * (1 - i / SWEEP_SLICES) ** 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, sweep - (i + 1) * slice, sweep - i * slice);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = CYAN;
  ctx.globalAlpha = 0.85 * strength;
  ctx.lineWidth = Math.max(1, size * 0.04);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(sweep) * radius, cy + Math.sin(sweep) * radius);
  ctx.stroke();
  // Rim, ticks and a dashed inner range ring.
  ctx.globalAlpha = (0.55 + 0.3 * pulse) * strength;
  ctx.lineWidth = Math.max(1.5, size * 0.07);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, size * 0.04);
  ctx.beginPath();
  for (let i = 0; i < 24; i += 1) {
    const a = (i * Math.PI) / 12;
    const inner = i % 6 === 0 ? 0.87 : 0.93;
    ctx.moveTo(cx + Math.cos(a) * radius * inner, cy + Math.sin(a) * radius * inner);
    ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
  }
  ctx.stroke();
  ctx.globalAlpha = 0.35 * strength;
  dash[0] = Math.max(2, size * 0.12);
  dash[1] = Math.max(2, size * 0.12);
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
};

const drawRoute = (
  ctx: CanvasRenderingContext2D,
  flight: ScoutDroneFlight,
  startX: number,
  startY: number,
  tileCenterOnScreen: (wx: number, wy: number) => { sx: number; sy: number },
  size: number
): void => {
  const lastIndex = pose.returning ? flight.steps.length - 1 : flight.turnIndex;
  if (pose.stepIndex >= lastIndex) return;
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = CYAN;
  dash[0] = Math.max(3, size * 0.3);
  dash[1] = Math.max(2, size * 0.2);
  ctx.setLineDash(dash);
  ctx.lineWidth = Math.max(1.5, size * 0.07);
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  let prevX = startX;
  let prevY = startY;
  for (let i = pose.stepIndex + 1; i <= lastIndex; i += 1) {
    const step = flight.steps[i]!;
    const next = tileCenterOnScreen(step.x, step.y);
    // A segment that jumps across the wrap seam on screen is skipped, not drawn across the view.
    if (Math.hypot(next.sx - prevX, next.sy - prevY) > size * 3) ctx.moveTo(next.sx, next.sy);
    else ctx.lineTo(next.sx, next.sy);
    prevX = next.sx;
    prevY = next.sy;
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(prevX, prevY, size * 0.28, 0, Math.PI * 2);
  ctx.stroke();
};

const drawCraft = (ctx: CanvasRenderingContext2D, s: number, rotorPhase: number, pulse: number): void => {
  // Heading wedge ahead of the nose.
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = CYAN;
  ctx.beginPath();
  ctx.moveTo(s * 0.55, 0);
  ctx.lineTo(s * 0.95, -s * 0.16);
  ctx.lineTo(s * 0.95, s * 0.16);
  ctx.closePath();
  ctx.fill();
  // Struts.
  ctx.globalAlpha = 1;
  ctx.strokeStyle = BRONZE;
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.beginPath();
  for (const [ax, ay] of ROTORS) {
    ctx.moveTo(ax * s * 0.3, ay * s * 0.3);
    ctx.lineTo(ax * s * 0.8, ay * s * 0.8);
  }
  ctx.stroke();
  // Ducted fans: a blurred disc, a faint blade streak, a bronze rim.
  for (let k = 0; k < ROTORS.length; k += 1) {
    const [ax, ay] = ROTORS[k]!;
    const rx = ax * s;
    const ry = ay * s;
    const r = s * 0.17;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#c8dbe6";
    ctx.beginPath();
    ctx.arc(rx, ry, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = "#eef7ff";
    ctx.lineWidth = Math.max(1, s * 0.025);
    const a = (k % 2 === 0 ? 1 : -1) * rotorPhase + k;
    ctx.beginPath();
    ctx.arc(rx, ry, r * 0.65, a, a + 0.9);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = BRONZE;
    ctx.lineWidth = Math.max(1.2, s * 0.045);
    ctx.beginPath();
    ctx.arc(rx, ry, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Fuselage: a tapered teardrop, nose along +X, with a highlight and a bronze spine.
  ctx.fillStyle = STEEL;
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(s * 0.46, 0);
  ctx.bezierCurveTo(s * 0.42, s * 0.17, s * 0.1, s * 0.2, -s * 0.18, s * 0.14);
  ctx.quadraticCurveTo(-s * 0.46, s * 0.07, -s * 0.48, 0);
  ctx.quadraticCurveTo(-s * 0.46, -s * 0.07, -s * 0.18, -s * 0.14);
  ctx.bezierCurveTo(s * 0.1, -s * 0.2, s * 0.42, -s * 0.17, s * 0.46, 0);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = STEEL_LIGHT;
  ctx.beginPath();
  ctx.moveTo(s * 0.3, -s * 0.06);
  ctx.quadraticCurveTo(0, -s * 0.1, -s * 0.3, -s * 0.05);
  ctx.stroke();
  ctx.strokeStyle = BRONZE;
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.beginPath();
  ctx.moveTo(-s * 0.4, 0);
  ctx.lineTo(s * 0.05, 0);
  ctx.stroke();
  // Glass nose dome and sensor bay, nav lights.
  ctx.fillStyle = CYAN;
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 5 + 4 * pulse;
  ctx.beginPath();
  ctx.arc(s * 0.36, 0, s * 0.055, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff3b26";
  ctx.shadowColor = "#ff3b26";
  ctx.beginPath();
  ctx.arc(s * 0.4, -s * 0.43, s * 0.035, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3dff8a";
  ctx.shadowColor = "#3dff8a";
  ctx.beginPath();
  ctx.arc(s * 0.4, s * 0.43, s * 0.035, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
};

export const drawScoutDrone2D = (
  ctx: CanvasRenderingContext2D,
  flight: ScoutDroneFlight | undefined,
  nowMs: number,
  world: { width: number; height: number },
  tileCenterOnScreen: (wx: number, wy: number) => { sx: number; sy: number },
  size: number
): void => {
  if (!flight || !scoutDronePoseAt(flight, nowMs, world.width, world.height, pose)) return;
  const still = prefersReducedMotion();
  const center = tileCenterOnScreen(pose.x, pose.y);
  const cx = center.sx;
  const cy = center.sy;
  const pulse = still ? 0.75 : 0.5 + 0.5 * Math.sin(nowMs * 0.004);
  const sweep = still ? -Math.PI / 2 : (nowMs * 0.0016) % (Math.PI * 2);
  ctx.save();
  drawFootprint(ctx, cx, cy, (SCOUT_DRONE_VISION_RADIUS + 0.5) * size, size, pose.lift, sweep, pulse);
  drawRoute(ctx, flight, cx, cy, tileCenterOnScreen, size);
  // Shadow: drifts away and softens as the drone climbs.
  const s = Math.max(16, size * 1.35) * (0.75 + 0.25 * pose.lift);
  ctx.globalAlpha = 0.32 - 0.12 * pose.lift;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.ellipse(cx + s * 0.18 * pose.lift, cy + s * 0.32 * pose.lift, s * 0.42, s * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(cx, cy);
  ctx.rotate(pose.dirX !== 0 || pose.dirY !== 0 ? Math.atan2(pose.dirY, pose.dirX) : 0);
  drawCraft(ctx, s, still ? 0 : nowMs * 0.03, pulse);
  ctx.restore();
};

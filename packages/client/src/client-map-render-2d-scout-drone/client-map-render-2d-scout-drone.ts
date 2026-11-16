// The 2D canvas view of the player's scout drone (docs/explore-scout-plan.md), the flat
// counterpart of client-map-3d-scout-drone/. Same pieces, drawn cheaply: an instrument ring for
// the vision footprint (faint fill, crisp rim, dashed inner ring, tick marks) with a radar sweep
// turning inside it, the dashed route still ahead, a soft shadow, and the top-down Survey Quad
// (client-map-render-2d-scout-drone-craft.ts). It uses the same pose as the 3D drone
// (client-map-3d-scout-drone-pose.ts), so it also lifts off and settles back at the AFC, and the
// same running-lights rule: nav lights over home land, dark past the border.
// Called from client-runtime-loop.ts only while the true-3D renderer is off. No per-frame
// allocation; on Reduce Motion the sweep and rotor streaks hold still.
import { SCOUT_DRONE_VISION_RADIUS, type ScoutDroneFlight } from "@border-empires/shared";
import { createScoutDronePose, scoutDronePoseAt } from "../client-map-3d-scout-drone/client-map-3d-scout-drone-pose.js";
import {
  createScoutRunningLights,
  resetScoutRunningLights,
  scoutSensorLevel,
  updateScoutRunningLights,
  type ScoutHomeSource
} from "../client-map-3d-scout-drone/client-map-3d-scout-drone-running-lights.js";
import { drawScoutCraft2D } from "./client-map-render-2d-scout-drone-craft.js";

const CYAN = "#4fd8ff";
const SWEEP_SLICES = 7;

const pose = createScoutDronePose();
const runningLights = createScoutRunningLights();
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

export const drawScoutDrone2D = (
  ctx: CanvasRenderingContext2D,
  flight: ScoutDroneFlight | undefined,
  nowMs: number,
  world: { width: number; height: number },
  tileCenterOnScreen: (wx: number, wy: number) => { sx: number; sy: number },
  size: number,
  /** The client's tile ownership, for running dark past the border; absent keeps the lights on. */
  homeSource?: ScoutHomeSource
): void => {
  if (!flight || !scoutDronePoseAt(flight, nowMs, world.width, world.height, pose)) {
    resetScoutRunningLights(runningLights);
    return;
  }
  const lights = updateScoutRunningLights(runningLights, pose.x, pose.y, world, nowMs, homeSource);
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
  const rec = !pose.returning && (still || nowMs % 1_000 < 500) ? lights : 0;
  drawScoutCraft2D(ctx, s, still ? 0 : nowMs * 0.03, pulse, lights, scoutSensorLevel(lights), rec);
  ctx.restore();
};

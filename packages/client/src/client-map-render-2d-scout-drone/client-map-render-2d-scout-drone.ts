// The 2D canvas view of the player's scout drone (docs/explore-scout-plan.md), the flat
// counterpart of client-map-3d-scout-drone/: a soft cyan vision disc and ring around the drone
// (radius SCOUT_DRONE_VISION_RADIUS), a dashed route line to the turnaround tile (or home once it
// has turned), and a small top-down drone glyph -- steel hull, brass arms, four fan rings and a
// cyan sensor light -- pointing along its heading. Called from client-runtime-loop.ts only while
// the true-3D renderer is off.
import { SCOUT_DRONE_VISION_RADIUS, scoutDronePositionAt, scoutDroneStepIndexAt, type ScoutDroneFlight } from "@border-empires/shared";

const CYAN = "#4fd8ff";
const STEEL = "#2a3038";
const BRASS = "#a8844a";

/** Screen points of the rest of the drone's route, starting at the drone. */
export const scoutDroneRoute2D = (
  flight: ScoutDroneFlight,
  nowMs: number,
  world: { width: number; height: number },
  tileCenterOnScreen: (wx: number, wy: number) => { sx: number; sy: number }
): { drone: { sx: number; sy: number }; heading: number; route: Array<{ sx: number; sy: number }> } | undefined => {
  const at = scoutDronePositionAt(flight, nowMs, world.width, world.height);
  if (!at) return undefined;
  const drone = tileCenterOnScreen(at.x, at.y);
  const index = Math.max(0, scoutDroneStepIndexAt(flight, nowMs));
  const lastIndex = at.returning ? flight.steps.length - 1 : flight.turnIndex;
  const route = [drone];
  for (let i = index + 1; i <= lastIndex; i += 1) {
    const step = flight.steps[i]!;
    route.push(tileCenterOnScreen(step.x, step.y));
  }
  return { drone, heading: at.heading, route };
};

export const drawScoutDrone2D = (
  ctx: CanvasRenderingContext2D,
  flight: ScoutDroneFlight | undefined,
  nowMs: number,
  world: { width: number; height: number },
  tileCenterOnScreen: (wx: number, wy: number) => { sx: number; sy: number },
  size: number
): void => {
  if (!flight) return;
  const view = scoutDroneRoute2D(flight, nowMs, world, tileCenterOnScreen);
  if (!view) return;
  const { drone, heading, route } = view;
  const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.004);
  const radius = (SCOUT_DRONE_VISION_RADIUS + 0.5) * size;
  ctx.save();

  // Vision footprint: faint fill plus a pulsing ring.
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = CYAN;
  ctx.beginPath();
  ctx.arc(drone.sx, drone.sy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.45 + 0.3 * pulse;
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = Math.max(1.5, size * 0.08);
  ctx.stroke();

  // The rest of the route, dashed, with a small ring where it ends. Segments that jump across
  // the map's wrap seam on screen are skipped rather than drawn across the whole view.
  if (route.length >= 2) {
    ctx.globalAlpha = 0.85;
    ctx.setLineDash([Math.max(3, size * 0.3), Math.max(2, size * 0.2)]);
    ctx.lineWidth = Math.max(1.5, size * 0.07);
    ctx.beginPath();
    ctx.moveTo(route[0]!.sx, route[0]!.sy);
    for (let i = 1; i < route.length; i += 1) {
      const prev = route[i - 1]!;
      const next = route[i]!;
      if (Math.hypot(next.sx - prev.sx, next.sy - prev.sy) > size * 3) ctx.moveTo(next.sx, next.sy);
      else ctx.lineTo(next.sx, next.sy);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    const end = route[route.length - 1]!;
    ctx.beginPath();
    ctx.arc(end.sx, end.sy, size * 0.28, 0, Math.PI * 2);
    ctx.stroke();
  }

  // The drone, top-down, nose along its heading, with a drop shadow below it.
  const s = Math.max(10, size * 0.9);
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.ellipse(drone.sx + s * 0.12, drone.sy + s * 0.22, s * 0.32, s * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.translate(drone.sx, drone.sy);
  ctx.rotate(heading);
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = Math.max(1.5, s * 0.07);
  for (const [ax, ay] of [[0.3, 0.3], [0.3, -0.3], [-0.3, 0.3], [-0.3, -0.3]] as const) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(ax * s, ay * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ax * s, ay * s, s * 0.16, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = STEEL;
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(s * 0.42, 0); // nose
  ctx.lineTo(s * 0.2, s * 0.1);
  ctx.lineTo(-s * 0.32, s * 0.1);
  ctx.lineTo(-s * 0.32, -s * 0.1);
  ctx.lineTo(s * 0.2, -s * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = CYAN;
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 6 + 4 * pulse;
  ctx.beginPath();
  ctx.arc(s * 0.22, 0, s * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

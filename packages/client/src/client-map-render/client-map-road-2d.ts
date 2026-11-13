import type { RoadDirections } from "../client-road-network/client-road-network.js";

// 2D canvas counterpart of the true-3D maglev freight line
// (client-map-3d-monorail/): a twin-beam guideway with cyan coil lights, its
// shadow and pylon feet offset down-right so the line reads as elevated, and a
// lit switching deck at junctions. Trains are 3D-only; this fallback stays a
// static drawing to keep the low-end canvas path cheap.
const RAIL_SHADOW = "rgba(5, 8, 11, 0.28)";
const RAIL_STEEL = "rgba(43, 48, 56, 0.96)";
const RAIL_POWER = "rgba(95, 227, 255, 0.92)";
const PYLON_CONCRETE = "rgba(167, 173, 179, 0.95)";
const DECK_WARNING = "rgba(255, 59, 47, 0.95)";

export const drawRoadOverlay = (
  ctx: CanvasRenderingContext2D,
  directions: RoadDirections,
  px: number,
  py: number,
  size: number
): void => {
  const centerX = px + size / 2;
  const centerY = py + size / 2;
  const segments: Array<[number, number]> = [];
  const degree = Object.entries(directions).reduce(
    (count, [dir, enabled]) => count + (dir !== "terminal" && enabled ? 1 : 0),
    0
  );
  // Draw each shared road edge only once so the line runs center-to-center
  // across neighboring tiles instead of stopping at tile borders.
  if (directions.east) segments.push([centerX + size, centerY]);
  if (directions.south) segments.push([centerX, centerY + size]);
  if (directions.southeast) segments.push([centerX + size, centerY + size]);
  if (directions.southwest) segments.push([centerX - size, centerY + size]);
  if (segments.length === 0 && !directions.terminal && degree === 0) return;

  const lift = size * 0.07; // apparent rail height: shadow + feet sit this far down-right
  const gap = Math.max(1, size * 0.05);
  const beamWidth = Math.max(1, size * 0.03);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Ground shadow under the guideway.
  ctx.strokeStyle = RAIL_SHADOW;
  ctx.lineWidth = gap * 2 + beamWidth * 2;
  for (const [endX, endY] of segments) {
    ctx.beginPath();
    ctx.moveTo(centerX + lift, centerY + lift);
    ctx.lineTo(endX + lift, endY + lift);
    ctx.stroke();
  }

  // Pylon foot (every road tile but a town, which sits on its own plinth).
  if (!directions.terminal && size >= 10) {
    ctx.fillStyle = RAIL_SHADOW;
    ctx.beginPath();
    ctx.arc(centerX + lift, centerY + lift, size * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PYLON_CONCRETE;
    ctx.beginPath();
    ctx.arc(centerX + lift * 0.55, centerY + lift * 0.55, size * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }

  // Twin beams, each with its power rail.
  for (const [endX, endY] of segments) {
    const len = Math.hypot(endX - centerX, endY - centerY) || 1;
    const nx = -(endY - centerY) / len;
    const ny = (endX - centerX) / len;
    for (const sign of [-1, 1]) {
      const ox = nx * gap * sign, oy = ny * gap * sign;
      ctx.strokeStyle = RAIL_STEEL;
      ctx.lineWidth = beamWidth;
      ctx.beginPath();
      ctx.moveTo(centerX + ox, centerY + oy);
      ctx.lineTo(endX + ox, endY + oy);
      ctx.stroke();
      // Induction-coil lights: a dashed power line, like the 3D beam's coils.
      ctx.strokeStyle = RAIL_POWER;
      ctx.lineWidth = Math.max(0.5, beamWidth * 0.45);
      ctx.setLineDash([Math.max(1, size * 0.03), Math.max(1, size * 0.05)]);
      ctx.beginPath();
      ctx.moveTo(centerX + ox, centerY + oy);
      ctx.lineTo(endX + ox, endY + oy);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Switching deck at junctions.
  if (!directions.terminal && degree >= 3) {
    const r = Math.max(2, size * 0.13);
    ctx.fillStyle = RAIL_STEEL;
    ctx.strokeStyle = RAIL_POWER;
    ctx.lineWidth = Math.max(0.6, size * 0.012);
    ctx.beginPath();
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const x = centerX + Math.cos(a) * r, y = centerY + Math.sin(a) * r;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = DECK_WARNING;
    ctx.beginPath();
    ctx.arc(centerX, centerY, Math.max(0.8, size * 0.025), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

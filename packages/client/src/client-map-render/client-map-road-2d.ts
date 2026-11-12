import type { RoadDirections } from "../client-road-network/client-road-network.js";

// 2D canvas counterpart of the 3D "transit" road style: a dark alloy lane with
// a faint cyan halo and a bright cyan guidance line down the middle. Junctions
// and terminals get a ringed node.
const ROAD_HALO = "rgba(90, 220, 255, 0.18)";
const ROAD_DECK = "rgba(28, 36, 46, 0.92)";
const ROAD_CORE = "rgba(120, 235, 255, 0.95)";

export const drawRoadOverlay = (
  ctx: CanvasRenderingContext2D,
  directions: RoadDirections,
  px: number,
  py: number,
  size: number
): void => {
  const centerX = px + size / 2;
  const centerY = py + size / 2;
  const roadWidth = Math.max(1.4, size * 0.08);
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
  if (segments.length === 0 && !directions.terminal) return;

  const strokeSegments = (style: string, width: number): void => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    for (const [endX, endY] of segments) {
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }
  };

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  strokeSegments(ROAD_HALO, roadWidth * 1.9);
  strokeSegments(ROAD_DECK, roadWidth);
  strokeSegments(ROAD_CORE, Math.max(0.6, roadWidth * 0.26));
  if (directions.terminal || degree >= 3) {
    const hubRadius = directions.terminal ? Math.max(2, size * 0.085) : Math.max(1.5, size * 0.06);
    ctx.fillStyle = ROAD_DECK;
    ctx.beginPath();
    ctx.arc(centerX, centerY, hubRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ROAD_CORE;
    ctx.lineWidth = Math.max(0.6, hubRadius * 0.3);
    ctx.beginPath();
    ctx.arc(centerX, centerY, hubRadius * 0.72, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
};

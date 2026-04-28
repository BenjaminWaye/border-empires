import type { RoadDirections } from "./client-road-network.js";

const strokeRoadSegments = (
  ctx: CanvasRenderingContext2D,
  segments: Array<[number, number]>,
  centerX: number,
  centerY: number
): void => {
  for (const [endX, endY] of segments) {
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }
};

const drawRoadHub = (
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  colors: { outer: string; fill: string; highlight: string }
): void => {
  ctx.fillStyle = colors.outer;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = colors.fill;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.82, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = colors.highlight;
  ctx.beginPath();
  ctx.arc(centerX - radius * 0.18, centerY - radius * 0.2, radius * 0.38, 0, Math.PI * 2);
  ctx.fill();
};

export const drawRoadOverlay = (
  ctx: CanvasRenderingContext2D,
  directions: RoadDirections,
  px: number,
  py: number,
  size: number
): void => {
  const centerX = px + size / 2;
  const centerY = py + size / 2;
  const roadWidth = Math.max(2.2, size * 0.16);
  const segments: Array<[number, number]> = [];
  const degree = Object.entries(directions).reduce(
    (count, [dir, enabled]) => count + (dir !== "terminal" && enabled ? 1 : 0),
    0
  );

  // Draw each shared road edge only once so the path runs center-to-center
  // across neighboring tiles instead of stopping at tile borders.
  if (directions.east) segments.push([centerX + size, centerY]);
  if (directions.south) segments.push([centerX, centerY + size]);
  if (directions.southeast) segments.push([centerX + size, centerY + size]);
  if (directions.southwest) segments.push([centerX - size, centerY + size]);
  if (segments.length === 0 && !directions.terminal) return;

  const colors = {
    outer: "rgba(104, 72, 40, 0.82)",
    fill: "rgba(190, 156, 99, 0.96)",
    highlight: "rgba(226, 200, 139, 0.7)"
  };

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = colors.outer;
  ctx.lineWidth = roadWidth * 1.34;
  strokeRoadSegments(ctx, segments, centerX, centerY);

  ctx.strokeStyle = colors.fill;
  ctx.lineWidth = roadWidth;
  strokeRoadSegments(ctx, segments, centerX, centerY);

  ctx.strokeStyle = colors.highlight;
  ctx.lineWidth = Math.max(1.1, roadWidth * 0.32);
  strokeRoadSegments(ctx, segments, centerX, centerY);

  if (directions.terminal || degree >= 3) {
    const hubRadius = directions.terminal ? Math.max(2.8, size * 0.17) : Math.max(2.3, size * 0.135);
    drawRoadHub(ctx, centerX, centerY, hubRadius, colors);
  }

  ctx.restore();
};
